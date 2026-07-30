import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy, Handshake, Shirt, Newspaper, BarChart3, Film, ArrowRight } from "lucide-react";
import { CLUB_CRESTS } from "@/lib/clubCrests";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Focus Premier League 2026/27" },
      {
        name: "description",
        content:
          "The Premier League with your mates — friendly side bets, a Football-Manager squad game, live scores, table, stats, transfer news and highlights. No entry fee, all bragging rights.",
      },
      { property: "og:title", content: "Focus Premier League 2026/27" },
      {
        property: "og:description",
        content:
          "Challenge your mates on every game, build a squad from scratch, and follow every kick. The Premier League is back.",
      },
    ],
  }),
  component: Landing,
});

function CrestMarquee() {
  const row = [...CLUB_CRESTS, ...CLUB_CRESTS];
  return (
    <div className="relative overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <style>{`@keyframes fp-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <div
        className="flex w-max items-center gap-8"
        style={{ animation: "fp-marquee 42s linear infinite" }}
      >
        {row.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            loading="lazy"
            className="size-11 shrink-0 object-contain opacity-90 drop-shadow"
          />
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: Handshake,
    title: "Side Bets",
    body: "Challenge a mate on any game — pick a club, name your stake (money or a dare). One taps accept, and you settle up per game. No pot, no house — just you vs them.",
  },
  {
    icon: Shirt,
    title: "Manager",
    body: "£100m, 15 players, one dream squad. Sign real Premier League stars, pick your formation on the pitch, and watch your XI rating climb. Buy low, sell high.",
  },
  {
    icon: BarChart3,
    title: "Live Everything",
    body: "The league table, fixtures in Nepal time, and season leaders — top scorer, top assists, most clean sheets — all updating as the games are played.",
  },
  {
    icon: Newspaper,
    title: "News & Highlights",
    body: "A live transfer-news feed (Premier League first), plus best-goals reels and a watch-live stream. Everything to keep you in the loop between kick-offs.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section
        className="relative isolate overflow-hidden text-white"
        style={{
          background:
            "radial-gradient(1000px 500px at 80% -10%, rgba(233,0,82,.5), transparent), radial-gradient(900px 500px at 0% 110%, rgba(0,255,135,.18), transparent), linear-gradient(160deg,#1a0025 0%,#37003c 55%,#2a0733 100%)",
        }}
      >
        <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 items-center justify-center rounded-xl shadow-glow"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              <Trophy className="size-5" />
            </div>
            <span className="font-display text-xl font-bold">
              Focus <span className="text-[#00ff87]">PL</span>
            </span>
          </div>
          <Link
            to="/login"
            className="rounded-full bg-white/95 px-5 py-2 text-sm font-bold text-[#37003c] transition hover:scale-105"
          >
            Sign in
          </Link>
        </nav>

        <div className="relative z-10 mx-auto max-w-4xl px-6 pb-8 pt-14 text-center sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-[#ff5ea0]">
            🏴󠁧󠁢󠁥󠁮󠁗󠁿 2026/27 Season · Live
          </span>
          <h1 className="mt-6 font-display text-5xl font-black leading-[1.02] tracking-tight md:text-7xl">
            The Premier League,
            <br />
            <span className="bg-gradient-to-r from-[#00ff87] via-white to-[#e90052] bg-clip-text text-transparent">
              with your mates.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-300">
            Bet your friends on every game, build a squad from scratch, and follow every kick —
            table, stats, transfer news, highlights and live matches. No entry fee. All bragging
            rights.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-[#e90052] px-7 py-3.5 text-sm font-bold text-white transition hover:brightness-110"
            >
              Get started <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/login"
              className="rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10"
            >
              I have an account
            </Link>
          </div>
        </div>

        <div className="relative z-10 border-t border-white/10 bg-black/20 py-4">
          <CrestMarquee />
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 px-6 py-8 text-center sm:grid-cols-4">
          {[
            ["20", "Clubs"],
            ["380", "Fixtures"],
            ["£0", "Entry fee"],
            ["∞", "Bragging rights"],
          ].map(([n, l]) => (
            <div key={l}>
              <p className="font-display text-3xl font-black text-primary md:text-4xl">{n}</p>
              <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {l}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="text-center font-display text-3xl font-bold md:text-4xl">
          Everything for the season
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-muted-foreground">
          One place for your crew to play, compete and follow the Premier League together.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-border bg-surface p-6 shadow-card transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div
                className="mb-4 flex size-11 items-center justify-center rounded-xl text-white"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                <f.icon className="size-5" />
              </div>
              <h3 className="font-display text-xl font-bold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: "linear-gradient(120deg,#37003c,#4a0d5c 60%,#e90052)" }}
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-6 py-16 text-center">
          <Film className="size-8 text-white/80" />
          <h2 className="font-display text-3xl font-black md:text-4xl">
            The Premier League is back.
          </h2>
          <p className="max-w-md text-slate-200">
            Grab your mates, pick your clubs, and make every matchday matter.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-[#37003c] transition hover:scale-105"
          >
            Create your account <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-background py-8 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Focus Premier League 2026/27 · Internal use only · NPT
        </p>
      </footer>
    </div>
  );
}
