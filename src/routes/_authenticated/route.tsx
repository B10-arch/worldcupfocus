import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

// Resolve the session from local storage (instant — no network round-trip,
// unlike getUser()). Right after an OAuth redirect the session is still being
// parsed out of the URL, so if it's not there yet but the URL looks like a
// callback, wait briefly for SIGNED_IN instead of bouncing the user to /login.
async function resolveSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;

  const url = typeof window !== "undefined" ? window.location.href : "";
  const looksLikeOAuthCallback = /[?&]code=|[#&](access_token|error)=/.test(url);
  if (!looksLikeOAuthCallback) return null;

  return await new Promise<Session | null>((resolve) => {
    const timer = setTimeout(() => {
      sub.subscription.unsubscribe();
      resolve(null);
    }, 6000);
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        clearTimeout(timer);
        sub.subscription.unsubscribe();
        resolve(session);
      }
    });
  });
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Show the spinner quickly instead of a blank screen while the guard runs.
  pendingMs: 150,
  pendingComponent: AuthPending,
  beforeLoad: async ({ location, context }) => {
    const session = await resolveSession();
    if (!session) throw redirect({ to: "/login" });
    const user = session.user;

    // Force new users to choose at least one team before reaching the rest of
    // the app. Cache the check (60s) so it isn't re-queried on every navigation.
    if (location.pathname !== "/bet") {
      const hasBet = await context.queryClient.ensureQueryData({
        queryKey: ["has-bet", user.id],
        staleTime: 60_000,
        queryFn: async () => {
          const { count } = await supabase
            .from("bets")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id);
          return (count ?? 0) > 0;
        },
      });
      if (!hasBet) throw redirect({ to: "/bet" });
    }

    return { user };
  },
  component: AuthedLayout,
});

function AuthPending() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading your pool…</p>
      </div>
    </div>
  );
}

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      return data;
    },
  });
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });
  return (
    <AppShell displayName={profile?.display_name ?? user.email ?? undefined} isAdmin={!!isAdmin}>
      <Outlet />
    </AppShell>
  );
}
