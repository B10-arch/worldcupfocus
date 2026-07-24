import { Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import type { ReactNode } from "react";
import trophyHero from "@/assets/trophy-hero.jpg";

/** Shared two-column shell for the /login and /signup pages. */
export function AuthLayout({
  heading,
  subheading,
  children,
  footer,
}: {
  heading: string;
  subheading: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-night p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-xl text-white shadow-glow"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          >
            <Trophy className="size-5" />
          </div>
          <span className="font-display text-xl font-bold">Focus Premier League Pool</span>
        </div>
        <img
          src={trophyHero}
          alt="Premier League trophy"
          width={1024}
          height={1024}
          className="absolute inset-0 -z-0 size-full object-cover opacity-40"
        />
        <div className="relative z-10 max-w-md">
          <span className="inline-block rounded-full bg-accent/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent">
            Premier League 2026/27
          </span>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight">
            Back your team. Split the glory.
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            Co-hosted by Canada, Mexico, and the USA. Entry is a flat Rs. 1,000. Tied team? You
            share the pot equally.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <Link
              to="/"
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              ← Back home
            </Link>
            <h2 className="mt-2 font-display text-3xl font-bold">{heading}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
          </div>
          {children}
          <p className="text-center text-xs text-muted-foreground">{footer}</p>
        </div>
      </div>
    </div>
  );
}

/** "Continue/Sign in/Sign up with Google" button with the official 4-color mark. */
export function GoogleButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold transition hover:bg-secondary disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.1A6.6 6.6 0 015.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.3 9.14 5.38 12 5.38z"
        />
      </svg>
      {label}
    </button>
  );
}

/** "or" separator between the Google button and the email form. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
      <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
    </div>
  );
}
