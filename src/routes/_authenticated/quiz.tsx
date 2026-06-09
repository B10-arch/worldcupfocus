import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarDays, Flame, Sparkles, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quiz")({
  head: () => ({ meta: [{ title: "Daily Quiz · Uni-Corn Pool" }] }),
  component: DailyQuizPage,
});

type DailyQuestion = {
  id: string;
  question: string;
  options: string[];
  tier: string;
};
type DailyAttempt = {
  id: string;
  user_id: string;
  quiz_date: string;
  score: number;
  total: number;
  answers: Record<string, number>;
  completed_at: string;
};
type DailyQuiz = {
  quiz_date: string;
  questions: DailyQuestion[];
  trivia_fact: { id: string; title: string; body: string } | null;
  attempt: DailyAttempt | null;
  streak: number;
};

function DailyQuizPage() {
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number; breakdown: Array<{ question_id: string; chosen: number; correct_index: number }> } | null>(null);

  const dailyQ = useQuery({
    queryKey: ["daily-quiz"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_daily_quiz");
      if (error) throw error;
      return data as DailyQuiz;
    },
  });

  const todayLeaderboard = useQuery({
    queryKey: ["daily-quiz-leaderboard", dailyQ.data?.quiz_date],
    enabled: !!dailyQ.data?.quiz_date,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("daily_quiz_attempts")
        .select("user_id, score, total, completed_at, profiles(display_name)")
        .eq("quiz_date", dailyQ.data!.quiz_date)
        .order("score", { ascending: false })
        .order("completed_at", { ascending: true })
        .limit(10);
      return (data ?? []) as Array<{ user_id: string; score: number; total: number; completed_at: string; profiles: { display_name: string | null } | null }>;
    },
  });

  const alreadyAttempted = !!dailyQ.data?.attempt;
  const correctMap = useMemo(() => {
    const m = new Map<string, number>();
    if (result) for (const b of result.breakdown) m.set(b.question_id, b.correct_index);
    return m;
  }, [result]);

  async function submit() {
    if (!dailyQ.data) return;
    if (Object.keys(answers).length !== dailyQ.data.questions.length) {
      toast.error("Answer every question first");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("submit_daily_quiz_attempt", { p_answers: answers });
      if (error) throw error;
      setResult(data as any);
      toast.success(`You scored ${data.score}/${data.total}`);
      await qc.invalidateQueries({ queryKey: ["daily-quiz"] });
      await qc.invalidateQueries({ queryKey: ["daily-quiz-leaderboard"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
            <CalendarDays className="size-8 text-primary" /> Daily Quiz
          </h1>
          <p className="mt-2 text-muted-foreground">
            A new set of questions every day at 00:00 NPT. One attempt per day. Score feeds your engagement points.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-border bg-surface px-4 py-2 text-center">
            <div className="flex items-center gap-1 text-xs uppercase text-muted-foreground">
              <Flame className="size-3 text-magenta" /> Streak
            </div>
            <div className="font-display text-2xl font-bold">{dailyQ.data?.streak ?? 0}</div>
          </div>
          {dailyQ.data?.attempt && (
            <div className="rounded-2xl border border-pitch/30 bg-pitch/5 px-4 py-2 text-center">
              <div className="text-xs uppercase text-pitch">Today's score</div>
              <div className="font-display text-2xl font-bold">
                {dailyQ.data.attempt.score}/{dailyQ.data.attempt.total}
              </div>
            </div>
          )}
        </div>
      </header>

      {dailyQ.data?.trivia_fact && (
        <div className="rounded-2xl border border-magenta/30 bg-magenta/5 p-5">
          <div className="flex items-center gap-2 text-magenta">
            <Sparkles className="size-3" />
            <span className="text-xs font-bold uppercase tracking-widest">Daily Trivia Fact</span>
          </div>
          <h3 className="mt-2 font-display text-xl font-bold">{dailyQ.data.trivia_fact.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{dailyQ.data.trivia_fact.body}</p>
        </div>
      )}

      <section className="space-y-4">
        {dailyQ.isLoading && <p className="text-muted-foreground">Loading today's quiz…</p>}
        {dailyQ.data && dailyQ.data.questions.length === 0 && (
          <p className="text-muted-foreground">No quiz available for today.</p>
        )}
        {dailyQ.data?.questions.map((q, idx) => {
          const chosen = answers[q.id];
          const attemptChosen = dailyQ.data?.attempt?.answers?.[q.id];
          const lockedChoice = alreadyAttempted ? attemptChosen : chosen;
          const correctIdx = correctMap.get(q.id);
          return (
            <div key={q.id} className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <div className="mb-4 flex items-start gap-3">
                <span className="font-display text-lg font-bold text-primary">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <p className="text-base font-semibold">{q.question}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {q.options.map((opt, i) => {
                  const isChosen = lockedChoice === i;
                  const showCorrect = correctIdx != null && i === correctIdx;
                  const showWrong = correctIdx != null && isChosen && i !== correctIdx;
                  return (
                    <button
                      key={i}
                      disabled={alreadyAttempted || submitting}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                      className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                        showCorrect
                          ? "border-pitch bg-pitch/10 text-pitch"
                          : showWrong
                            ? "border-magenta bg-magenta/10 text-magenta"
                            : isChosen
                              ? "border-primary bg-primary/5"
                              : alreadyAttempted
                                ? "border-border bg-muted text-muted-foreground"
                                : "border-border bg-background hover:border-primary hover:bg-primary/5"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!alreadyAttempted && dailyQ.data && dailyQ.data.questions.length > 0 && (
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:scale-[1.01] disabled:opacity-50"
          >
            {submitting ? "Submitting…" : `Submit answers (${Object.keys(answers).length}/${dailyQ.data.questions.length})`}
          </button>
        )}
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold">
          <Trophy className="size-5 text-amber-pop" /> Today's mini-leaderboard
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">Finished</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(todayLeaderboard.data ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Be the first to play today!</td></tr>
              )}
              {(todayLeaderboard.data ?? []).map((r, i) => (
                <tr key={r.user_id}>
                  <td className="px-4 py-3 font-bold">{i + 1}</td>
                  <td className="px-4 py-3">{r.profiles?.display_name ?? "Player"}</td>
                  <td className="px-4 py-3 text-right font-bold">{r.score}/{r.total}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {new Date(r.completed_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
