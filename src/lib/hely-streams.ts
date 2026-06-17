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
export type Server = { name: string; url: string };

// TSN reliably carries the live match (and works in our audience's region), so
// surface it first as the default; the rest follow for manual switching.
function rank(s: any): number {
  const n = `${s.Server_Name ?? ""} ${s.id ?? ""}`.toLowerCase();
  if (/tsn/.test(n)) return 0;
  if (/english/.test(n)) return 1;
  return 2;
}

export async function expandFeed(url: string): Promise<Server[]> {
  const id = matchIdOf(url);
  if (!id) return [{ name: "Stream", url }];
  try {
    const streams = await loadStreams();
    const forMatch = streams.filter((s: any) =>
      String(s.Match_ID ?? "")
        .split(",")
        .map((x: string) => x.trim())
        .includes(id),
    );
    forMatch.sort((a: any, b: any) => rank(a) - rank(b));
    const servers: Server[] = forMatch
      .filter((s: any) => s.id)
      .map((s: any) => ({
        name: String(s.Server_Name || s.id),
        url: PLAYER + encodeURIComponent(String(s.id)),
      }));
    return servers.length ? servers : [{ name: "Stream", url }];
  } catch {
    return [{ name: "Stream", url }];
  }
}

export async function expandFeeds(feeds: string[]): Promise<Server[]> {
  const out: Server[] = [];
  for (const f of feeds) out.push(...(await expandFeed(f)));
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}
