import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, GraduationCap, MapPin } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { MediaAvatar } from "@/components/ui/media-frame";
import { getMyAlumniPortal } from "@/features/alumni/self-service";
import { getMyAlumniPortfolio } from "@/features/alumni/portfolio";

export const Route = createFileRoute("/alumni/portal/portfolio/showcase")({
  head: () => ({
    meta: [
      { title: "Portfólio do Estudante · SIGA" },
      { name: "description", content: "Portfólio académico e profissional com percurso por nível de ensino." },
    ],
  }),
  component: AlumniPortfolioShowcasePage,
});

type EducationLevel = "primary" | "middle" | "higher" | "legacy";

const levelMeta: Record<EducationLevel, { label: string; eyebrow: string; title: string; description: string }> = {
  primary: {
    label: "Primária",
    eyebrow: "Ensino Primário",
    title: "Aprender, criar e descobrir.",
    description: "Trabalhos que mostram evolução, criatividade, leitura, ciência, artes e competências fundamentais.",
  },
  middle: {
    label: "Ensino Médio",
    eyebrow: "Ensino Médio",
    title: "Conhecimento aplicado ao futuro.",
    description: "Projectos, competências, actividades, estágios e evidências que mostram preparação académica e profissional.",
  },
  higher: {
    label: "Ensino Superior",
    eyebrow: "Ensino Superior",
    title: "Investigação, trabalho e identidade profissional.",
    description: "Projectos, investigação, publicações, estágio, experiência e resultados com foco académico e profissional.",
  },
  legacy: {
    label: "Outros trabalhos",
    eyebrow: "Histórico preservado",
    title: "Outros trabalhos e evidências.",
    description: "Itens criados antes da classificação por nível permanecem disponíveis até serem organizados pelo estudante.",
  },
};

function AlumniPortfolioShowcasePage() {
  const portalQuery = useQuery({ queryKey: ["alumni", "portfolio", "showcase", "profile"], queryFn: () => getMyAlumniPortal() });
  const portfolioQuery = useQuery({ queryKey: ["alumni", "portfolio", "showcase", "items"], queryFn: () => getMyAlumniPortfolio() });
  const [selectedLevel, setSelectedLevel] = useState<EducationLevel>("primary");

  if (portalQuery.isLoading || portfolioQuery.isLoading) {
    return <AppShell><div className="mx-auto max-w-6xl px-6 py-16 text-sm text-muted-foreground">A preparar portfólio…</div></AppShell>;
  }

  const portal = portalQuery.data;
  if (!portal) {
    return <AppShell><div className="mx-auto max-w-6xl px-6 py-16 text-sm text-destructive">O Portal Alumni ainda não está activado.</div></AppShell>;
  }

  const profile = portal.profile as Record<string, any>;
  const person = (portal.person ?? {}) as Record<string, any>;
  const visibleItems = (portfolioQuery.data ?? []).filter((item: any) => item.visibility !== "private");

  const counts = useMemo(() => ({
    primary: visibleItems.filter((item: any) => item.education_level === "primary").length,
    middle: visibleItems.filter((item: any) => item.education_level === "middle").length,
    higher: visibleItems.filter((item: any) => item.education_level === "higher").length,
    legacy: visibleItems.filter((item: any) => !item.education_level).length,
  }), [visibleItems]);

  const availableLevels = (Object.keys(levelMeta) as EducationLevel[]).filter((level) => level !== "legacy" || counts.legacy > 0);
  const activeLevel = availableLevels.includes(selectedLevel) ? selectedLevel : availableLevels[0] ?? "primary";
  const activeMeta = levelMeta[activeLevel];
  const levelItems = visibleItems.filter((item: any) => activeLevel === "legacy" ? !item.education_level : item.education_level === activeLevel);
  const featured = levelItems.filter((item: any) => item.featured);
  const work = featured.length ? [...featured, ...levelItems.filter((item: any) => !item.featured)] : levelItems;

  return (
    <AppShell>
      <main className="bg-background">
        <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-6 sm:px-8 lg:px-10">
          <div className="mb-16 flex items-center justify-between gap-4">
            <Link to="/alumni/portal/portfolio" className="inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="mr-2 size-4" />Editar portfólio</Link>
            <span className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">SIGA · PORTFÓLIO</span>
          </div>

          <section className="grid gap-10 border-b border-border/60 pb-16 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div className="max-w-4xl">
              <p className="mb-5 text-sm font-medium text-muted-foreground">{profile.current_role || profile.industry || "Perfil académico e profissional"}</p>
              <h1 className="text-5xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">{person.full_name ?? "Estudante"}</h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">{profile.headline || profile.biography || "Percurso, competências, projectos e conquistas académicas."}</p>

              <dl className="mt-9 grid max-w-3xl gap-5 border-t border-border/60 pt-6 sm:grid-cols-3">
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Nome completo</dt><dd className="mt-2 text-sm font-semibold text-foreground">{person.full_name ?? "—"}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Curso</dt><dd className="mt-2 text-sm font-semibold text-foreground">{profile.graduation_course || "—"}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Grau alcançado</dt><dd className="mt-2 text-sm font-semibold text-foreground">{profile.graduation_grade || "—"}</dd></div>
              </dl>

              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {profile.current_company ? <span>{profile.current_company}</span> : null}
                {profile.graduation_year ? <span className="inline-flex items-center"><GraduationCap className="mr-1.5 size-4" />Conclusão {profile.graduation_year}</span> : null}
                {(profile.city || profile.province) ? <span className="inline-flex items-center"><MapPin className="mr-1.5 size-4" />{[profile.city, profile.province].filter(Boolean).join(", ")}</span> : null}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[250px] lg:ml-auto">
              <div className="absolute -inset-3 rounded-[34px] border border-border/50 bg-muted/30" />
              <div className="relative overflow-hidden rounded-[30px] border border-border/70 bg-background p-2 shadow-sm"><MediaAvatar src={person.photo_url ?? null} alt={person.full_name ?? "Estudante"} className="aspect-[4/5] h-auto w-full rounded-[24px] object-cover" /></div>
              <div className="relative mx-auto -mt-4 w-[78%] rounded-full border border-border/60 bg-background px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm">Perfil do estudante</div>
            </div>
          </section>

          <nav className="flex flex-wrap gap-2 border-b border-border/60 py-6" aria-label="Níveis do portfólio">
            {availableLevels.map((level) => {
              const active = activeLevel === level;
              return <button key={level} type="button" onClick={() => setSelectedLevel(level)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${active ? "border-foreground bg-foreground text-background" : "border-border/70 bg-background text-muted-foreground hover:text-foreground"}`} aria-pressed={active}>{levelMeta[level].label}<span className="ml-2 text-xs opacity-60">{counts[level]}</span></button>;
            })}
          </nav>

          <section className="grid gap-8 border-b border-border/60 py-14 md:grid-cols-[180px_minmax(0,1fr)]">
            <p className="text-sm font-semibold text-muted-foreground">{activeMeta.eyebrow}</p>
            <div><h2 className="text-3xl font-black tracking-tight sm:text-4xl">{activeMeta.title}</h2><p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{activeMeta.description}</p></div>
          </section>

          {profile.biography ? <section className="grid gap-6 border-b border-border/60 py-14 md:grid-cols-[180px_minmax(0,1fr)]"><h2 className="text-sm font-semibold text-muted-foreground">Sobre</h2><p className="max-w-3xl text-lg leading-8 text-foreground/90">{profile.biography}</p></section> : null}

          <section className="py-16">
            <div className="mb-12 flex items-end justify-between gap-4"><div><p className="text-sm font-medium text-muted-foreground">{activeMeta.label}</p><h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Trabalhos seleccionados</h2></div><p className="text-sm text-muted-foreground">{work.length} item(ns)</p></div>
            {work.length ? <div className="space-y-16">{work.map((item: any, index: number) => <article key={item.id} className="grid gap-7 border-t border-border/60 pt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)] lg:items-start">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{String(item.item_type).replaceAll("_", " ")}</p>
                <h3 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{[item.role, item.organization].filter(Boolean).join(" · ")}</p>
                {item.summary ? <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/85">{item.summary}</p> : null}
                {item.skills?.length ? <p className="mt-5 text-sm leading-6 text-muted-foreground">{item.skills.join(" · ")}</p> : null}
                {item.external_url ? <a href={item.external_url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center text-sm font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">Ver trabalho <ExternalLink className="ml-2 size-4" /></a> : null}
              </div>
              {item.image_url ? <img src={item.image_url} alt="" className="aspect-[4/3] w-full rounded-[22px] object-cover" /> : <div className="flex aspect-[4/3] w-full items-end rounded-[22px] bg-muted/45 p-6"><span className="text-5xl font-black tracking-tight text-foreground/15">{String(index + 1).padStart(2, "0")}</span></div>}
            </article>)}</div> : <div className="border-t border-border/60 py-14 text-sm text-muted-foreground">Ainda não existem trabalhos visíveis neste nível.</div>}
          </section>

          {profile.skills?.length ? <section className="grid gap-6 border-t border-border/60 py-14 md:grid-cols-[180px_minmax(0,1fr)]"><h2 className="text-sm font-semibold text-muted-foreground">Competências</h2><p className="max-w-3xl text-lg leading-9 text-foreground/85">{profile.skills.join(" · ")}</p></section> : null}

          {portal.experiences?.length ? <section className="border-t border-border/60 py-14"><div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]"><h2 className="text-sm font-semibold text-muted-foreground">Experiência</h2><div className="space-y-8">{portal.experiences.slice(0, 6).map((item: any) => <div key={item.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]"><div><p className="font-semibold">{item.title || item.kind}</p><p className="mt-1 text-sm text-muted-foreground">{[item.organization, item.location].filter(Boolean).join(" · ")}</p></div><p className="text-sm text-muted-foreground sm:text-right">{item.is_current ? "Actual" : [item.started_on, item.ended_on].filter(Boolean).join(" — ")}</p></div>)}</div></div></section> : null}

          <footer className="border-t border-border/60 pt-8 text-xs text-muted-foreground">Portfólio do Estudante · SIGA</footer>
        </div>
      </main>
    </AppShell>
  );
}
