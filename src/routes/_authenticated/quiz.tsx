import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureDailyQuiz } from "@/lib/quiz.functions";
import { toast } from "sonner";
import { Award, CalendarDays, Clock, Flame, Sparkles, Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/quiz")({
  head: () => ({ meta: [{ title: "Daily Quiz · Focus Premier League Pool" }] }),
  component: DailyQuizPage,
});

// Seconds each question is answerable once it becomes the active question. The
// clock starts only when the player presses Start and resets fresh per question.
// Enforced client-side (trusted internal pool).
const QUESTION_SECONDS = 15;

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

type StreakRow = {
  user_id: string;
  display_name: string | null;
  current_streak: number;
  longest_streak: number;
  played_today: boolean;
};
type ScoreRow = {
  user_id: string;
  display_name: string | null;
  score: number;
  total: number;
  completed_at: string;
};
type Standing = {
  user_id: string;
  display_name: string | null;
  current_streak: number;
  longest_streak: number;
  played_today: boolean;
  today_score: number | null;
  today_total: number | null;
  completed_at: string | null;
};

function DailyQuizPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const ensureFn = useServerFn(ensureDailyQuiz);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [expired, setExpired] = useState<Record<string, boolean>>({});
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
    refetchInterval: 20_000, // keep standings live so it stays a competition
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("daily_quiz_scoreboard")
        .select("user_id, display_name, score, total, completed_at")
        .eq("quiz_date", dailyQ.data!.quiz_date)
        .order("score", { ascending: false })
        .order("completed_at", { ascending: true })
        .limit(100);
      return (data ?? []) as ScoreRow[];
    },
  });

  // All players' quiz streaks (current + longest) for the combined board.
  const streaks = useQuery({
    queryKey: ["quiz-streaks"],
    refetchInterval: 20_000, // live
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("quiz_streaks")
        .select("user_id, display_name, current_streak, longest_streak, played_today")
        .order("current_streak", { ascending: false })
        .order("longest_streak", { ascending: false })
        .limit(100);
      return (data ?? []) as StreakRow[];
    },
  });

  // Merge streaks + today's scores into one ranked board. Rank by current streak
  // (the persistent competitive metric), then today's score, then who finished
  // first. This is the "always calculate, see who's on top" board.
  const standings = useMemo<Standing[]>(() => {
    const map = new Map<string, Standing>();
    for (const s of streaks.data ?? []) {
      map.set(s.user_id, {
        user_id: s.user_id,
        display_name: s.display_name,
        current_streak: s.current_streak ?? 0,
        longest_streak: s.longest_streak ?? 0,
        played_today: s.played_today ?? false,
        today_score: null,
        today_total: null,
        completed_at: null,
      });
    }
    for (const r of todayLeaderboard.data ?? []) {
      const cur =
        map.get(r.user_id) ??
        ({
          user_id: r.user_id,
          display_name: r.display_name,
          current_streak: 0,
          longest_streak: 0,
          played_today: true,
          today_score: null,
          today_total: null,
          completed_at: null,
        } as Standing);
      cur.display_name = cur.display_name ?? r.display_name;
      cur.today_score = r.score;
      cur.today_total = r.total;
      cur.completed_at = r.completed_at;
      map.set(r.user_id, cur);
    }
    const rows = [...map.values()];
    rows.sort((a, b) => {
      if (b.current_streak !== a.current_streak) return b.current_streak - a.current_streak;
      const as = a.today_score ?? -1;
      const bs = b.today_score ?? -1;
      if (bs !== as) return bs - as;
      if (a.completed_at && b.completed_at) return a.completed_at.localeCompare(b.completed_at);
      if (a.completed_at) return -1;
      if (b.completed_at) return 1;
      return (a.display_name ?? "").localeCompare(b.display_name ?? "");
    });
    return rows;
  }, [streaks.data, todayLeaderboard.data]);

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

  // --- Sequential per-question timer -------------------------------------
  // Nothing runs when the page is merely visited. The player presses Start; from
  // then on the clock runs ONLY for the first unresolved ("active") question.
  // Each question gets a fresh QUESTION_SECONDS when it becomes active, so time
  // spent on earlier questions is never deducted from the next one.
  const [started, setStarted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_SECONDS);

  const questions = useMemo(() => dailyQ.data?.questions ?? [], [dailyQ.data]);
  const activeIndex = useMemo(
    () => questions.findIndex((q) => answers[q.id] == null && !expired[q.id]),
    [questions, answers, expired],
  );
  const activeId = activeIndex >= 0 ? questions[activeIndex].id : null;

  // Timer hit zero on the active question: lock it (scores 0), reveal the answer
  // so the player learns it, and reset the clock for the next question.
  const handleExpire = useCallback(async (qid: string) => {
    setExpired((e) => (e[qid] ? e : { ...e, [qid]: true }));
    setSecondsLeft(QUESTION_SECONDS); // fresh clock for whichever becomes active next
    try {
      const { data, error } = await (supabase as any).rpc("reveal_daily_quiz_answer", {
        p_question_id: qid,
      });
      if (error) throw error;
      setReveals((r) =>
        r[qid]
          ? r
          : { ...r, [qid]: { correct_index: data.correct_index, explanation: data.explanation } },
      );
    } catch {
      /* best-effort reveal; the question still scores 0 either way */
    }
  }, []);

  // Drive the active question's countdown. Re-runs whenever the active question
  // changes (answered or expired) → a brand-new 15s interval. Cleared if the
  // player answers early so leftover seconds never carry into the next question.
  useEffect(() => {
    if (!started || alreadyAttempted || activeId == null) return;
    setSecondsLeft(QUESTION_SECONDS);
    let remaining = QUESTION_SECONDS;
    const id = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        handleExpire(activeId);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [started, alreadyAttempted, activeId, handleExpire]);

  async function pickAnswer(qid: string, i: number) {
    if (alreadyAttempted || submitting) return;
    if (!started || qid !== activeId) return; // only the active question, after Start
    if (expired[qid]) return; // timer ran out — locked at 0
    if (reveals[qid] != null) return; // locked once revealed
    setAnswers((a) => ({ ...a, [qid]: i }));
    setSecondsLeft(QUESTION_SECONDS); // next question starts on a full clock
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

  const totalQuestions = questions.length;
  // A question is "resolved" once it's answered or its timer expired. You can
  // submit when every question is resolved (timed-out ones simply score 0).
  const resolvedCount = useMemo(
    () => questions.filter((q) => answers[q.id] != null || expired[q.id]).length,
    [questions, answers, expired],
  );

  async function submit() {
    if (!dailyQ.data) return;
    if (resolvedCount !== dailyQ.data.questions.length) {
      toast.error("Answer every question (or let its 15s timer run out) first");
      return;
    }
    setSubmitting(true);
    try {
      // Only send real picks. Timed-out questions are absent → scored 0 server-side.
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
            10 fresh AI-generated questions every day at 00:00 NPT. One attempt per day. You get{" "}
            {QUESTION_SECONDS} seconds for each question once you press Start — miss the clock and
            it scores 0.
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

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
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

            {!alreadyAttempted && !started && dailyQ.data && totalQuestions > 0 && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
                <p className="mx-auto max-w-md text-sm font-medium">
                  Ready? You'll get <strong>{QUESTION_SECONDS} seconds per question</strong>. The
                  clock starts when you press Start and resets fresh for each question — so it's one
                  question at a time.
                </p>
                <button
                  onClick={() => {
                    setSecondsLeft(QUESTION_SECONDS);
                    setStarted(true);
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:scale-105"
                >
                  <Clock className="size-4" /> Start quiz
                </button>
              </div>
            )}

            {dailyQ.data?.questions.map((q, idx) => {
              const chosen = alreadyAttempted
                ? dailyQ.data?.attempt?.answers?.[q.id]
                : answers[q.id];
              return (
                <QuestionCard
                  key={q.id}
                  q={q}
                  idx={idx}
                  locked={alreadyAttempted}
                  submitting={submitting}
                  active={idx === activeIndex}
                  started={started}
                  secondsLeft={secondsLeft}
                  chosen={chosen}
                  correctIdx={correctMap.get(q.id)}
                  explanation={reveals[q.id]?.explanation}
                  expired={!!expired[q.id]}
                  onPick={pickAnswer}
                />
              );
            })}

            {!alreadyAttempted && started && dailyQ.data && totalQuestions > 0 && (
              <button
                onClick={submit}
                disabled={submitting || resolvedCount !== totalQuestions}
                className="w-full rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:scale-[1.01] disabled:opacity-50"
              >
                {submitting
                  ? "Submitting…"
                  : resolvedCount !== totalQuestions
                    ? `Finish all questions to submit (${resolvedCount}/${totalQuestions} done)`
                    : "Submit answers"}
              </button>
            )}
          </section>
        </div>

        {/* Always-live combined board: streak + today's score, ranked, with popup. */}
        <aside className="lg:sticky lg:top-6">
          <LiveStandings rows={standings} meId={user.id} />
        </aside>
      </div>
    </div>
  );
}

/**
 * Presentational quiz question. The timer is owned by the parent (a single
 * sequential clock for the active question); this card just shows the running
 * countdown when it's active, the "Time's up" state when it expired unanswered,
 * or a muted "up next" badge while it waits its turn.
 */
function QuestionCard({
  q,
  idx,
  locked,
  submitting,
  active,
  started,
  secondsLeft,
  chosen,
  correctIdx,
  explanation,
  expired,
  onPick,
}: {
  q: DailyQuestion;
  idx: number;
  locked: boolean;
  submitting: boolean;
  active: boolean;
  started: boolean;
  secondsLeft: number;
  chosen: number | undefined;
  correctIdx: number | undefined;
  explanation: string | null | undefined;
  expired: boolean;
  onPick: (qid: string, i: number) => void;
}) {
  const revealed = correctIdx != null;
  const resolved = chosen != null || expired || revealed;
  const ticking = !locked && started && active && !resolved; // its clock is running now
  const upcoming = !locked && !resolved && !ticking; // hasn't been reached yet / not started
  const answerable = ticking;
  const low = secondsLeft <= 5;

  return (
    <div
      className={`rounded-2xl bg-surface p-6 shadow-card transition ${
        ticking ? "border-2 border-primary ring-2 ring-primary/20" : "border border-border"
      } ${upcoming ? "opacity-60" : ""}`}
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="font-display text-lg font-bold text-primary">
          {String(idx + 1).padStart(2, "0")}
        </span>
        <p className="flex-1 text-base font-semibold">{q.question}</p>
        {ticking ? (
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums ${
              low
                ? "border-magenta/40 bg-magenta/10 text-magenta"
                : "border-primary/40 bg-primary/10 text-primary"
            }`}
          >
            <Clock className="size-3.5" />
            {secondsLeft}s
          </span>
        ) : expired && chosen == null ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-magenta/40 bg-magenta/10 px-2.5 py-1 text-xs font-bold text-magenta">
            <Clock className="size-3.5" /> Time's up · 0 pts
          </span>
        ) : upcoming ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold text-muted-foreground">
            <Clock className="size-3.5" /> {QUESTION_SECONDS}s
          </span>
        ) : null}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {q.options.map((opt, i) => {
          const isChosen = chosen === i;
          const showCorrect = correctIdx != null && i === correctIdx;
          const showWrong = correctIdx != null && isChosen && i !== correctIdx;
          return (
            <button
              key={i}
              disabled={!answerable || submitting}
              onClick={() => onPick(q.id, i)}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                showCorrect
                  ? "border-pitch bg-pitch/10 text-pitch"
                  : showWrong
                    ? "border-magenta bg-magenta/10 text-magenta"
                    : isChosen
                      ? "border-primary bg-primary/5"
                      : answerable
                        ? "border-border bg-background hover:border-primary hover:bg-primary/5"
                        : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {explanation && (
        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {explanation}
        </p>
      )}
    </div>
  );
}

/** Compact ranked board (top 5) with a popup showing every player. */
function LiveStandings({ rows, meId }: { rows: Standing[]; meId: string }) {
  const top = rows.slice(0, 5);
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Trophy className="size-5 text-amber-pop" /> Live Standings
        </h2>
        <Dialog>
          <DialogTrigger asChild>
            <button className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:bg-secondary hover:text-foreground">
              View all ({rows.length})
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="size-5 text-amber-pop" /> Live Standings
              </DialogTitle>
              <DialogDescription>
                Ranked by current streak, then today's score. Updates live.
              </DialogDescription>
            </DialogHeader>
            <div className="-mx-2 max-h-[60vh] space-y-1.5 overflow-y-auto px-2">
              {rows.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No players yet — be the first to play today! 🔥
                </p>
              )}
              {rows.map((r, i) => (
                <StandingRow key={r.user_id} r={r} rank={i + 1} me={r.user_id === meId} />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-1.5">
        {top.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">
            No players yet — be the first to play today and top the board. 🔥
          </p>
        )}
        {top.map((r, i) => (
          <StandingRow key={r.user_id} r={r} rank={i + 1} me={r.user_id === meId} />
        ))}
      </div>

      {rows.length > 0 && (
        <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
          🔥 current streak · today's score · updates live
        </p>
      )}
    </div>
  );
}

function StandingRow({ r, rank, me }: { r: Standing; rank: number; me: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
        me ? "border-primary/40 bg-primary/5" : "border-border bg-background"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-5 shrink-0 font-display text-sm font-bold text-primary">{rank}</span>
        <span className="truncate text-sm font-medium">
          {r.display_name ?? "Player"}
          {me && <span className="ml-1 text-xs font-bold text-primary">you</span>}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex items-center gap-1 text-sm font-bold" title="Current daily streak">
          <Flame
            className={`size-3.5 ${r.current_streak > 0 ? "text-magenta" : "text-muted-foreground"}`}
          />
          {r.current_streak}
        </span>
        <span
          className="w-14 text-right text-sm font-bold tabular-nums text-muted-foreground"
          title="Today's quiz score"
        >
          {r.today_score != null ? `${r.today_score}/${r.today_total}` : "—"}
        </span>
      </div>
    </div>
  );
}
