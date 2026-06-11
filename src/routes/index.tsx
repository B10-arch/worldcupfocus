import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy, MapPin, Flame, Users2, Brain, Medal } from "lucide-react";
import trophyHero from "@/assets/trophy-hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Focus World Cup 2026 Pool" },
      {
        name: "description",
        content:
          "The internal Focus betting pool for the 2026 FIFA World Cup. Back your team, climb the leaderboard, win the pot.",
      },
      { property: "og:title", content: "Focus World Cup 2026 Pool" },
      {
        property: "og:description",
        content: "Back your team for Rs. 1,000. Split the prize. NPT match schedule, live bracket, daily trivia.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="absolute top-0 left-0 right-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3 text-white">
            <div
              className="flex size-10 items-center justify-center rounded-xl shadow-glow"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              <Trophy className="size-5" />
            </div>
            <span className="font-display text-xl font-bold">Focus World Cup Pool</span>
          </div>
          <Link
            to="/login"
            className="rounded-full bg-white px-5 py-2 text-sm font-bold text-night transition hover:scale-105"
          >
            Sign in
          </Link>
        </div>
      </nav>

      <section className="relative isolate overflow-hidden bg-night pt-24 pb-32 text-white">
        <img
          src={trophyHero}
          alt="FIFA World Cup trophy"
          width={1280}
          height={1280}
          className="absolute right-0 top-0 -z-10 h-full w-1/2 object-cover opacity-60 mask-l-from-50% mask-l-to-100%"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-night via-night/95 to-transparent" />

        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent">
              <Flame className="size-3" /> 2026 · Canada · Mexico · USA
            </span>
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
              Back your team.
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                Split the glory.
              </span>
            </h1>
            <p className="max-w-lg text-lg text-slate-300">
              The internal Focus World Cup 2026 betting pool. Flat Rs. 1,000 entry. If two people pick the same
              champion, you split the pot — no drama. NPT-converted matches, daily trivia, live bracket.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:scale-105"
              >
                Back your team
              </Link>
              <Link
                to="/login"
                className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10"
              >
                View bracket
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-6 pt-4 text-xs uppercase tracking-widest text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3" /> 16 host stadiums
              </span>
              <span>48 teams</span>
              <span>1 grand pot</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Users2,
              title: "Pool, not gamble",
              body:
                "Flat Rs. 1,000 from every player. Winners split the pot if multiple people back the same champion. Friendly, simple.",
            },
            {
              icon: Brain,
              title: "100-question trivia",
              body:
                "Tiered Beginner → Professional → Expertise quiz. Clear a tier to unlock the next. Daily fact on the dashboard.",
            },
            {
              icon: Medal,
              title: "Live leaderboard",
              body:
                "Points update automatically as matches end. Tied at the end? Whoever placed their bet first wins the tiebreaker.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-3xl border border-border bg-surface p-6 shadow-card">
              <div
                className="mb-4 flex size-10 items-center justify-center rounded-xl text-white"
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
    </div>
  );
}
