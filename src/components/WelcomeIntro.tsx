import { useEffect, useState } from "react";
import { X, Volume2 } from "lucide-react";
import { playPLBack } from "@/lib/plVoice";

const SEEN_KEY = "focus-welcome-seen-v1";
// Verified Nepal-available PL goal montage (real footage + celebrations).
const REEL = "Gyafe4HLy9Q";

/** Cinematic "Welcome to Focus Premier League" intro overlay — shows once on
 *  first visit, and can be replayed via the `focus:open-intro` window event. */
export function WelcomeIntro() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let first = false;
    try {
      first = localStorage.getItem(SEEN_KEY) !== "1";
    } catch {
      /* ignore */
    }
    if (first) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener("focus:open-intro", reopen);
    return () => window.removeEventListener("focus:open-intro", reopen);
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(false);
      const t = setTimeout(() => setMounted(true), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  function close(withSound: boolean) {
    if (withSound) playPLBack();
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;

  const riseCls =
    "transition-all duration-700 ease-out " +
    (mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-3xl border-2 border-[#e90052]/50 shadow-glow"
        style={{ background: "linear-gradient(150deg,#1a0025 0%,#37003c 45%,#4a0d5c 100%)" }}
      >
        <button
          onClick={() => close(false)}
          aria-label="Skip intro"
          className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          <X className="size-5" />
        </button>

        <div className="px-6 pb-6 pt-10 text-center text-white sm:px-10">
          <p
            className={`text-xs font-bold uppercase tracking-[0.4em] text-[#ff5ea0] ${riseCls}`}
            style={{ transitionDelay: "0ms" }}
          >
            Welcome to
          </p>
          <h1
            className={`mt-3 font-display text-4xl font-black leading-none sm:text-6xl ${riseCls}`}
            style={{ transitionDelay: "120ms" }}
          >
            Focus
            <br />
            <span className="bg-gradient-to-r from-[#00ff87] via-white to-[#e90052] bg-clip-text text-transparent">
              Premier League
            </span>
          </h1>
          <p
            className={`mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-bold ${riseCls}`}
            style={{ transitionDelay: "260ms" }}
          >
            🏴󠁧󠁢󠁥󠁮󠁗󠁿 The Premier League is Back — 2026/27
          </p>

          <div
            className={`mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black ${riseCls}`}
            style={{ transitionDelay: "380ms" }}
          >
            <div className="relative aspect-video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${REEL}?autoplay=1&mute=1&loop=1&playlist=${REEL}&rel=0&modestbranding=1`}
                title="Premier League is back"
                className="absolute inset-0 size-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          </div>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-300">
            <Volume2 className="size-3.5" /> Tap the video for sound
          </p>

          <button
            onClick={() => close(true)}
            className={`mt-5 w-full rounded-2xl bg-[#e90052] py-3.5 font-display text-lg font-bold text-white transition hover:brightness-110 sm:w-auto sm:px-12 ${riseCls}`}
            style={{ transitionDelay: "480ms" }}
          >
            Enter the app →
          </button>
        </div>
      </div>
    </div>
  );
}
