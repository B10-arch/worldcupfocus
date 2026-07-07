import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatNPTFull } from "@/lib/time";
import { feedsForLiveMatch, parseStreams } from "@/lib/streams";
import { expandFeeds, type Server } from "@/lib/hely-streams";
import { Tv, Trophy, Maximize2, Volume2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

// Start the stream 30 min before kickoff — the broadcast's pre-match show
// (commentary + lineups) is already running by then.
const PRE_MATCH_MS = 30 * 60 * 1000;
// A scheduled match whose kickoff passed within this window is treated as on-air
// (covers any lag before the sync flips its status to "live").
const MATCH_WINDOW_MS = 2.5 * 60 * 60 * 1000;
// Keep the stream on-air this long after a match finishes, so viewers catch the
// ending/post-match commentary instead of the feed cutting at the final whistle.
const POST_MATCH_MS = 10 * 60 * 1000;

export const Route = createFileRoute("/_authenticated/watch")({
  head: () => ({ meta: [{ title: "Watch Live · Focus World Cup Pool" }] }),
  component: WatchPage,
});

type LiveStream = { embed_url: string; title: string };
type WatchMatch = {
  id: string;
  status: string;
  kickoff_utc: string;
  team_a: { name: string | null; flag_emoji: string | null; code: string | null } | null;
  team_b: { name: string | null; flag_emoji: string | null; code: string | null } | null;
};

function WatchPage() {
  const { user } = Route.useRouteContext();

  const { data: stream } = useQuery({
    queryKey: ["live-stream"],
    refetchInterval: 30_000, // pick up the admin's changes without a manual reload
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("live_stream")
        .select("embed_url, title")
        .eq("id", true)
        .maybeSingle();
      return (data ?? { embed_url: "", title: "" }) as LiveStream;
    },
  });

  // Upcoming/live matches — drives whether we show the stream or a countdown.
  const { data: matches } = useQuery({
    queryKey: ["watch-matches"],
    refetchInterval: 30_000,
    queryFn: async () => {
      // Include matches from the last few hours (not just upcoming) so a match
      // that has just finished is still available for the post-match window.
      const since = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      const { data } = await (supabase as any)
        .from("matches")
        .select(
          "id, status, kickoff_utc, team_a:teams!matches_team_a_id_fkey(name, flag_emoji, code), team_b:teams!matches_team_b_id_fkey(name, flag_emoji, code)",
        )
        .gte("kickoff_utc", since)
        .order("kickoff_utc", { ascending: true })
        .limit(10);
      return (data ?? []) as WatchMatch[];
    },
  });

  const url = (stream?.embed_url ?? "").trim();
  const title = (stream?.title ?? "").trim();

  // The data has no "finished_at", so we remember the moment a match we were
  // watching (seen "live") flips to "finished" and keep its stream on-air for
  // POST_MATCH_MS afterwards — long enough for the ending/post-match commentary.
  const seenLive = useRef<Set<string>>(new Set());
  const [finishedAt, setFinishedAt] = useState<Record<string, number>>({});
  useEffect(() => {
    const justFinished: string[] = [];
    for (const m of matches ?? []) {
      if (m.status === "live") seenLive.current.add(m.id);
      if (m.status === "finished" && seenLive.current.has(m.id)) justFinished.push(m.id);
    }
    if (justFinished.length) {
      setFinishedAt((prev) => {
        let next = prev;
        for (const id of justFinished) if (next[id] == null) next = { ...next, [id]: Date.now() };
        return next;
      });
    }
  }, [matches]);

  const now = Date.now();
  // A match is "on air" if it's live; if it's scheduled and we're inside the
  // window from 30 min before kickoff (pre-match show) to MATCH_WINDOW_MS after;
  // or if it just finished and we're still within the post-match window.
  // ALL matches on air right now (not just the first) — so concurrent games
  // can be shown side by side.
  const onAirMatches = (matches ?? []).filter(
    (m) =>
      m.status === "live" ||
      (m.status === "scheduled" &&
        now >= Date.parse(m.kickoff_utc) - PRE_MATCH_MS &&
        now - Date.parse(m.kickoff_utc) < MATCH_WINDOW_MS) ||
      (m.status === "finished" && now - (finishedAt[m.id] ?? -Infinity) < POST_MATCH_MS),
  );
  const next = (matches ?? []).find(
    (m) => m.status === "scheduled" && Date.parse(m.kickoff_utc) > now,
  );
  // Default/fallback feed(s) — played as live coverage whenever no match is on air.
  const defaultFeeds = parseStreams(url).fallback;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
          <Tv className="size-8 text-primary" /> Watch Live
        </h1>
        <p className="mt-2 text-muted-foreground">
          {onAirMatches.length > 1
            ? `${onAirMatches.length} matches are on right now — watch them side by side below.`
            : onAirMatches.length === 1
              ? title || "Live match stream."
              : defaultFeeds.length > 0
                ? "Live football coverage — tap a different server if it doesn't load."
                : "Live stream shows here when a match is on."}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {onAirMatches.length > 0 ? (
            <div className="space-y-4">
              {onAirMatches.length > 1 && (
                <p className="rounded-2xl border border-border bg-surface px-4 py-2.5 text-xs text-muted-foreground">
                  🔊 All {onAirMatches.length} games play at once. To avoid clashing audio, mute the
                  ones you&apos;re not listening to from each player&apos;s controls — or fullscreen
                  the one you want to focus on.
                </p>
              )}
              <div
                className={onAirMatches.length === 1 ? "" : "grid grid-cols-1 gap-5 lg:grid-cols-2"}
              >
                {onAirMatches.map((m) => (
                  <MatchPlayer key={m.id} match={m} streamUrl={url} title={title} />
                ))}
              </div>
            </div>
          ) : defaultFeeds.length > 0 ? (
            <div className="space-y-3">
              <FeedPlayer
                rawFeeds={defaultFeeds}
                title={title}
                header={
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-magenta">
                      ● Live coverage
                    </span>
                    <span className="text-muted-foreground">
                      Live football — whatever game / pre &amp; post-match is on
                    </span>
                  </div>
                }
              />
              {next && (
                <p className="text-xs text-muted-foreground">
                  Next match: {next.team_a?.flag_emoji} {next.team_a?.name}{" "}
                  <span className="text-muted-foreground">vs</span> {next.team_b?.name}{" "}
                  {next.team_b?.flag_emoji} · {formatNPTFull(next.kickoff_utc)}
                </p>
              )}
            </div>
          ) : next ? (
            <CountdownCard match={next} />
          ) : (
            <Placeholder text="No upcoming matches. Check back when the next fixture is scheduled." />
          )}
        </div>

        <ChatPanel user={user} />
      </div>

      <p className="border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
        Focus World Cup Pool is a free, non-commercial game for pool members only. Live streams are
        gathered from publicly available third-party sources — we don&apos;t host, control, or sell
        them — and this site isn&apos;t affiliated with FIFA or any official broadcaster.
      </p>
    </div>
  );
}

/** Resolves raw feed URLs into servers and renders the video + server switcher.
 *  Shared by the per-match player and the default live-coverage player. */
function FeedPlayer({
  rawFeeds,
  title,
  header,
}: {
  rawFeeds: string[];
  title: string;
  header: ReactNode;
}) {
  // Resolve helytvme links into clean, video-only player URLs (one per server).
  // Non-helytvme links pass through unchanged.
  const expandQ = useQuery({
    queryKey: ["expand-feeds", rawFeeds],
    enabled: rawFeeds.length > 0,
    staleTime: 60_000,
    queryFn: () => expandFeeds(rawFeeds),
  });
  const servers: Server[] = expandQ.data?.length
    ? expandQ.data
    : rawFeeds.map((u) => ({ name: "Stream", url: u }));
  const [feedIdx, setFeedIdx] = useState(0);
  const activeUrl = servers[feedIdx]?.url ?? servers[0]?.url ?? "";

  // Fullscreen our own way: in fullscreen the player's native volume/controls
  // sit above the ad layer, so the sound is actually reachable.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const goFullscreen = () => {
    const el = iframeRef.current as
      | (HTMLIFrameElement & { webkitRequestFullscreen?: () => void })
      | null;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    else el?.webkitRequestFullscreen?.();
  };
  // We can't toggle a cross-origin stream's audio directly, so "Sound" opens
  // fullscreen (where the player's speaker sits above the ad layer) and nudges
  // the viewer to tap it.
  const unmuteHelp = () => {
    goFullscreen();
    toast("🔊 Now tap the speaker icon inside the player to turn sound on", { duration: 6000 });
  };

  return (
    <div className="space-y-3">
      {servers.length ? (
        <>
          {/* Video first (opens on its own, no scrolling) + sticky so it stays
              on screen while you scroll the page. */}
          <div className="sticky top-28 z-30 overflow-hidden rounded-3xl border border-border bg-night shadow-card lg:top-[72px]">
            <div className="relative aspect-video">
              <iframe
                key={activeUrl}
                ref={iframeRef}
                src={activeUrl}
                title={title || "Live"}
                className="absolute inset-0 size-full"
                // Brave-style protection: the sandbox withholds allow-popups and
                // allow-top-navigation, so the player's ad scripts can't open
                // pop-ups or hijack/redirect the tab when you tap play.
                sandbox="allow-scripts allow-same-origin allow-presentation"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
            {/* Always-visible control bar under the video — our own buttons, so
                the stream's ad layer can't swallow the tap (and no hovering to
                reveal them). Left = Sound, right = Fullscreen. */}
            <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-night px-3 py-2">
              <button
                onClick={unmuteHelp}
                title="Sound — opens fullscreen, then tap the player's speaker to unmute"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/20"
              >
                <Volume2 className="size-4" /> Sound
              </button>
              <button
                onClick={goFullscreen}
                title="Fullscreen — easiest way to reach the sound & controls"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/20"
              >
                <Maximize2 className="size-4" /> Fullscreen
              </button>
            </div>
          </div>
          {/* Sound + pop-up guidance. */}
          <div className="flex items-start gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-xs text-muted-foreground">
            <Volume2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              <span className="font-bold text-foreground">Starts muted.</span> Tap the video, then
              the speaker icon to turn sound on — the{" "}
              <span className="font-semibold text-foreground">
                first tap can be absorbed by a blocked ad, so tap again
              </span>
              , or hit <span className="font-semibold text-foreground">Fullscreen</span> for easier
              controls. Pop-up windows are already blocked here; any ad shown{" "}
              <span className="font-semibold text-foreground">inside</span> the stream comes from
              the source — a blocker like{" "}
              <span className="font-semibold text-foreground">Brave</span>,{" "}
              <span className="font-semibold text-foreground">uBlock Origin</span>, or{" "}
              <span className="font-semibold text-foreground">AdGuard DNS</span> removes those.
            </p>
          </div>
          {header}
          {servers.length > 1 && (
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <p className="text-sm">
                <span className="font-bold text-foreground">📺 Stream not playing?</span>{" "}
                <span className="text-muted-foreground">
                  Give it 10–20 seconds to load first. If it still doesn&apos;t play, tap a
                  different server below — only some of these {servers.length} actually carry this
                  feed live, so try a few (waiting 10–20s on each) until one plays. The highlighted
                  one is selected.
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {servers.map((s, i) => (
                  <button
                    key={s.url}
                    onClick={() => setFeedIdx(i)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                      i === feedIdx
                        ? "bg-primary text-primary-foreground shadow-glow"
                        : "border border-border bg-background text-foreground hover:border-primary hover:bg-primary/5"
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {header}
          <Placeholder text="No stream is available right now — try again at kickoff." />
        </>
      )}
    </div>
  );
}

/** One on-air match's video — its own link plus the default appended as backup. */
function MatchPlayer({
  match,
  streamUrl,
  title,
}: {
  match: WatchMatch;
  streamUrl: string;
  title: string;
}) {
  const rawFeeds = feedsForLiveMatch(streamUrl, match.team_a?.code, match.team_b?.code);
  const a = match.team_a;
  const b = match.team_b;
  return (
    <FeedPlayer
      rawFeeds={rawFeeds}
      title={title}
      header={
        <div className="flex items-center gap-2 text-sm font-bold">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              match.status === "live" ? "bg-magenta/10 text-magenta" : "bg-primary/10 text-primary"
            }`}
          >
            {match.status === "live" ? "● Live" : "On air"}
          </span>
          <span className="min-w-0 truncate">
            {a?.flag_emoji ?? "🏳️"} {a?.name ?? "TBD"}{" "}
            <span className="text-muted-foreground">vs</span> {b?.name ?? "TBD"}{" "}
            {b?.flag_emoji ?? "🏳️"}
          </span>
        </div>
      }
    />
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface p-6 text-center">
      <Tv className="size-10 text-muted-foreground" />
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/** "FIFA World Cup 2026" + a live ticking countdown to the next match. */
function CountdownCard({ match }: { match: WatchMatch }) {
  const target = Date.parse(match.kickoff_utc);
  const a = match.team_a;
  const b = match.team_b;
  return (
    <div
      className="overflow-hidden rounded-3xl border border-border p-8 text-center text-white shadow-card md:p-12"
      style={{ backgroundImage: "var(--gradient-night)" }}
    >
      <span className="inline-flex items-center gap-2 rounded-full bg-magenta/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-magenta">
        ● No live match right now
      </span>
      <h2 className="mt-5 flex items-center justify-center gap-3 font-display text-4xl font-bold leading-tight md:text-5xl">
        <Trophy className="size-9 text-amber-pop" />
        FIFA <span className="text-primary">World Cup</span> 2026
      </h2>
      <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
        Next match kicks off in
      </p>
      {(a || b) && (
        <p className="mt-2 font-display text-xl font-bold md:text-2xl">
          {a?.flag_emoji} {a?.name ?? "TBD"} <span className="text-slate-400">vs</span>{" "}
          {b?.name ?? "TBD"} {b?.flag_emoji}
        </p>
      )}
      <Countdown target={target} />
      <p className="mt-6 text-xs text-slate-400">{formatNPTFull(match.kickoff_utc)}</p>
    </div>
  );
}

function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target - now);
  if (diff <= 0) {
    return <p className="mt-6 font-display text-2xl font-bold text-accent">Kicking off…</p>;
  }
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000) % 24;
  const mins = Math.floor(diff / 60_000) % 60;
  const secs = Math.floor(diff / 1_000) % 60;
  const units: Array<[number, string]> = [
    [days, "Days"],
    [hours, "Hours"],
    [mins, "Mins"],
    [secs, "Secs"],
  ];
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      {units.map(([v, label]) => (
        <div key={label} className="min-w-[4.5rem] rounded-2xl bg-white/10 px-4 py-3">
          <div className="font-display text-3xl font-bold tabular-nums md:text-4xl">
            {String(v).padStart(2, "0")}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-slate-400">{label}</div>
        </div>
      ))}
    </div>
  );
}

type ChatUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};
type ChatMsg = {
  id: string;
  user_id: string;
  display_name: string | null;
  body: string;
  created_at: string;
};

/** Live team chat beside the player — every signed-in member can post, and each
 *  message is labelled with the sender's name. Polls every few seconds. */
function ChatPanel({ user }: { user: ChatUser }) {
  const qc = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // Names come from leaderboard_entries (readable by every member).
  const membersQ = useQuery({
    queryKey: ["chat-members"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase.from("leaderboard_entries").select("user_id, display_name");
      return (data ?? []) as { user_id: string; display_name: string | null }[];
    },
  });
  const nameById = new Map<string, string>(
    (membersQ.data ?? []).map((m) => [m.user_id, m.display_name ?? "A member"]),
  );
  const myName =
    nameById.get(user.id) ??
    (typeof user.user_metadata?.name === "string" ? (user.user_metadata!.name as string) : null) ??
    (typeof user.user_metadata?.full_name === "string"
      ? (user.user_metadata!.full_name as string)
      : null) ??
    (user.email ? user.email.split("@")[0] : "You");

  const messagesQ = useQuery({
    queryKey: ["chat-messages"],
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("chat_messages")
        .select("id, user_id, display_name, body, created_at")
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ChatMsg[];
    },
  });
  const errMsg = messagesQ.error ? String((messagesQ.error as any).message ?? "") : "";
  const notSetUp =
    messagesQ.isError && /chat_messages|schema cache|does not exist|relation/i.test(errMsg);
  const messages = messagesQ.data ?? [];

  // Keep the view pinned to the latest message.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const { error } = await (supabase as any)
      .from("chat_messages")
      .insert({ user_id: user.id, display_name: myName, body: body.slice(0, 500) });
    setBusy(false);
    if (error) {
      toast.error(
        /chat_messages|schema cache|relation|does not exist/i.test(error.message)
          ? "Chat isn't set up yet."
          : error.message,
      );
      return;
    }
    setText("");
    qc.invalidateQueries({ queryKey: ["chat-messages"] });
  }

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kathmandu",
    });

  return (
    <aside className="lg:sticky lg:top-[72px] lg:self-start">
      <div className="flex h-[440px] flex-col rounded-3xl border border-border bg-surface shadow-card lg:h-[calc(100vh-88px)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <MessageCircle className="size-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Team Chat</h2>
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            You&apos;re <span className="font-semibold text-foreground">{myName}</span>
          </span>
        </div>

        <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
          {notSetUp ? (
            <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-3 text-xs">
              <p className="font-bold text-foreground">⚙️ Chat needs a quick one-time setup</p>
              <p className="mt-1 text-muted-foreground">
                A small database table isn&apos;t created yet. Once it&apos;s added, chat works here
                instantly — no reload needed.
              </p>
            </div>
          ) : messagesQ.isLoading ? (
            <p className="pt-4 text-center text-xs text-muted-foreground">Loading chat…</p>
          ) : messages.length === 0 ? (
            <p className="pt-6 text-center text-xs text-muted-foreground">
              No messages yet — say hi to your team 👋
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.user_id === user.id;
              const who = mine ? "You" : (nameById.get(m.user_id) ?? m.display_name ?? "A member");
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <span className="px-1 text-[10px] font-semibold text-muted-foreground">
                    {who} · {timeOf(m.created_at)}
                  </span>
                  <div
                    className={`mt-0.5 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2 border-t border-border p-2.5"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            disabled={notSetUp}
            placeholder={notSetUp ? "Chat setup needed…" : "Message your team…"}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={notSetUp || busy || !text.trim()}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-pitch px-3 py-2 text-white transition hover:opacity-90 disabled:opacity-50"
            title="Send"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
