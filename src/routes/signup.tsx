import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/auth";
import { signUpAccount } from "@/lib/auth.functions";
import { AuthLayout, GoogleButton, OrDivider } from "@/components/AuthLayout";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your account · Focus Premier League Pool" },
      {
        name: "description",
        content:
          "Join Focus Premier League — challenge your mates on every game, build a squad, and follow every kick.",
      },
    ],
  }),
  ssr: false,
  component: SignupPage,
});

function signupErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const msg = raw.toLowerCase();
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many sign-up attempts right now. Wait a minute and try again — or ask the admin to turn off email confirmation.";
  }
  if (msg.includes("already registered") || msg.includes("already exists")) {
    return "That email is already registered. Try signing in instead.";
  }
  if (msg.includes("password")) {
    return "Password is too weak — use at least 6 characters.";
  }
  if (msg.includes("invalid") && msg.includes("email")) {
    return "That doesn't look like a valid email address.";
  }
  return raw || "Sign up failed. Please try again.";
}

function SignupPage() {
  const router = useRouter();
  const signUpFn = useServerFn(signUpAccount);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.navigate({ to: "/dashboard", replace: true });
    });
  }, [router]);

  // After the account exists, establish a client session and go to the app.
  async function signInAndGo(cleanEmail: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      toast.success("Account created! Please sign in.");
      router.navigate({ to: "/login", replace: true });
      return;
    }
    toast.success("Account created!");
    router.navigate({ to: "/dashboard", replace: true });
  }

  // Fallback: normal client signup (used only if the server can't create the
  // account directly, e.g. the service_role key isn't configured yet).
  async function clientSignupFallback(cleanEmail: string) {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/dashboard",
        data: { display_name: displayName.trim() || cleanEmail.split("@")[0] },
      },
    });
    if (error) throw error;

    // Supabase returns an obfuscated user with no identities when the email is
    // already registered (anti-enumeration). Treat that as a duplicate.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      toast.error("That email is already registered. Try signing in instead.");
      return;
    }

    if (data.session) {
      toast.success("Account created!");
      router.navigate({ to: "/dashboard", replace: true });
    } else {
      toast.success("Account created! Check your email to confirm, then sign in.");
      router.navigate({ to: "/login", replace: true });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();

      // Primary path: server creates the account already-confirmed (no email,
      // no rate limit), then we sign in.
      const result = await signUpFn({
        data: { email: cleanEmail, password, displayName: displayName.trim() },
      });

      if (result.ok) {
        await signInAndGo(cleanEmail);
        return;
      }
      if (result.code === "email_exists") {
        toast.error("That email is already registered. Try signing in instead.");
        return;
      }
      if (result.code === "no_service_key") {
        // Service key not set yet — fall back to the standard client signup.
        await clientSignupFallback(cleanEmail);
        return;
      }
      toast.error(signupErrorMessage(new Error(result.message)));
    } catch (err) {
      toast.error(signupErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error(error.message ?? "Google sign-in failed");
      setLoading(false);
    }
    // On success the browser is redirected to Google — nothing else to do here.
  }

  return (
    <AuthLayout
      heading="Create your account"
      subheading="Use your email to join your mates for the new season."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-bold text-primary">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton onClick={handleGoogle} disabled={loading} label="Sign up with Google" />
      <OrDivider />
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@unicorn.com"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 6)"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Working…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
