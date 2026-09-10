import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, GraduationCap, MapPin, School } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { MediaAvatar } from "@/components/ui/media-frame";
import { getMyAlumniPortal } from "@/features/alumni/self-service";
import { getMyAlumniPortfolio } from "@/features/alumni/portfolio";
import { getMyAlumniEducationHistory } from "@/features/alumni/education-history";

export const Route = createFileRoute("/alumni/portal/portfolio/showcase")({
  head: () => ({
    meta: [
      { title: "Portfólio do Estudante · SIGA" },
      {
        name: "description",
        content: "Portfólio académico e profissional com percurso por nível e instituição.",
      },
    ],
  }),
  component: AlumniPortfolioShowcasePage,
});

type EducationLevel = "primary" | "middle" | "higher" | "legacy";
const levelMeta: Record<
  EducationLevel,
  { label: string; eyebrow: string; title: string; description: string }
> = {
  primary: {
    label: "Primária",
    eyebrow: "Ensino Primário",
    title: "Aprender, criar e descobrir.",
    description:
      "Trabalhos que mostram evolução, criatividade, leitura, ciência, artes e competências fundamentais.",
  },
  middle: {
    label: "Ensino Médio",
    eyebrow: "Ensino Médio",
    title: "Conhecimento aplicado ao futuro.",
    description:
      "Projectos, competências, actividades, estágios e evidências que mostram preparação académica e profissional.",
  },
  higher: {
    label: "Ensino Superior",
    eyebrow: "Ensino Superior",
    title: "Investigação, trabalho e identidade profissional.",
    description:
      "Projectos, investigação, publicações, estágio, experiência e resultados com foco académico e profissional.",
  },
  legacy: {
    label: "Outros trabalhos",
    eyebrow: "Histórico preservado",
    title: "Outros trabalhos e evidências.",
    description:
      "Itens anteriores à classificação por nível permanecem disponíveis até serem organizados.",
  },
};

function AlumniPortfolioShowcasePage() {
  const portalQuery = useQuery({
    queryKey: ["alumni", "portfolio", "showcase", "profile"],
    queryFn: () => getMyAlumniPortal(),
  });
  const portfolioQuery = useQuery({
    queryKey: ["alumni", "portfolio", "showcase", "items"],
    queryFn: () => getMyAlumniPortfolio(),
  });
  const educationQuery = useQuery({
    queryKey: ["alumni", "portfolio", "showcase", "education"],
    queryFn: () => getMyAlumniEducationHistory(),
  });
  const [selectedLevel, setSelectedLevel] = useState<EducationLevel>("primary");
  const [selectedStageId, setSelectedStageId] = useState<string>("all");

  // `visibleItems`/`counts` só dependem de `portfolioQuery.data` (não de
  // `portal`), por isso podem — e têm de — ser calculados antes dos early
  // returns abaixo. Um Hook (useMemo) chamado depois de um `return`
  // condicional só corre nalguns renders, o que viola as Rules of Hooks e
  // fazia o React rebentar ("Rendered more hooks than during the previous
  // render") assim que os dados chegavam depois do ecrã de loading.
  const visibleItems = (portfolioQuery.data ?? []).filter(
    (item: any) => item.visibility !== "private",
  );
  const counts = useMemo(
    () => ({
      primary: visibleItems.filter((item: any) => item.education_level === "primary").length,
      middle: visibleItems.filter((item: any) => item.education_level === "middle").length,
      higher: visibleItems.filter((item: any) => item.education_level === "higher").length,
      legacy: visibleItems.filter((item: any) => !item.education_level).length,
    }),
    [visibleItems],
  );

  if (portalQuery.isLoading || portfolioQuery.isLoading || educationQuery.isLoading)
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-6 py-16 text-sm text-muted-foreground">
          A preparar portfólio…
        </div>
      </AppShell>
    );
  const portal = portalQuery.data;
  if (!portal)
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-6 py-16 text-sm text-destructive">
          O Portal Alumni ainda não está activado.
        </div>
      </AppShell>
    );

  const profile = portal.profile as Record<string, any>;
  const person = (portal.person ?? {}) as Record<string, any>;
  const educationStages = educationQuery.data ?? [];

  const availableLevels = (Object.keys(levelMeta) as EducationLevel[]).filter(
    (level) => level !== "legacy" || counts.legacy > 0,
  );
  const activeLevel = availableLevels.includes(selectedLevel)
    ? selectedLevel
    : (availableLevels[0] ?? "primary");
  const activeMeta = levelMeta[activeLevel];
  const stageOptions = educationStages.filter(
    (stage: any) => stage.education_level === activeLevel,
  );
  const validStageId = stageOptions.some((stage: any) => stage.id === selectedStageId)
    ? selectedStageId
    : "all";
  const levelItems = visibleItems.filter((item: any) =>
    activeLevel === "legacy" ? !item.education_level : item.education_level === activeLevel,
  );
  const institutionItems =
    validStageId === "all"
      ? levelItems
      : levelItems.filter((item: any) => item.education_stage_id === validStageId);
  const featured = institutionItems.filter((item: any) => item.featured);
  const work = featured.length
    ? [...featured, ...institutionItems.filter((item: any) => !item.featured)]
    : institutionItems;
  const activeStage = stageOptions.find((stage: any) => stage.id === validStageId) ?? null;

  return (
    <AppShell>
      <main className="bg-background">
        <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-6 sm:px-8 lg:px-10">
          <div className="mb-16 flex items-center justify-between gap-4">
            <Link
              to="/alumni/portal/portfolio"
              className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-2 size-4" />
              Editar portfólio
            </Link>
            <span className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">
              SIGA · PORTFÓLIO
            </span>
          </div>

          <section className="grid gap-10 border-b border-border/60 pb-16 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
            <div className="max-w-4xl">
              <p className="mb-5 text-sm font-medium text-muted-foreground">
                {profile.current_role || profile.industry || "Perfil académico e profissional"}
              </p>
              <h1 className="text-5xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                {person.full_name ?? "Estudante"}
              </h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
                {profile.headline ||
                  profile.biography ||
                  "Percurso, competências, projectos e conquistas académicas."}
              </p>
              <dl className="mt-9 grid max-w-3xl gap-5 border-t border-border/60 pt-6 sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Nome completo
                  </dt>
                  <dd className="mt-2 text-sm font-semibold">{person.full_name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Curso
                  </dt>
                  <dd className="mt-2 text-sm font-semibold">{profile.graduation_course || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Grau alcançado
                  </dt>
                  <dd className="mt-2 text-sm font-semibold">{profile.graduation_grade || "—"}</dd>
                </div>
              </dl>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {profile.graduation_year ? (
                  <span className="inline-flex items-center">
                    <GraduationCap className="mr-1.5 size-4" />
                    Conclusão {profile.graduation_year}
                  </span>
                ) : null}
                {profile.city || profile.province ? (
                  <span className="inline-flex items-center">
                    <MapPin className="mr-1.5 size-4" />
                    {[profile.city, profile.province].filter(Boolean).join(", ")}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[250px] lg:ml-auto">
              <div className="absolute -inset-3 rounded-[34px] border border-border/50 bg-muted/30" />
              <div className="relative overflow-hidden rounded-[30px] border border-border/70 bg-background p-2 shadow-sm">
                <MediaAvatar
                  src={person.photo_url ?? null}
                  alt={person.full_name ?? "Estudante"}
                  className="aspect-[4/5] h-auto w-full rounded-[24px] object-cover"
                />
              </div>
            </div>
          </section>

          <nav
            className="flex flex-wrap gap-2 border-b border-border/60 py-6"
            aria-label="Níveis do portfólio"
          >
            {availableLevels.map((level) => {
              const active = activeLevel === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => {
                    setSelectedLevel(level);
                    setSelectedStageId("all");
                  }}
                  className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${active ? "border-foreground bg-foreground text-background" : "border-border/70 text-muted-foreground"}`}
                >
                  {levelMeta[level].label}
                  <span className="ml-2 text-xs opacity-60">{counts[level]}</span>
                </button>
              );
            })}
          </nav>

          {activeLevel !== "legacy" ? (
            <section className="border-b border-border/60 py-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-2 inline-flex items-center text-sm font-semibold text-muted-foreground">
                  <School className="mr-2 size-4" />
                  Instituição
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedStageId("all")}
                  className={`min-h-10 rounded-full border px-4 text-sm ${validStageId === "all" ? "border-foreground bg-foreground text-background" : "border-border/70 text-muted-foreground"}`}
                >
                  Todas
                </button>
                {stageOptions.map((stage: any) => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setSelectedStageId(stage.id)}
                    className={`min-h-10 rounded-full border px-4 text-sm ${validStageId === stage.id ? "border-foreground bg-foreground text-background" : "border-border/70 text-muted-foreground"}`}
                  >
                    {stage.institution_name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="grid gap-8 border-b border-border/60 py-14 md:grid-cols-[180px_minmax(0,1fr)]">
            <p className="text-sm font-semibold text-muted-foreground">{activeMeta.eyebrow}</p>
            <div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                {activeStage?.institution_name || activeMeta.title}
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                {activeStage
                  ? [
                      activeStage.course_name,
                      activeStage.degree_name,
                      [activeStage.started_year, activeStage.ended_year]
                        .filter(Boolean)
                        .join(" — "),
                      [activeStage.city, activeStage.province, activeStage.country]
                        .filter(Boolean)
                        .join(", "),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : activeMeta.description}
              </p>
            </div>
          </section>

          <section className="py-16">
            <div className="mb-12 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {activeStage?.institution_name || activeMeta.label}
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                  Trabalhos seleccionados
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">{work.length} item(ns)</p>
            </div>
            {work.length ? (
              <div className="space-y-16">
                {work.map((item: any, index: number) => (
                  <article
                    key={item.id}
                    className="grid gap-7 border-t border-border/60 pt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)]"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {String(item.item_type).replaceAll("_", " ")}
                      </p>
                      <h3 className="mt-3 text-2xl font-black sm:text-3xl">{item.title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {[
                          item.alumni_education_stages?.institution_name,
                          item.role,
                          item.organization,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {item.summary ? (
                        <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/85">
                          {item.summary}
                        </p>
                      ) : null}
                      {item.external_url ? (
                        <a
                          href={item.external_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-6 inline-flex items-center text-sm font-semibold underline underline-offset-4"
                        >
                          Ver trabalho <ExternalLink className="ml-2 size-4" />
                        </a>
                      ) : null}
                    </div>
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="aspect-[4/3] w-full rounded-[22px] object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] w-full items-end rounded-[22px] bg-muted/45 p-6">
                        <span className="text-5xl font-black text-foreground/15">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="border-t border-border/60 py-14 text-sm text-muted-foreground">
                Ainda não existem trabalhos visíveis para este filtro.
              </div>
            )}
          </section>

          <footer className="border-t border-border/60 pt-8 text-xs text-muted-foreground">
            Portfólio do Estudante · SIGA
          </footer>
        </div>
      </main>
    </AppShell>
  );
}
