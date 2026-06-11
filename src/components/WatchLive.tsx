import { Tv, ExternalLink } from "lucide-react";

// Official / licensed broadcasters for the 2026 World Cup. Availability varies by
// country, so we link to each platform's site rather than embed — viewers open
// the one valid in their region. (No third-party re-streams: those are
// unauthorized, unreliable, and ad/malware-laden.)
const SOURCES: { name: string; region: string; url: string }[] = [
  { name: "Dish Home Go", region: "Nepal — sign in to your plan", url: "https://www.watchdgo.com/en" },
  { name: "FIFA+", region: "Free — many countries", url: "https://www.fifa.com/fifaplus/" },
  { name: "Sony LIV", region: "Nepal / South Asia", url: "https://www.sonyliv.com" },
  { name: "FOX Sports", region: "USA · English", url: "https://www.foxsports.com/live" },
  { name: "Telemundo / Peacock", region: "USA · Spanish", url: "https://www.peacocktv.com" },
  { name: "CTV / TSN", region: "Canada", url: "https://www.tsn.ca" },
  { name: "BBC iPlayer / ITVX", region: "UK", url: "https://www.bbc.co.uk/iplayer" },
];

export function WatchLive() {
  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Tv className="size-5 text-primary" />
        <h2 className="font-display text-xl font-bold">Watch Live</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Official broadcasters — availability varies by country. Open the one for your region:
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SOURCES.map((s) => (
          <a
            key={s.name}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm transition hover:border-primary/50 hover:bg-primary/5"
          >
            <span className="min-w-0">
              <span className="font-bold">{s.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{s.region}</span>
            </span>
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </div>
  );
}
