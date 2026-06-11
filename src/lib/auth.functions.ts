import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Server-side account creation.
 *
 * Why this exists: client `supabase.auth.signUp()` requires a confirmation
 * email when "Confirm email" is on, and the built-in email service rate-limits
 * those — so new signups failed ("email rate limit exceeded", no account).
 *
 * Here we use the GoTrue ADMIN API with the service_role key to create the user
 * already-confirmed (`email_confirm: true`). No email is sent, so there's no
 * rate limit, and the account works immediately regardless of the project's
 * "Confirm email" setting. The client then signs in with the password.
 *
 * The service_role key is read INSIDE the handler so it never reaches the
 * browser bundle. If it isn't configured, we return `no_service_key` and the
 * client falls back to the normal signup flow.
 */
export const signUpAccount = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
      displayName: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL;
    // New sb_secret_… key, or the legacy service_role JWT — either grants admin.
    const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return { ok: false as const, code: "no_service_key" as const };
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const email = data.email.trim().toLowerCase();
    const { error } = await admin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true, // pre-confirm → no email, no rate limit
      user_metadata: { display_name: data.displayName?.trim() || email.split("@")[0] },
    });

    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      const code = (error as { code?: string }).code;
      if (code === "email_exists" || msg.includes("already") || msg.includes("exists")) {
        return { ok: false as const, code: "email_exists" as const };
      }
      return { ok: false as const, code: "error" as const, message: error.message };
    }

    return { ok: true as const };
  });
