/**
 * Consulta do catálogo educacional global: pesquisa de disciplinas e cursos
 * dentro de um contexto de nível (país → etapa → curso → classe), cobertura
 * real por país e fontes. Só leitura — o catálogo oficial não se altera a
 * partir de uma escola.
 *
 * Corre sobre os dados empacotados (`data/`), sem rede: a pesquisa responde
 * mesmo com a base ou uma fonte externa em baixo.
 */
import { useId, useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Panel, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { moduleIcons } from "@/lib/app-icons";
import { cn } from "@/lib/utils";
import {
  areasForContext,
  catalogCoverage,
  coursesFor,
  searchCourses,
  searchSubjects,
  subjectsForContext,
  TRACK_LABEL,
  type CourseSuggestion,
  type SubjectSuggestion,
} from "./catalog";
import { COUNTRIES } from "./data/countries";
import { COURSE_KIND_LABEL, GLOBAL_COURSES, globalCourse } from "./data/courses";
import { ISCED_FIELDS, ISCED_LEVELS, iscedField, iscedLevel } from "./data/isced";
import { CATALOG_SOURCES, VERIFICATION_LABEL, type VerificationStatus } from "./data/sources";
import { PERIOD_MODEL_LABEL, gradeLabel, stage as findStage, stagesFor } from "./data/stages";
import { GLOBAL_SUBJECTS, SUBJECT_AREA_LABEL, type SubjectArea } from "./data/subjects";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STATUS_TONE: Record<VerificationStatus, string> = {
  official_verified: toneClass.success,
  institutional_approved: toneClass.info,
  in_review: toneClass.warning,
  outdated: toneClass.muted,
  archived: toneClass.muted,
};

function StatusPill({ status }: { status: VerificationStatus }) {
  return <span className={cn(badgeBase, STATUS_TONE[status])}>{VERIFICATION_LABEL[status]}</span>;
}

function stageTitle(id: string) {
  const s = findStage(id);
  if (!s) return id;
  return s.cycle ? `${s.name} — ${s.cycle}` : s.name;
}

export function CatalogExplorer() {
  return (
    <Tabs defaultValue="pesquisar" className="space-y-4">
      <TabsList>
        <TabsTrigger value="pesquisar">Pesquisar</TabsTrigger>
        <TabsTrigger value="cobertura">Cobertura</TabsTrigger>
        <TabsTrigger value="fontes">Fontes</TabsTrigger>
      </TabsList>
      <TabsContent value="pesquisar">
        <SearchTab />
      </TabsContent>
      <TabsContent value="cobertura">
        <CoverageTab />
      </TabsContent>
      <TabsContent value="fontes">
        <SourcesTab />
      </TabsContent>
    </Tabs>
  );
}

function SearchTab() {
  const ids = useId();
  const [country, setCountry] = useState("AO");
  const stages = useMemo(() => stagesFor(country), [country]);
  const [stageId, setStageId] = useState<string>(stages[0]?.id ?? "");
  const current =
    findStage(stageId) && findStage(stageId)!.country === country ? findStage(stageId)! : stages[0];
  const [course, setCourse] = useState("");
  const [grade, setGrade] = useState("");
  const [mode, setMode] = useState<"disciplinas" | "cursos">("disciplinas");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<SubjectArea | "">("");

  const effectiveCourse = current && current.courses.includes(course) ? course : "";
  const effectiveGrade =
    current && current.grades.includes(Number(grade)) && grade !== "" ? Number(grade) : null;

  // Só as áreas que existem neste nível: o primário não tem nenhuma.
  const areas = useMemo(() => (current ? areasForContext({ stageId: current.id }) : []), [current]);
  const effectiveArea = areas.some((a) => a.area === area) ? (area as SubjectArea) : null;

  const subjects: SubjectSuggestion[] = useMemo(() => {
    if (!current) return [];
    const ctx = { stageId: current.id, course: effectiveCourse || null, grade: effectiveGrade };
    return query.trim()
      ? searchSubjects(query, ctx, 40, effectiveArea)
      : subjectsForContext(ctx, { area: effectiveArea });
  }, [current, effectiveCourse, effectiveGrade, effectiveArea, query]);

  const courses: CourseSuggestion[] = useMemo(() => {
    const filter = current ? { stageId: current.id } : { country };
    return query.trim() ? searchCourses(query, filter, 40) : coursesFor(filter);
  }, [current, country, query]);

  const resetBelowCountry = (code: string) => {
    setCountry(code);
    setStageId(stagesFor(code)[0]?.id ?? "");
    setCourse("");
    setGrade("");
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Contexto"
        description="As sugestões respeitam o país e o nível de ensino escolhidos."
        icon={moduleIcons.educationCatalog}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-pais`}>País</Label>
            <select
              id={`${ids}-pais`}
              className={selectClass}
              value={country}
              onChange={(e) => resetBelowCountry(e.target.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                  {c.stagesLoaded ? "" : " (sem etapas carregadas)"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-etapa`}>Nível de ensino</Label>
            <select
              id={`${ids}-etapa`}
              className={selectClass}
              value={current?.id ?? ""}
              disabled={!stages.length}
              onChange={(e) => {
                setStageId(e.target.value);
                setCourse("");
                setGrade("");
              }}
            >
              {!stages.length ? <option value="">—</option> : null}
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {stageTitle(s.id)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-curso`}>Curso / área</Label>
            <select
              id={`${ids}-curso`}
              className={selectClass}
              value={effectiveCourse}
              disabled={!current?.courses.length}
              onChange={(e) => setCourse(e.target.value)}
            >
              <option value="">
                {current?.courses.length ? "Todos" : "Sem cursos nesta etapa"}
              </option>
              {current?.courses.map((code) => (
                <option key={code} value={code}>
                  {globalCourse(code)?.name ?? code}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${ids}-classe`}>Classe / ano</Label>
            <select
              id={`${ids}-classe`}
              className={selectClass}
              value={effectiveGrade ?? ""}
              disabled={!current?.grades.length}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="">Todas</option>
              {current?.grades.map((n) => (
                <option key={n} value={n}>
                  {gradeLabel(current, n)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {current ? (
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <div>
              <dt className="inline">ISCED: </dt>
              <dd className="inline text-foreground">{iscedLevel(current.isced).name}</dd>
            </div>
            <div>
              <dt className="inline">Via: </dt>
              <dd className="inline text-foreground">{TRACK_LABEL[current.track]}</dd>
            </div>
            <div>
              <dt className="inline">Períodos: </dt>
              <dd className="inline text-foreground">
                {current.periodModels.map((p) => PERIOD_MODEL_LABEL[p]).join(" ou ")}
              </dd>
            </div>
            {current.assessment ? (
              <div>
                <dt className="inline">Escala: </dt>
                <dd className="inline text-foreground">
                  {current.assessment.min}–{current.assessment.max} (aprova com{" "}
                  {current.assessment.passing})
                </dd>
              </div>
            ) : null}
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Estado</dt>
              <dd>
                <StatusPill status={current.status} />
              </dd>
            </div>
          </dl>
        ) : null}
        {current?.notes ? (
          <p className="mt-2 text-xs text-muted-foreground">{current.notes}</p>
        ) : null}
      </Panel>

      <Panel
        title={mode === "disciplinas" ? "Disciplinas" : "Cursos"}
        description="Pesquisa sem acentos, por código, sigla, sinónimo ou com uma letra trocada."
        action={
          <div
            role="group"
            aria-label="O que pesquisar"
            className="inline-flex rounded-md bg-muted/70 p-1 text-xs"
          >
            {(["disciplinas", "cursos"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded px-2.5 py-1 font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  mode === m
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        }
      >
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label={mode === "disciplinas" ? "Pesquisar disciplinas" : "Pesquisar cursos"}
            placeholder={
              mode === "disciplinas"
                ? "Ex.: mat, emc, quimica, English"
                : "Ex.: enf, informática, direito"
            }
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {mode === "disciplinas" ? (
          <AreaFilter areas={areas} value={effectiveArea} onChange={setArea} />
        ) : null}
        {mode === "disciplinas" ? (
          <SubjectList items={subjects} country={country} />
        ) : (
          <CourseList items={courses} />
        )}
      </Panel>
    </div>
  );
}

function AreaFilter({
  areas,
  value,
  onChange,
}: {
  areas: ReturnType<typeof areasForContext>;
  value: SubjectArea | null;
  onChange: (area: SubjectArea | "") => void;
}) {
  if (!areas.length) {
    return (
      <p className="mb-3 text-xs text-muted-foreground">
        Neste nível só há disciplinas de formação geral: as áreas de especialidade (Saúde,
        Informática, Gestão…) começam no técnico-profissional e no superior.
      </p>
    );
  }
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border text-muted-foreground hover:text-foreground",
    );
  return (
    <div role="group" aria-label="Área de formação" className="mb-3 flex flex-wrap gap-1.5">
      <button
        type="button"
        aria-pressed={!value}
        className={chip(!value)}
        onClick={() => onChange("")}
      >
        Todas as áreas
      </button>
      {areas.map((a) => (
        <button
          key={a.area}
          type="button"
          aria-pressed={value === a.area}
          className={chip(value === a.area)}
          onClick={() => onChange(a.area)}
        >
          {a.label} <span className="tabular-nums opacity-70">{a.subjects}</span>
        </button>
      ))}
    </div>
  );
}

const IN_PLAN_LABEL = { core: "Obrigatória no plano", optional: "Opção no plano" } as const;

function SubjectList({ items, country }: { items: SubjectSuggestion[]; country: string }) {
  if (!items.length) {
    return (
      <EmptyState
        title="Nada encontrado neste contexto"
        description="Experimente outra grafia, ou mude o nível de ensino: só aparecem disciplinas do nível escolhido."
      />
    );
  }
  return (
    <ul className="divide-y divide-border" aria-live="polite">
      {items.map((s) => (
        <li
          key={s.subject.code}
          className="flex flex-wrap items-start justify-between gap-2 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {s.displayName}{" "}
              <span className="font-mono text-xs text-muted-foreground">{s.subject.code}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {iscedField(s.subject.field)?.name}
              {s.subject.area ? ` · ${SUBJECT_AREA_LABEL[s.subject.area]}` : ""}
              {s.subject.aliases.length
                ? ` · também: ${s.subject.aliases.slice(0, 3).join(", ")}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {s.inPlan ? (
              <span
                className={cn(
                  badgeBase,
                  s.inPlan === "core" ? toneClass.success : toneClass.warning,
                )}
              >
                {IN_PLAN_LABEL[s.inPlan]}
              </span>
            ) : (
              <span className={cn(badgeBase, "bg-muted text-muted-foreground")}>
                Outra do nível
              </span>
            )}
            <StatusPill status={s.status} />
          </div>
        </li>
      ))}
      <li className="pt-2.5 text-xs text-muted-foreground">
        {items.length} disciplina(s) · nomes como usados em{" "}
        {COUNTRIES.find((c) => c.code === country)?.name ?? country}
      </li>
    </ul>
  );
}

function CourseList({ items }: { items: CourseSuggestion[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="Sem cursos neste contexto"
        description="Esta etapa não tem cursos (ex.: primário), ou a pesquisa não encontrou nenhum."
      />
    );
  }
  return (
    <ul className="divide-y divide-border" aria-live="polite">
      {items.map((c) => (
        <li key={c.course.code} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {c.course.name}{" "}
              <span className="font-mono text-xs text-muted-foreground">{c.course.code}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {COURSE_KIND_LABEL[c.course.kind]} · {iscedLevel(c.isced).name} ·{" "}
              {iscedField(c.course.field)?.name}
              {c.course.typicalYears ? ` · ${c.course.typicalYears} anos (indicativo)` : ""}
            </p>
            {c.stages.length ? (
              <p className="text-xs text-muted-foreground">
                Em: {c.stages.map(stageTitle).join("; ")}
              </p>
            ) : null}
          </div>
        </li>
      ))}
      <li className="pt-2.5 text-xs text-muted-foreground">
        Estar no catálogo não quer dizer que uma escola esteja autorizada a oferecer o curso.
      </li>
    </ul>
  );
}

function CoverageTab() {
  const rows = catalogCoverage();
  return (
    <div className="space-y-4">
      <Panel
        title="Cobertura real"
        description="O que está carregado por país. Nada aqui é estimado."
        icon={moduleIcons.educationCatalog}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">
                  País
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Etapas
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Classes/anos
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Etapas com plano
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Disciplinas nos planos
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Cursos
                </th>
                <th scope="col" className="py-2 font-medium">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.country} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {r.name}
                  </th>
                  <td className="py-2 pr-3 tabular-nums">{r.stages}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.grades}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.stagesWithPlan}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.subjectsInPlans}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.courses}</td>
                  <td className="py-2">
                    {r.stages ? (
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(r.byStatus) as VerificationStatus[]).map((s) => (
                          <span key={s} className={cn(badgeBase, STATUS_TONE[s])}>
                            {VERIFICATION_LABEL[s]} · {r.byStatus[s]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Por carregar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel
        title="Registos globais"
        description="Classificações e catálogos de referência partilhados por todos os países."
      >
        <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <li>
            <span className="font-semibold tabular-nums">{ISCED_LEVELS.length}</span> níveis ISCED
            2011
          </li>
          <li>
            <span className="font-semibold tabular-nums">{ISCED_FIELDS.length}</span> áreas ISCED-F
            2013
          </li>
          <li>
            <span className="font-semibold tabular-nums">{GLOBAL_SUBJECTS.length}</span> disciplinas
            de referência
          </li>
          <li>
            <span className="font-semibold tabular-nums">{GLOBAL_COURSES.length}</span> cursos de
            referência
          </li>
        </ul>
      </Panel>
    </div>
  );
}

function SourcesTab() {
  return (
    <Panel
      title="Fontes"
      description="Cada registo aponta para uma fonte, com versão e estado de verificação."
    >
      <ul className="divide-y divide-border">
        {CATALOG_SOURCES.map((s) => (
          <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-xs text-muted-foreground">
                {s.authority} · {s.version}
                {s.country ? ` · ${s.country}` : ""}
              </p>
              {s.notes ? <p className="text-xs text-muted-foreground">{s.notes}</p> : null}
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                >
                  Abrir fonte <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </div>
            <StatusPill status={s.status} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
