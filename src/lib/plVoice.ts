// "Premier League is Back!" announcement via the browser's speech synthesis —
// no audio asset needed. Must be triggered inside a user gesture (a click) or
// browsers block it. Respects a per-device mute preference.

const KEY = "pl-voice-off";

export function isVoiceOff(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setVoiceOff(off: boolean) {
  try {
    localStorage.setItem(KEY, off ? "1" : "0");
  } catch {
    /* ignore */
  }
}

let last = 0;
export function playPLBack() {
  if (typeof window === "undefined" || isVoiceOff()) return;
  const now = Date.now();
  if (now - last < 2500) return; // don't stack repeats on rapid clicks
  last = now;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance("Premier League is back!");
    u.rate = 0.98;
    u.pitch = 1.12;
    u.volume = 1;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}
