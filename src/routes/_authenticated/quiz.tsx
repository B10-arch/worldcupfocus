import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureDailyQuiz } from "@/lib/quiz.functions";
import { toast } from "sonner";
import { Award, CalendarDays, Flame, Sparkles, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quiz")({
  head: () => ({ meta: [{ title: "Daily Quiz · Focus World Cup Pool" }] }),
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
  longest_streak: number;
  played_today: boolean;
};

function DailyQuizPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const ensureFn = useServerFn(ensureDailyQuiz);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    total: number;
    breakdown: Array<{ question_id: string; chosen: number; correct_index: number }>;
  } | null>(null);

  const dailyQ = useQuery({
    queryKey: ["daily-quiz"],
    queryFn: async () => {
      // Generate today's AI quiz on first load. If this fails (no key / Gemini
      // down), get_daily_quiz falls back to the question pool, so don't block.
      try {
        await ensureFn();
      } catch (err) {
        console.warn("Daily quiz generation skipped:", err);
      }
      const { data, error } = await (supabase as any).rpc("get_daily_quiz");
      if (error) throw error;
      return data as DailyQuiz;
    },
  });

  // Today's scoreboard. daily_quiz_scoreboard is a security-definer view that
  // joins display_name and exposes scores only (never the per-player answers), so
  // every authenticated user sees all players. Cast to any — view isn't in types.
  const todayLeaderboard = useQuery({
    queryKey: ["daily-quiz-leaderboard", dailyQ.data?.quiz_date],
    enabled: !!dailyQ.data?.quiz_date,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("daily_quiz_scoreboard")
        .select("user_id, display_name, score, total, completed_at")
        .eq("quiz_date", dailyQ.data!.quiz_date)
        .order("score", { ascending: false })
        .order("completed_at", { ascending: true })
        .limit(10);
      return (data ?? []) as Array<{
        user_id: string;
        display_name: string | null;
        score: number;
        total: number;
        completed_at: string;
      }>;
    },
  });

  // All players' quiz streaks (current + longest) for the right-side panel.
  const streaks = useQuery({
    queryKey: ["quiz-streaks"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("quiz_streaks")
        .select("user_id, display_name, current_streak, longest_streak, played_today")
        .order("current_streak", { ascending: false })
        .order("longest_streak", { ascending: false })
        .limit(20);
      return (data ?? []) as Array<{
        user_id: string;
        display_name: string | null;
        current_streak: number;
        longest_streak: number;
        played_today: boolean;
      }>;
    },
  });

  const alreadyAttempted = !!dailyQ.data?.attempt;
  const [reveals, setReveals] = useState<
    Record<string, { correct_index: number; explanation: string | null }>
  >({});
  const correctMap = useMemo(() => {
    const m = new Map<string, number>();
    if (result) for (const b of result.breakdown) m.set(b.question_id, b.correct_index);
    for (const [qid, r] of Object.entries(reveals)) m.set(qid, r.correct_index);
    return m;
  }, [result, reveals]);

  async function pickAnswer(qid: string, i: number) {
    if (alreadyAttempted || submitting) return;
    if (reveals[qid] != null) return; // locked once revealed
    setAnswers((a) => ({ ...a, [qid]: i }));
    try {
      const { data, error } = await (supabase as any).rpc("reveal_daily_quiz_answer", {
        p_question_id: qid,
      });
      if (error) throw error;
      setReveals((r) => ({
        ...r,
        [qid]: { correct_index: data.correct_index, explanation: data.explanation },
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check answer");
    }
  }

  async function submit() {
    if (!dailyQ.data) return;
    if (Object.keys(answers).length !== dailyQ.data.questions.length) {
      toast.error("Answer every question first");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("submit_daily_quiz_attempt", {
        p_answers: answers,
      });
      if (error) throw error;
      setResult(data as any);
      toast.success(`You scored ${data.score}/${data.total}`);
      await qc.invalidateQueries({ queryKey: ["daily-quiz"] });
      await qc.invalidateQueries({ queryKey: ["daily-quiz-leaderboard"] });
      await qc.invalidateQueries({ queryKey: ["quiz-streaks"] });
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
            10 fresh AI-generated questions every day at 00:00 NPT — a different set each day. One
            attempt per day. Score feeds your engagement points.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-border bg-surface px-4 py-2 text-center">
            <div className="flex items-center gap-1 text-xs uppercase text-muted-foreground">
              <Flame className="size-3 text-magenta" /> Streak
            </div>
            <div className="font-display text-2xl font-bold">
              {dailyQ.data?.streak ?? 0}
              <span className="ml-1 text-sm font-medium text-muted-foreground">
                day{(dailyQ.data?.streak ?? 0) === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-4 py-2 text-center">
            <div className="flex items-center gap-1 text-xs uppercase text-muted-foreground">
              <Award className="size-3 text-amber-pop" /> Best
            </div>
            <div className="font-display text-2xl font-bold">
              {dailyQ.data?.longest_streak ?? 0}
            </div>
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

      <div className="grid gap-8 lg:grid-cols-[1fr_300px] lg:items-start">
        <div className="space-y-8">
          {dailyQ.data && (
            <div
              className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium ${
                dailyQ.data.played_today
                  ? "border-pitch/30 bg-pitch/5 text-pitch"
                  : dailyQ.data.streak > 0
                    ? "border-amber-pop/30 bg-amber-pop/5 text-amber-pop"
                    : "border-border bg-surface text-muted-foreground"
              }`}
            >
              <Flame className="size-4 shrink-0" />
              {dailyQ.data.played_today ? (
                <span>
                  Done for today — your {dailyQ.data.streak}-day streak is safe. Come back tomorrow
                  to keep it going!
                </span>
              ) : dailyQ.data.streak > 0 ? (
                <span>
                  You're on a {dailyQ.data.streak}-day streak. Play today's quiz to make it{" "}
                  {dailyQ.data.streak + 1}!
                </span>
              ) : (
                <span>Play today's quiz to start a daily streak. 🔥</span>
              )}
            </div>
          )}

          {dailyQ.data?.trivia_fact && (
            <div className="rounded-2xl border border-magenta/30 bg-magenta/5 p-5">
              <div className="flex items-center gap-2 text-magenta">
                <Sparkles className="size-3" />
                <span className="text-xs font-bold uppercase tracking-widest">
                  Daily Trivia Fact
                </span>
              </div>
              <h3 className="mt-2 font-display text-xl font-bold">
                {dailyQ.data.trivia_fact.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{dailyQ.data.trivia_fact.body}</p>
            </div>
          )}

          <section className="space-y-4">
            {dailyQ.isLoading && (
              <p className="text-muted-foreground">
                Preparing today's quiz… the first visit each day generates a fresh set, which can
                take a few seconds.
              </p>
            )}
            {dailyQ.data && dailyQ.data.questions.length === 0 && (
              <p className="text-muted-foreground">No quiz available for today.</p>
            )}
            {dailyQ.data?.questions.map((q, idx) => {
              const chosen = answers[q.id];
              const attemptChosen = dailyQ.data?.attempt?.answers?.[q.id];
              const lockedChoice = alreadyAttempted ? attemptChosen : chosen;
              const correctIdx = correctMap.get(q.id);
              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-border bg-surface p-6 shadow-card"
                >
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
                          disabled={alreadyAttempted || submitting || reveals[q.id] != null}
                          onClick={() => pickAnswer(q.id, i)}
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
                  {reveals[q.id]?.explanation && (
                    <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      {reveals[q.id].explanation}
                    </p>
                  )}
                </div>
              );
            })}

            {!alreadyAttempted && dailyQ.data && dailyQ.data.questions.length > 0 && (
              <button
                onClick={submit}
                disabled={submitting}
                className="w-full rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:scale-[1.01] disabled:opacity-50"
              >
                {submitting
                  ? "Submitting…"
                  : `Submit answers (${Object.keys(answers).length}/${dailyQ.data.questions.length})`}
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
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                        Be the first to play today!
                      </td>
                    </tr>
                  )}
                  {(todayLeaderboard.data ?? []).map((r, i) => (
                    <tr key={r.user_id}>
                      <td className="px-4 py-3 font-bold">{i + 1}</td>
                      <td className="px-4 py-3">{r.display_name ?? "Player"}</td>
                      <td className="px-4 py-3 text-right font-bold">
                        {r.score}/{r.total}
                      </td>
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

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
              <Flame className="size-5 text-magenta" /> Streaks
            </h2>
            <div className="space-y-2">
              {(streaks.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No streaks yet — play today's quiz to start one. 🔥
                </p>
              )}
              {(streaks.data ?? []).map((s, i) => (
                <div
                  key={s.user_id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                    s.user_id === user.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-5 shrink-0 font-display text-sm font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {s.display_name ?? "Player"}
                      {s.user_id === user.id && (
                        <span className="ml-1 text-xs font-bold text-primary">you</span>
                      )}
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-bold">
                    <Flame
                      className={`size-3.5 ${s.current_streak > 0 ? "text-magenta" : "text-muted-foreground"}`}
                    />
                    {s.current_streak}
                  </span>
                </div>
              ))}
            </div>
            {(streaks.data ?? []).length > 0 && (
              <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                Current daily streak · 🔥 = active today
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
