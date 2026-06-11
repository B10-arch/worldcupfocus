import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Gemini model used to generate each day's quiz. gemini-2.5-flash is fast,
// cheap, and available on Google AI Studio keys (the AIza... kind).
const GEMINI_MODEL = "gemini-2.5-flash";
const QUESTIONS_PER_DAY = 10;
const GEMINI_TIMEOUT_MS = 25_000;

type AiQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  tier: "beginner" | "professional" | "expertise";
};

/**
 * Ensure today's quiz exists. Called once when the quiz page loads.
 *  1. Ask the DB whether today's quiz was already generated (NPT day).
 *  2. If not, generate 10 fresh questions with Gemini and persist them.
 * Idempotent and safe under concurrency — the DB no-ops if a quiz already
 * exists. If there's no API key or Gemini fails, this returns quietly and
 * get_daily_quiz() falls back to the question pool, so the page never breaks.
 */
export const ensureDailyQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data: status, error: statusErr } = await (supabase as any).rpc("daily_quiz_status");
    if (statusErr) throw new Error(statusErr.message);
    if (status?.exists) {
      return { generated: false, reason: "already_exists" as const, date: status.quiz_date };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // No key configured — let the pool-based fallback handle today.
      return { generated: false, reason: "no_api_key" as const, date: status?.quiz_date };
    }

    const avoid: string[] = Array.isArray(status?.recent_questions) ? status.recent_questions : [];
    const questions = await generateWithGemini(apiKey, String(status?.quiz_date ?? ""), avoid);

    const { data, error } = await (supabase as any).rpc("upsert_daily_quiz_from_ai", {
      p_questions: questions,
    });
    if (error) throw new Error(error.message);

    return { generated: !!data?.created, reason: "generated" as const, date: status?.quiz_date };
  });

async function generateWithGemini(
  apiKey: string,
  date: string,
  avoid: string[],
): Promise<AiQuestion[]> {
  const avoidList = avoid
    .slice(0, 60)
    .map((q) => `- ${q}`)
    .join("\n");

  const prompt = [
    `Generate exactly ${QUESTIONS_PER_DAY} multiple-choice quiz questions for ${date}.`,
    "Topic: football/soccer, centered on the 2026 FIFA World Cup (co-hosted by the USA, Mexico and Canada) plus general World Cup history and football knowledge.",
    "",
    "Rules:",
    "- Each question must have exactly 4 options.",
    "- `correct_index` is the 0-based index of the correct option. Vary which position is correct across the set (do NOT always use 0).",
    `- Mix difficulty: about 4 "beginner", 3 "professional", 3 "expertise".`,
    "- Questions must be factually accurate, unambiguous, and have a single correct answer.",
    "- Each needs a concise one-sentence explanation.",
    "- Make the set fresh and varied for today. Do NOT reuse, rephrase, or closely mirror any of these recently-used questions:",
    avoidList || "- (none yet)",
  ].join("\n");

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 1.1,
      topP: 0.95,
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            question: { type: "STRING" },
            options: { type: "ARRAY", items: { type: "STRING" } },
            correct_index: { type: "INTEGER" },
            explanation: { type: "STRING" },
            tier: { type: "STRING", enum: ["beginner", "professional", "expertise"] },
          },
          required: ["question", "options", "correct_index", "explanation", "tier"],
          propertyOrdering: ["question", "options", "correct_index", "explanation", "tier"],
        },
      },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const json: any = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini returned no content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  const valid = (Array.isArray(parsed) ? parsed : [])
    .map(normalizeQuestion)
    .filter((q): q is AiQuestion => q !== null)
    .slice(0, QUESTIONS_PER_DAY);

  if (valid.length < 4) {
    throw new Error(`Gemini produced too few valid questions (${valid.length})`);
  }
  return valid;
}

function normalizeQuestion(raw: any): AiQuestion | null {
  if (!raw || typeof raw.question !== "string") return null;
  const options = Array.isArray(raw.options)
    ? raw.options.map((o: any) => String(o)).filter((o: string) => o.trim().length > 0)
    : [];
  if (options.length < 2) return null;

  let idx = Number(raw.correct_index);
  if (!Number.isInteger(idx)) idx = 0;
  idx = Math.min(Math.max(idx, 0), options.length - 1);

  const tier = raw.tier === "beginner" || raw.tier === "expertise" ? raw.tier : "professional";

  return {
    question: raw.question.trim(),
    options,
    correct_index: idx,
    explanation: typeof raw.explanation === "string" ? raw.explanation.trim() : "",
    tier,
  };
}
