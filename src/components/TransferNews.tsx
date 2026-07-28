import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getTransferNews } from "@/lib/news.functions";
import { Newspaper, ExternalLink } from "lucide-react";

const rel = (ts: number) => {
  if (!ts) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const sourceColor: Record<string, string> = {
  Guardian: "bg-primary/15 text-primary",
  "Sky Sports": "bg-magenta/15 text-magenta",
  "BBC Sport": "bg-pitch/15 text-pitch",
};

/** Live football transfer-news side panel — merged from verified sources. */
export function TransferNews() {
  const fetchNews = useServerFn(getTransferNews);
  const [filter, setFilter] = useState<"ALL" | "PL" | "OTHER">("PL");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["transfer-news"],
    queryFn: () => fetchNews(),
    refetchInterval: 15 * 60_000, // refresh every 15 min
    staleTime: 10 * 60_000,
  });

  const items = (data ?? []).filter((n) =>
    filter === "ALL" ? true : filter === "PL" ? n.pl : !n.pl,
  );

  return (
    <aside className="lg:sticky lg:top-24">
      <div className="flex max-h-[calc(100vh-7rem)] flex-col rounded-3xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Newspaper className="size-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Transfer News</h2>
          <span className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-pitch">
            <span className="size-1.5 animate-pulse rounded-full bg-pitch" /> Live
          </span>
        </div>

        <div className="flex gap-1 border-b border-border p-2">
          {(
            [
              ["PL", "Premier League"],
              ["OTHER", "Other leagues"],
              ["ALL", "All"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                filter === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading the latest…</p>}
          {isError && (
            <p className="p-3 text-sm text-muted-foreground">Couldn&apos;t load news right now.</p>
          )}
          {items.map((n, i) => (
            <a
              key={i}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl px-3 py-2 transition hover:bg-secondary"
            >
              <p className="text-sm font-semibold leading-snug">{n.title}</p>
              <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span
                  className={`rounded px-1.5 py-0.5 font-bold ${sourceColor[n.source] ?? "bg-secondary text-foreground"}`}
                >
                  {n.source}
                </span>
                {rel(n.ts)}
                <ExternalLink className="size-3 shrink-0" />
              </p>
            </a>
          ))}
          {data && items.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">
              No {filter === "PL" ? "Premier League" : filter === "OTHER" ? "other-league" : ""}{" "}
              transfer news right now.
            </p>
          )}
        </div>

        <p className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          Guardian · Sky Sports · BBC Sport — updates every 15 min
        </p>
      </div>
    </aside>
  );
}
