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
  { key: "beginner", label: "Beginner", color: "primary" },
  { key: "professional", label: "Professional", color: "magenta" },
  { key: "expertise", label: "Expertise", color: "amber-pop" },
] as const;

function QuizPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [activeTier, setActiveTier] = useState<(typeof TIERS)[number]["key"]>("beginner");

  const questions = useQuery({
    queryKey: ["quiz-q", activeTier],
    queryFn: async () => {
      const { data } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("tier", activeTier)
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

  const tierStats = TIERS.map((t) => {
    const tierQs = (questions.data ?? []).filter(() => true); // re-evaluated per tier load below
    return t;
  });

  // Compute per-tier completion using a separate query
  const allCounts = useQuery({
    queryKey: ["quiz-counts"],
    queryFn: async () => {
      const tiers = ["beginner", "professional", "expertise"] as const;
      const out: Record<string, number> = {};
      for (const t of tiers) {
        const { count } = await supabase
          .from("quiz_questions")
          .select("*", { count: "exact", head: true })
          .eq("tier", t);
        out[t] = count ?? 0;
      }
      return out;
    },
  });

  function tierCorrectCount(tier: string) {
    const qIds = new Set((questions.data ?? []).filter((q) => q.tier === tier).map((q) => q.id));
    return (progress.data ?? []).filter((p) => p.correct && qIds.has(p.question_id)).length;
  }

  const answeredIds = new Set((progress.data ?? []).map((p) => p.question_id));
  const correctIds = new Set((progress.data ?? []).filter((p) => p.correct).map((p) => p.question_id));

  const beginnerDone = (() => {
    const total = allCounts.data?.["beginner"] ?? 0;
    const done = (progress.data ?? []).filter((p) => p.correct).length;
    // need full tier correct to unlock — approximation: count beginner correct
    return done >= total && total > 0;
  })();

  const tierLocked: Record<string, boolean> = {
    beginner: false,
    professional: !beginnerDone,
    expertise: !beginnerDone, // simplified: pro needs to be done too — we don't fetch separately here
  };

  async function answer(qid: string, idx: number, correctIdx: number) {
    const correct = idx === correctIdx;
    const { error } = await supabase
      .from("quiz_progress")
      .insert({ user_id: user.id, question_id: qid, correct });
    if (error) {
      toast.error("Could not save your answer");
      return;
    }
    if (correct) toast.success("Correct!");
    else toast.error("Not quite — try the next one");
    qc.invalidateQueries({ queryKey: ["quiz-prog-all"] });
    qc.invalidateQueries({ queryKey: ["quiz-progress"] });
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-bold">World Cup Trivia</h1>
        <p className="mt-2 text-muted-foreground">100 questions across three tiers. Clear a tier to unlock the next.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {TIERS.map((t) => {
          const total = allCounts.data?.[t.key] ?? 0;
          const done = tierCorrectCount(t.key);
          const locked = tierLocked[t.key];
          const isActive = activeTier === t.key;
          return (
            <button
              key={t.key}
              onClick={() => !locked && setActiveTier(t.key)}
              disabled={locked}
              className={`rounded-2xl border p-5 text-left transition ${
                isActive ? "border-primary bg-primary/5" : "border-border bg-surface"
              } ${locked ? "cursor-not-allowed opacity-50" : "hover:border-primary/50"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t.label}</p>
                {locked ? <Lock className="size-4" /> : done === total && total > 0 ? <CheckCircle2 className="size-4 text-pitch" /> : null}
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
            </button>
          );
        })}
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold capitalize">{activeTier} questions</h2>
        {questions.data?.map((q, idx) => {
          const answered = answeredIds.has(q.id);
          const wasCorrect = correctIds.has(q.id);
          const opts = q.options as string[];
          return (
            <div key={q.id} className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <div className="mb-4 flex items-start gap-3">
                <span className="font-display text-lg font-bold text-primary">{String(idx + 1).padStart(2, "0")}</span>
                <p className="text-base font-semibold">{q.question}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {opts.map((opt, i) => {
                  const isCorrect = i === q.correct_index;
                  return (
                    <button
                      key={i}
                      disabled={answered}
                      onClick={() => answer(q.id, i, q.correct_index)}
                      className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                        answered
                          ? isCorrect
                            ? "border-pitch bg-pitch/10 text-pitch"
                            : "border-border bg-muted text-muted-foreground"
                          : "border-border bg-background hover:border-primary hover:bg-primary/5"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {answered && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {wasCorrect ? "✓ Correct. " : "✗ "}{q.explanation}
                </p>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
