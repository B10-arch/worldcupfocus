// Resolve a helytvme.blogspot.com "matchId" link into clean, video-only player
// URLs — one per server — so the Watch page shows just the video (no chat,
// header, or "servers" bar). helytvme's data feed is public, CORS-open, and
// base64-encoded JSON (the "secret key" in it is a decoy), so we decode it and
// build the same hely.pages.dev/player URLs the site uses internally.

const DATA_URL = "https://helytv.pages.dev/data.json";
const PLAYER = "https://hely.pages.dev/player?id=";

function matchIdOf(url: string): string | null {
  const m = url.match(/helytvme\.blogspot\.com\/[^\s"']*[?&]matchId=([A-Za-z0-9]+)/i);
  return m ? m[1] : null;
}

// Decode base64 (UTF-8 safe) → JSON. Browser `atob` gives Latin1; rebuild bytes
// so multi-byte names don't corrupt the parse.
function decodePayload(payload: string): any {
  const bin = atob(payload);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

let cache: { at: number; streams: any[] } | null = null;
async function loadStreams(): Promise<any[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.streams;
  const d = await fetch(DATA_URL).then((r) => r.json());
  const j = decodePayload(d.payload);
  const streams = Array.isArray(j.streams) ? j.streams : [];
  cache = { at: Date.now(), streams };
  return streams;
}

/** A helytvme match link → clean player URLs (one per server); other URLs pass through. */
export async function expandFeed(url: string): Promise<string[]> {
  const id = matchIdOf(url);
  if (!id) return [url];
  try {
    const streams = await loadStreams();
    const forMatch = streams.filter((s: any) =>
      String(s.Match_ID ?? "")
        .split(",")
        .map((x: string) => x.trim())
        .includes(id),
    );
    // Direct streams (hls/mpd) first — cleanest video; nested iframes last.
    forMatch.sort(
      (a: any, b: any) => (a.type === "iframe" ? 1 : 0) - (b.type === "iframe" ? 1 : 0),
    );
    const urls = forMatch
      .map((s: any) => (s.id ? PLAYER + encodeURIComponent(String(s.id)) : ""))
      .filter(Boolean);
    return urls.length ? urls : [url];
  } catch {
    return [url];
  }
}

export async function expandFeeds(feeds: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of feeds) out.push(...(await expandFeed(f)));
  return [...new Set(out)];
}
