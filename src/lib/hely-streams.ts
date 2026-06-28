// Resolve a helytvme.blogspot.com "matchId" link into clean, video-only player
// URLs — one per server — so the Watch page shows just the video.
//
// The aggregator moved its data off the old (now-dead) helytv.pages.dev/data.json
// to a CORS-open Google Sheet (via opensheet.elk.sh) and switched its player to
// hely.pages.dev/shaka?id=<stream id> (which, unlike the blogspot page, allows
// being embedded). We read the same sheet, find the stream rows tagged for the
// match slot, and build the same shaka URLs the site uses internally.

const SHEET = "https://opensheet.elk.sh/1y_e5R4H3-pMVLcBcuF0ZUvz7cl9NnDWShvKHWRDbWpc/streams";
const PLAYER = "https://hely.pages.dev/shaka?id=";

// Major FIFA World Cup broadcast channels. The operators tag the per-match slot
// (fifa1…fifa8) only while a match is mid-broadcast; when a slot isn't tagged
// yet we fall back to these channels, which carry the live WC match regardless.
const FIFA_CHANNELS = /(tsn|fox|bein|fifa|somoy|himalaya|tudn)/i;

function matchIdOf(url: string): string | null {
  const m = url.match(/helytvme\.blogspot\.com\/[^\s"']*[?&]matchId=([A-Za-z0-9]+)/i);
  return m ? m[1] : null;
}

/** A helytvme match link → clean player URLs (one per server); other URLs pass through. */
export type Server = { name: string; url: string };

type Row = { id?: string; url?: string; type?: string; Server_Name?: string };

let cache: { at: number; rows: Row[] } | null = null;
async function loadStreams(): Promise<Row[]> {
  if (cache && Date.now() - cache.at < 20_000) return cache.rows;
  const rows = await fetch(SHEET).then((r) => r.json());
  cache = { at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
  return cache.rows;
}

// Rank servers for the default pick. Direct-play streams (hls/mpd) come first:
// "iframe" streams nest another iframe whose frame-ancestors allows the original
// site but not ours, so they show "refused to connect" when embedded here. After
// that, prefer TSN (reliable in our region), then English/Fox/Bein.
function rank(s: Row): number {
  const iframePenalty = String(s.type ?? "").toLowerCase() === "iframe" ? 100 : 0;
  const n = `${s.Server_Name ?? ""} ${s.id ?? ""}`.toLowerCase();
  const src = /tsn/.test(n) ? 0 : /english|fox|bein/.test(n) ? 1 : 2;
  return iframePenalty + src;
}

// A stream row's `id` is a comma/space list of the match slots it serves.
function rowSlots(s: Row): string[] {
  return String(s.id ?? "")
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean);
}

function toServer(s: Row): Server {
  return {
    name: String(s.Server_Name || s.id),
    url: PLAYER + encodeURIComponent(String(s.id)),
  };
}

export async function expandFeed(url: string): Promise<Server[]> {
  const id = matchIdOf(url);
  if (!id) return [{ name: "Stream", url }]; // not a helytvme link — embed as-is
  try {
    const target = id.toLowerCase();
    const rows = (await loadStreams()).filter((s) => s.id);
    // "fifa" / "live" / "tv" are generic live-coverage links — go straight to the
    // FIFA broadcast channels (whatever game is on shows there).
    const generic = target === "fifa" || target === "live" || target === "tv";
    // Streams tagged for this exact match slot.
    let forMatch = generic ? [] : rows.filter((s) => rowSlots(s).includes(target));
    // Slot not tagged (or generic) → fall back to the main FIFA broadcast channels.
    if (!forMatch.length && (generic || /^fifa/i.test(id))) {
      forMatch = rows.filter((s) => FIFA_CHANNELS.test(`${s.Server_Name ?? ""} ${s.id ?? ""}`));
    }
    forMatch.sort((a, b) => rank(a) - rank(b));
    return forMatch.map(toServer);
  } catch {
    return [];
  }
}

export async function expandFeeds(feeds: string[]): Promise<Server[]> {
  const out: Server[] = [];
  for (const f of feeds) out.push(...(await expandFeed(f)));
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}
