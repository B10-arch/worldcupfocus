import { createServerFn } from "@tanstack/react-start";

export type NewsItem = { title: string; link: string; source: string; ts: number; pl: boolean };

// A story counts as Premier League if it mentions a PL club (2026/27) or the
// league itself. Aliases included (Villa, Palace, Spurs, Forest, Man City…).
const PL_RE =
  /\b(premier league|arsenal|aston villa|villa|bournemouth|brentford|brighton|chelsea|coventry|crystal palace|palace|everton|fulham|hull|ipswich|leeds|liverpool|manchester city|man city|manchester united|man utd|man united|newcastle|nottingham forest|nott'?m forest|forest|sunderland|tottenham|spurs)\b/i;

// Verified football sources. Guardian's transfer-window feed and Sky are already
// transfer-focused; BBC is general football, filtered to transfer stories below.
const FEEDS: { url: string; source: string; transferOnly?: boolean }[] = [
  // Guardian's transfer-window feed is already transfer-only. Sky (12040) and BBC
  // are general football/sport, so they're keyword-filtered to transfer stories.
  { url: "https://www.theguardian.com/football/transfer-window/rss", source: "Guardian" },
  { url: "https://www.skysports.com/rss/12040", source: "Sky Sports", transferOnly: true },
  {
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    source: "BBC Sport",
    transferOnly: true,
  },
];

const TRANSFER_RE =
  /\b(transfer|signs?|signing|deal|bid|loan|joins?|target|agree|medical|fee|swoop|talks|linked|contract|wants?|eyeing|eye|interested|offer|approach|chase|pursue|swap|rejects?|clause|personal terms|captures?|completes?|sells?|sold|buys?|purchase|valuation|price tag|move to|move for|snap up|close to)\b/i;

function parseFeed(xml: string, source: string): NewsItem[] {
  const out: NewsItem[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const raw of items) {
    const pick = (tag: string) => {
      const m = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`).exec(
        raw,
      );
      return m ? m[1].trim() : "";
    };
    const title = pick("title")
      .replace(/<[^>]+>/g, "")
      .trim();
    const link = pick("link")
      .replace(/<[^>]+>/g, "")
      .trim();
    const dateStr = pick("pubDate").replace(/ BST$/, " +0100").replace(/ BDT$/, " +0100");
    const ts = Date.parse(dateStr) || 0;
    if (title && link) out.push({ title, link, source, ts, pl: PL_RE.test(title) });
  }
  return out;
}

/** Latest football transfer news, merged from verified sources (server-side so
 *  RSS/CORS isn't a problem). Refetched by the dashboard panel periodically. */
export const getTransferNews = createServerFn({ method: "GET" }).handler(async () => {
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const res = await fetch(f.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; FocusPool/1.0)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [] as NewsItem[];
      let items = parseFeed(await res.text(), f.source);
      if (f.transferOnly) items = items.filter((i) => TRANSFER_RE.test(i.title));
      return items;
    }),
  );
  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  all.sort((a, b) => b.ts - a.ts);
  const seen = new Set<string>();
  const deduped = all.filter((i) => {
    const k = i.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return deduped.slice(0, 30);
});
