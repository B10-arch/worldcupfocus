// Per-match stream links live in the single live_stream.embed_url text field
// (no schema change needed). Each non-empty line is one of:
//   "<CODE_A>-<CODE_B> <url> [url2 …]"  → feed(s) for that specific match
//   "<url> [url2 …]"                     → fallback feed(s) for any live match
//                                          that has no link of its own
// The Watch page plays the line matching whichever match is currently live.

export const matchKey = (a?: string | null, b?: string | null): string =>
  [a, b]
    .filter(Boolean)
    .map((c) => String(c).toUpperCase())
    .sort()
    .join("-");

const urlsIn = (s: string): string[] =>
  (s ?? "")
    .split(/\s+|(?=https?:\/\/)/)
    .map((x) => x.trim())
    .filter((x) => /^https?:\/\//.test(x));

export function parseStreams(embed: string | null | undefined): {
  byMatch: Map<string, string[]>;
  fallback: string[];
} {
  const byMatch = new Map<string, string[]>();
  const fallback: string[] = [];
  for (const line of (embed ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)) {
    const first = line.split(/\s+/)[0] ?? "";
    const urls = urlsIn(line);
    if (/^[A-Za-z]{2,5}-[A-Za-z]{2,5}$/.test(first)) {
      const [a, b] = first.split("-");
      byMatch.set(matchKey(a, b), urls);
    } else if (urls.length) {
      fallback.push(...urls);
    }
  }
  return { byMatch, fallback };
}

/** Build the embed_url text from a fallback + per-match link entries. */
export function buildStreams(
  perMatch: Array<{ codeA?: string | null; codeB?: string | null; urls: string }>,
  fallback: string,
): string {
  const lines: string[] = [];
  const fb = urlsIn(fallback);
  if (fb.length) lines.push(fb.join(" "));
  for (const m of perMatch) {
    if (!m.codeA || !m.codeB) continue;
    const u = urlsIn(m.urls);
    if (u.length) {
      lines.push(
        `${String(m.codeA).toUpperCase()}-${String(m.codeB).toUpperCase()} ${u.join(" ")}`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * Feeds to play for the live match: its own link(s) first, then the default
 * appended as an automatic backup so the player can fall back to it if the
 * match's own link fails.
 */
export function feedsForLiveMatch(
  embed: string | null | undefined,
  codeA?: string | null,
  codeB?: string | null,
): string[] {
  const { byMatch, fallback } = parseStreams(embed);
  const specific = (codeA && codeB ? byMatch.get(matchKey(codeA, codeB)) : undefined) ?? [];
  return [...new Set([...specific, ...fallback])];
}

/** Every URL configured anywhere in the stream config (for server-side allow-listing). */
export function allConfiguredUrls(embed: string | null | undefined): string[] {
  const { byMatch, fallback } = parseStreams(embed);
  const all = new Set<string>(fallback);
  for (const urls of byMatch.values()) urls.forEach((u) => all.add(u));
  return [...all];
}
