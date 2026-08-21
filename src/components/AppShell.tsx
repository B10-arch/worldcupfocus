import { Link, useRouter } from "@tanstack/react-router";
import {
  Trophy,
  LayoutDashboard,
  CalendarDays,
  Flag,
  Tv,
  Handshake,
  BarChart3,
  Shirt,
  LogOut,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { WelcomeIntro } from "@/components/WelcomeIntro";
import { playPLBack, isVoiceOff, setVoiceOff } from "@/lib/plVoice";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/matches", label: "Matches", icon: CalendarDays },
  { to: "/teams", label: "Clubs & Table", icon: Flag },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/manager", label: "Manager", icon: Shirt },
  { to: "/leaderboard", label: "Fantasy Table", icon: Trophy },
  { to: "/friendly", label: "Side Bets", icon: Handshake },
  { to: "/watch", label: "Watch", icon: Tv },
] as const;

export function AppShell({
  children,
  displayName,
  isAdmin,
}: {
  children: ReactNode;
  displayName?: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // App-wide "EPL is coming" teaser — dismissible, remembered per device.
  const [showEpl, setShowEpl] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("epl-teaser-hidden") !== "1";
  });
  const dismissEpl = () => {
    setShowEpl(false);
    try {
      localStorage.setItem("epl-teaser-hidden", "1");
    } catch {
      /* ignore */
    }
  };

  // "Premier League is Back" voice on Dashboard click (+ mute toggle).
  const [voiceOff, setVoiceOffState] = useState(isVoiceOff());
  const toggleVoice = () => {
    const next = !voiceOff;
    setVoiceOff(next);
    setVoiceOffState(next);
    if (!next) playPLBack(); // give a taste when re-enabling
  };

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/login", replace: true });
  }

  const initials = (displayName ?? "U")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <WelcomeIntro />
      {showEpl && (
        <div
          className="relative text-white"
          style={{ background: "linear-gradient(90deg,#37003c 0%,#5b1a8a 55%,#e90052 100%)" }}
        >
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-2 pr-10 text-sm">
            <span className="hidden shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest sm:inline">
              ⚽ New season
            </span>
            <p className="min-w-0 flex-1 truncate font-medium sm:text-center">
              <span className="font-bold">Premier League 2026/27</span> is live here — season kicks
              off Sat 22 Aug. Back your clubs! 🏴󠁧󠁢󠁥󠁮󠁗󠁿
            </p>
          </div>
          <button
            onClick={dismissEpl}
            aria-label="Dismiss announcement"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/80 transition hover:bg-white/15 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/dashboard" onClick={playPLBack} className="flex items-center gap-3">
            <div
              className="flex size-10 items-center justify-center rounded-xl text-white shadow-glow"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              <Trophy className="size-5" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight">
              Focus <span className="text-primary">Pool</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={item.to === "/dashboard" ? playPLBack : undefined}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{
                  className:
                    "rounded-full px-3 py-1.5 text-sm font-semibold bg-secondary text-foreground",
                }}
              >
                {item.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                to="/admin"
                className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
                activeProps={{
                  className:
                    "ml-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground",
                }}
              >
                <ShieldCheck className="size-3.5" /> Admin
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right md:block">
              <p className="text-xs font-semibold text-foreground">{displayName ?? "Player"}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Pool member
              </p>
            </div>
            <div
              className="flex size-9 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              {initials}
            </div>
            <button
              onClick={toggleVoice}
              className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={voiceOff ? "Unmute sound" : "Mute sound"}
              title={voiceOff ? "Sound off — click to enable" : "Sound on — click to mute"}
            >
              {voiceOff ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <button
              onClick={handleSignOut}
              className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 lg:hidden">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={item.to === "/dashboard" ? playPLBack : undefined}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground"
              activeProps={{
                className:
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-secondary text-foreground",
              }}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              to="/admin"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"
              activeProps={{
                className:
                  "flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground",
              }}
            >
              <ShieldCheck className="size-3.5" /> Admin
            </Link>
          )}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>

      <footer className="mt-20 border-t border-border bg-surface py-8 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Focus Premier League 2026/27 Pool · Internal use only · NPT
        </p>
      </footer>
    </div>
  );
}
