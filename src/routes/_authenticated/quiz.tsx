import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quiz")({
  head: () => ({ meta: [{ title: "Trivia · Uni-Corn Pool" }] }),
  component: QuizPage,
});

const TIERS = [
  { key: "beginner", label: "Beginner" },
  { key: "professional", label: "Professional" },
  { key: "expertise", label: "Expertise" },
] as const;

type TierKey = (typeof TIERS)[number]["key"];

function QuizPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [activeTier, setActiveTier] = useState<TierKey>("beginner");

  // All questions across all tiers (small dataset; lets us count per-tier completion accurately)
  // All questions across all tiers (correct_index is intentionally NOT selected -
  // answers are validated server-side via the submit_quiz_answer RPC).
  const allQs = useQuery({
    queryKey: ["quiz-questions-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quiz_questions")
        .select("id, tier, question, options, explanation, created_at")
        .order("created_at");
      return data ?? [];
    },
  });

  const progress = useQuery({
    queryKey: ["quiz-prog-all", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("quiz_progress").select("*").eq("user_id", user.id);
      return data ?? [];
    },
  });

  const tierTotals: Record<string, number> = { beginner: 0, professional: 0, expertise: 0 };
  for (const q of allQs.data ?? []) tierTotals[q.tier] = (tierTotals[q.tier] ?? 0) + 1;

  const answeredIds = new Set((progress.data ?? []).map((p) => p.question_id));
  const correctIds = new Set((progress.data ?? []).filter((p) => p.correct).map((p) => p.question_id));

  function tierAnsweredCount(tier: TierKey) {
    return (allQs.data ?? []).filter((q) => q.tier === tier && answeredIds.has(q.id)).length;
  }
  function tierCorrectCount(tier: TierKey) {
    return (allQs.data ?? []).filter((q) => q.tier === tier && correctIds.has(q.id)).length;
  }
  function tierCompleted(tier: TierKey) {
    const total = tierTotals[tier] ?? 0;
    return total > 0 && tierAnsweredCount(tier) >= total;
  }

  // Gating: a tier unlocks once every question in the prior tier has been answered.
  const tierLocked: Record<TierKey, boolean> = {
    beginner: false,
    professional: !tierCompleted("beginner"),
    expertise: !tierCompleted("beginner") || !tierCompleted("professional"),
  };

  async function answer(qid: string, idx: number) {
    if (answeredIds.has(qid)) return;
    const { data, error } = await (supabase as any).rpc("submit_quiz_answer", {
      p_question_id: qid,
      p_choice: idx,
    });
    if (error) {
      toast.error("Could not save your answer");
      return;
    }
    const correct = !!data?.correct;
    if (correct) toast.success("Correct!");
    else toast.message("Saved — try the next one");
    // Refetch so unlocks reflect immediately without a manual refresh
    await qc.invalidateQueries({ queryKey: ["quiz-prog-all"] });
    await qc.invalidateQueries({ queryKey: ["quiz-progress"] });
  }

  const activeQuestions = (allQs.data ?? []).filter((q) => q.tier === activeTier);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold">World Cup Trivia</h1>
        <p className="mt-2 text-muted-foreground">
          Three tiers, 100 questions total. Answer every question in a tier to unlock the next.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {TIERS.map((t) => {
          const total = tierTotals[t.key] ?? 0;
          const done = tierAnsweredCount(t.key);
          const locked = tierLocked[t.key];
          const isActive = activeTier === t.key;
          const prior = t.key === "professional" ? "Beginner" : t.key === "expertise" ? "Professional" : null;
          return (
            <button
              key={t.key}
              onClick={() => !locked && setActiveTier(t.key)}
              disabled={locked}
              className={`rounded-2xl border p-5 text-left transition ${
                isActive ? "border-primary bg-primary/5" : "border-border bg-surface"
              } ${locked ? "cursor-not-allowed opacity-60" : "hover:border-primary/50"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t.label}
                </p>
                {locked ? (
                  <Lock className="size-4" />
                ) : done === total && total > 0 ? (
                  <CheckCircle2 className="size-4 text-pitch" />
                ) : null}
              </div>
              <p className="mt-2 font-display text-2xl font-bold">
                {done}/{total}
              </p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                />
              </div>
              {locked && prior && (
                <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Complete {prior} to unlock
                </p>
              )}
              {!locked && total > 0 && tierCorrectCount(t.key) > 0 && (
                <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {tierCorrectCount(t.key)} correct
                </p>
              )}
            </button>
          );
        })}
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold capitalize">{activeTier} questions</h2>
        {activeQuestions.length === 0 && (
          <p className="text-sm text-muted-foreground">No questions in this tier yet.</p>
        )}
        {activeQuestions.map((q, idx) => {
          const answered = answeredIds.has(q.id);
          const wasCorrect = correctIds.has(q.id);
          const opts = q.options as string[];
          return (
            <div key={q.id} className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <div className="mb-4 flex items-start gap-3">
                <span className="font-display text-lg font-bold text-primary">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <p className="text-base font-semibold">{q.question}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {opts.map((opt, i) => (
                  <button
                    key={i}
                    disabled={answered}
                    onClick={() => answer(q.id, i)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                      answered
                        ? "border-border bg-muted text-muted-foreground"
                        : "border-border bg-background hover:border-primary hover:bg-primary/5"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {answered && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {wasCorrect ? "✓ Correct. " : "✗ "}
                  {q.explanation}
                </p>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
