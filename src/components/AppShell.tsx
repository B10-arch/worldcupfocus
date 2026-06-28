import { Link, useRouter } from "@tanstack/react-router";
import {
  Trophy,
  LayoutDashboard,
  CalendarDays,
  Flag,
  GitFork,
  Medal,
  Tv,
  Handshake,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/matches", label: "Matches", icon: CalendarDays },
  { to: "/teams", label: "Teams", icon: Flag },
  { to: "/bracket", label: "Bracket", icon: GitFork },
  { to: "/friendly", label: "Side Bets", icon: Handshake },
  { to: "/leaderboard", label: "Leaderboard", icon: Medal },
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
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/dashboard" className="flex items-center gap-3">
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
          Focus World Cup 2026 Pool · Internal use only · NPT
        </p>
      </footer>
    </div>
  );
}
