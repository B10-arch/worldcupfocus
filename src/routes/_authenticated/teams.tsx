import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({ meta: [{ title: "Teams · Uni-Corn Pool" }] }),
  component: TeamsPage,
});

function TeamsPage() {
  const { data: teams } = useQuery({
    queryKey: ["teams", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("*").order("fifa_rank");
      return data ?? [];
    },
  });

  const groups = (teams ?? []).reduce<Record<string, typeof teams>>((acc, t) => {
    const g = t.group_name ?? "—";
    acc[g] = acc[g] ?? [];
    acc[g]!.push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-4xl font-bold">Team intelligence</h1>
        <p className="mt-2 text-muted-foreground">Profiles, coaches, FIFA rank and tournament form for every competing nation.</p>
      </header>

      {Object.entries(groups)
        .sort()
        .map(([g, list]) => (
          <section key={g}>
            <h2 className="mb-4 font-display text-xl font-bold">Group {g}</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {list!.map((t) => (
                <Link
                  key={t.id}
                  to="/teams/$code"
                  params={{ code: t.code }}
                  className="group rounded-2xl border border-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid size-12 place-items-center rounded-xl bg-secondary text-3xl">
                      {t.flag_emoji}
                    </div>
                    <div className="flex-1">
                      <p className="font-display text-lg font-bold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.coach}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                      #{t.fifa_rank}
                    </span>
                  </div>
                  <p className="mt-4 font-mono text-xs text-muted-foreground">Form: {t.wc_form}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
