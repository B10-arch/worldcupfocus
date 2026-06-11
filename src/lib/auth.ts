import { supabase } from "@/integrations/supabase/client";

/**
 * Native Supabase Google OAuth. Redirects the browser to Google and back to
 * /dashboard, where the client picks up the session from the URL. Works in
 * local dev and production once the Google provider + redirect URL are
 * configured on the Supabase project.
 */
export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/dashboard",
      queryParams: { prompt: "select_account" },
    },
  });
}
