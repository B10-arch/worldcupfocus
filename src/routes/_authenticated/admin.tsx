import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck } from "lucide-react";
import { LiveStreamAdmin } from "@/components/LiveStreamAdmin";
import { MatchHighlightsAdmin } from "@/components/MatchHighlightsAdmin";
import { MatchEventsAdmin } from "@/components/MatchEventsAdmin";
import { PoolAdmin } from "@/components/PoolAdmin";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · Focus Premier League Pool" }] }),
  beforeLoad: async ({ context }) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

/**
 * Admin console. The old registrations/backers tables came from the retired
 * team-picking pool and were removed — the season is fantasy-pool + side-bets
 * only now. User accounts are untouched; they simply aren't listed here.
 */
function AdminPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 font-display text-4xl font-bold">
          <ShieldCheck className="size-8 text-primary" /> Admin
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pool operations console. Visible to the admin role only — everyone else sees the public
          Fantasy Table.
        </p>
      </header>

      <PoolAdmin />

      <MatchEventsAdmin />

      <LiveStreamAdmin />

      <MatchHighlightsAdmin />
    </div>
  );
}
