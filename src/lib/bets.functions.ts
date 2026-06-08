import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isBetLocked } from "@/lib/time";

const ENTRY_FEE = 1000;

export const saveTeamPick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ teamId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    if (isBetLocked()) {
      throw new Error("Team selection is locked.");
    }

    const { error } = await context.supabase.from("bets").upsert(
      {
        user_id: context.userId,
        team_id: data.teamId,
        entry_fee: ENTRY_FEE,
      },
      { onConflict: "user_id" },
    );

    if (error) throw new Error(error.message);

    return { ok: true };
  });