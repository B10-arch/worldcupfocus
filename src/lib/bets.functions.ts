import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isBetLocked } from "@/lib/time";

const ENTRY_FEE = 1000;
export const MAX_PICKS = 3;

export const addPick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ teamId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    if (isBetLocked()) throw new Error("Picks are locked.");
    const { supabase, userId } = context;

    const { count } = await supabase
      .from("bets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= MAX_PICKS) {
      throw new Error(`You may back at most ${MAX_PICKS} teams.`);
    }

    const { error } = await supabase
      .from("bets")
      .insert({ user_id: userId, team_id: data.teamId, entry_fee: ENTRY_FEE });
    if (error) {
      if (error.code === "23505") throw new Error("You already backed this team.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const removePick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ teamId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    if (isBetLocked()) throw new Error("Picks are locked.");
    const { error } = await context.supabase
      .from("bets")
      .delete()
      .eq("user_id", context.userId)
      .eq("team_id", data.teamId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const swapPick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ fromTeamId: z.string().uuid(), toTeamId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    if (isBetLocked()) throw new Error("Picks are locked.");
    const { error } = await context.supabase
      .from("bets")
      .update({ team_id: data.toTeamId })
      .eq("user_id", context.userId)
      .eq("team_id", data.fromTeamId);
    if (error) {
      if (error.code === "23505") throw new Error("You already backed that team.");
      throw new Error(error.message);
    }
    return { ok: true };
  });
