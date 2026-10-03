import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, GraduationCap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import type { EnrollmentStatus, ExamSeason } from "@/features/higher-ed/engine";
import {
  enrollStudentUnits,
  getHigherEdRegulation,
  getProgramPlan,
  getStudentHigherEd,
  grantUnitExemption,
  listHigherEdPrograms,
  listProgramStudents,
  listSchoolSubjectsForPlan,
  recordUnitResult,
  removePlanUnit,
  saveHigherEdRegulation,
  savePlanUnit,
  setUnitPrerequisites,
} from "@/features/higher-ed/server";
import type { HigherEdRegulation } from "@/features/school/settings-domains";
import { toastActionError } from "@/lib/action-error-toast";

export const Route = createFileRoute("/pedagogica_/superior")({
  head: () => ({
    meta: [
      { title: "Ensino Superior · SIGA" },
      {
        name: "description",
        content: "Planos curriculares, precedências, inscrições por cadeira, épocas e regulamento.",
      },
    ],
  }),
  component: HigherEdPage,
});

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  inscrito: "Inscrito",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  dispensado: "Creditada",
  anulado: "Anulada",
  excluido_faltas: "Excluído por faltas",
  excluido_frequencia: "Excluído por frequência",
};

const SEASON_LABEL: Record<ExamSeason, string> = {
  frequencia: "Frequência",
  normal: "Época normal",
  recurso: "Recurso",
  especial: "Época especial",
  melhoria: "Melhoria",
};

function HigherEdPage() {
  const account = useCurrentAccount();
  const isOffice = account.role === "Administrador" || account.role === "Secretaria";
  const listPrograms = useServerFn(listHigherEdPrograms);
  const programs = useQuery({
    queryKey: ["higher-ed", "programs"],
    enabled: isOffice,
    queryFn: () => listPrograms(),
  });
  const [programId, setProgramId] = useState<string>("");
  const selected = programId || programs.data?.[0]?.id || "";

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Pedagógica"
          title="Ensino Superior"
          description="Planos curriculares com créditos e precedências, inscrições por cadeira, épocas de avaliação e o regulamento da instituição."
          icon={GraduationCap}
          actions={
            programs.data?.length ? (
              <Select value={selected} onValueChange={setProgramId}>
                <SelectTrigger className="w-64" aria-label="Curso">
                  <SelectValue placeholder="Escolha o curso" />
                </SelectTrigger>
                <SelectContent>
                  {programs.data.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : undefined
          }
        />
        {!account.profile.isLoading && !isOffice ? (
          <Panel title="Acesso reservado">
            <p className="text-sm text-muted-foreground">
              A gestão do Ensino Superior é da Administração e da Secretaria.
            </p>
          </Panel>
        ) : programs.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar cursos…</p>
        ) : !programs.data?.length ? (
          <EmptyState
            title="Ainda não há cursos do Ensino Superior"
            description="Escolha o nível «Ensino Superior» em Definições → Pedagógico e use «Criar classes e disciplinas»: o SIGA cria a Licenciatura com os anos 1.º a 5.º. Depois monte aqui o plano de cada curso."
          />
        ) : (
          <Tabs defaultValue="plano">
            <TabsList>
              <TabsTrigger value="plano">Cursos e plano</TabsTrigger>
              <TabsTrigger value="estudantes">Estudantes</TabsTrigger>
              <TabsTrigger value="regulamento">Regulamento</TabsTrigger>
            </TabsList>
            <TabsContent value="plano" className="mt-4">
              <PlanTab programId={selected} />
            </TabsContent>
            <TabsContent value="estudantes" className="mt-4">
              <StudentsTab programId={selected} />
            </TabsContent>
            <TabsContent value="regulamento" className="mt-4">
              <RegulationTab canEdit={account.role === "Administrador"} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}

// ── Plano ───────────────────────────────────────────────────────────────────

function PlanTab({ programId }: { programId: string }) {
  const queryClient = useQueryClient();
  const fetchPlan = useServerFn(getProgramPlan);
  const fetchSubjects = useServerFn(listSchoolSubjectsForPlan);
  const plan = useQuery({
    queryKey: ["higher-ed", "plan", programId],
    enabled: Boolean(programId),
    queryFn: () => fetchPlan({ data: { programId } }),
  });
  const subjects = useQuery({
    queryKey: ["higher-ed", "subjects"],
    queryFn: () => fetchSubjects(),
    staleTime: 5 * 60_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["higher-ed"] });

  const [subjectId, setSubjectId] = useState("");
  const [semester, setSemester] = useState("1");
  const [credits, setCredits] = useState("6");
  const save = useMutation({
    mutationFn: () =>
      savePlanUnit({
        data: { programId, subjectId, semester: Number(semester), credits: Number(credits) },
      }),
    onSuccess: async () => {
      toast.success("Cadeira acrescentada ao plano.");
      setSubjectId("");
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível acrescentar a cadeira."),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removePlanUnit({ data: { programId, id } }),
    onSuccess: async () => {
      toast.success("Cadeira retirada do plano.");
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível retirar a cadeira."),
  });
  const prerequisites = useMutation({
    mutationFn: (input: { unitId: string; requiredUnitIds: string[] }) =>
      setUnitPrerequisites({ data: { programId, ...input } }),
    onSuccess: async () => {
      toast.success("Precedências guardadas.");
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível guardar as precedências."),
  });

  if (!plan.data) {
    return <p className="text-sm text-muted-foreground">A carregar o plano…</p>;
  }
  const { units, totals, issues } = plan.data;
  const inPlan = new Set(units.map((u) => u.subjectId));
  const available = (subjects.data ?? []).filter((s) => !inPlan.has(s.id));
  const requiresOf = (unitId: string) =>
    plan.data.prerequisites.filter((p) => p.unitId === unitId).map((p) => p.requiresUnitId);

  return (
    <div className="space-y-4">
      <StatGrid
        items={[
          { label: "Cadeiras", value: String(units.length) },
          { label: "Créditos do curso", value: String(totals.totalCredits) },
          { label: "Anos", value: String(totals.years) },
          {
            label: "Problemas no plano",
            value: String(issues.filter((i) => i.level === "error").length),
          },
        ]}
      />
      {issues.length ? (
        <Panel title="A rever no plano" icon={AlertTriangle}>
          <ul className="space-y-1 text-sm">
            {issues.map((issue, index) => (
              <li
                key={`${issue.code}-${index}`}
                className={issue.level === "error" ? "text-destructive" : "text-muted-foreground"}
              >
                {issue.message}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Acrescentar cadeira ao plano">
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="plan-subject">Cadeira</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger id="plan-subject">
                <SelectValue placeholder="Escolha a cadeira" />
              </SelectTrigger>
              <SelectContent>
                {available.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-semester">Semestre</Label>
            <Input
              id="plan-semester"
              type="number"
              min={1}
              max={14}
              value={semester}
              onChange={(event) => setSemester(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-credits">Créditos</Label>
            <Input
              id="plan-credits"
              type="number"
              min={0.5}
              step={0.5}
              value={credits}
              onChange={(event) => setCredits(event.target.value)}
            />
          </div>
          <Button onClick={() => save.mutate()} disabled={!subjectId || save.isPending}>
            {save.isPending ? "A guardar…" : "Acrescentar"}
          </Button>
        </div>
      </Panel>

      {totals.semesters.map(({ semester: sem, credits: semCredits }) => (
        <Panel
          key={sem}
          title={`${sem}.º semestre · ${Math.ceil(sem / 2)}.º ano`}
          description={`${semCredits} créditos`}
        >
          <ul className="divide-y">
            {units
              .filter((unit) => unit.semester === sem)
              .map((unit) => {
                const required = requiresOf(unit.id);
                const candidates = units.filter((other) => other.id !== unit.id);
                return (
                  <li key={unit.id} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{unit.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{unit.credits} créditos</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Retirar ${unit.name} do plano`}
                          onClick={() => remove.mutate(unit.id)}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                    <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                      <legend className="mb-1 text-xs text-muted-foreground">Precedências</legend>
                      {candidates.map((other) => {
                        const id = `pre-${unit.id}-${other.id}`;
                        const checked = required.includes(other.id);
                        return (
                          <label
                            key={other.id}
                            htmlFor={id}
                            className="flex items-center gap-1.5 text-xs"
                          >
                            <Checkbox
                              id={id}
                              checked={checked}
                              disabled={prerequisites.isPending}
                              onCheckedChange={(value) =>
                                prerequisites.mutate({
                                  unitId: unit.id,
                                  requiredUnitIds: value
                                    ? [...required, other.id]
                                    : required.filter((r) => r !== other.id),
                                })
                              }
                            />
                            {other.name}
                          </label>
                        );
                      })}
                    </fieldset>
                  </li>
                );
              })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

// ── Estudantes ──────────────────────────────────────────────────────────────

function StudentsTab({ programId }: { programId: string }) {
  const fetchStudents = useServerFn(listProgramStudents);
  const students = useQuery({
    queryKey: ["higher-ed", "students", programId],
    enabled: Boolean(programId),
    queryFn: () => fetchStudents({ data: { programId } }),
  });
  const [studentId, setStudentId] = useState("");
  const [search, setSearch] = useState("");
  const list = useMemo(
    () =>
      (students.data ?? []).filter((s) =>
        `${s.name} ${s.number ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [students.data, search],
  );

  if (students.isLoading) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  if (!students.data?.length) {
    return (
      <EmptyState
        title="Sem estudantes matriculados neste curso"
        description="Os estudantes aparecem aqui quando têm matrícula numa turma de um dos anos do curso."
      />
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Panel title="Estudantes">
        <Input
          placeholder="Procurar por nome ou número"
          aria-label="Procurar estudante"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto">
          {list.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                onClick={() => setStudentId(student.id)}
                aria-current={student.id === studentId ? "true" : undefined}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                  student.id === studentId ? "bg-muted font-semibold" : ""
                }`}
              >
                {student.name}
                <span className="block text-xs text-muted-foreground">
                  {[student.number, student.className].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {studentId ? (
        <StudentPanel programId={programId} studentId={studentId} />
      ) : (
        <EmptyState title="Escolha um estudante" description="Para ver o percurso e inscrever." />
      )}
    </div>
  );
}

function StudentPanel({ programId, studentId }: { programId: string; studentId: string }) {
  const queryClient = useQueryClient();
  const fetchStudent = useServerFn(getStudentHigherEd);
  const student = useQuery({
    queryKey: ["higher-ed", "student", programId, studentId],
    queryFn: () => fetchStudent({ data: { programId, studentId } }),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["higher-ed", "student", programId, studentId] });
  const [selected, setSelected] = useState<string[]>([]);
  const [launch, setLaunch] = useState<{
    unitId: string;
    season: ExamSeason;
    frequency: string;
    exam: string;
    absence: string;
  } | null>(null);

  const enroll = useMutation({
    mutationFn: () => enrollStudentUnits({ data: { programId, studentId, unitIds: selected } }),
    onSuccess: async (result) => {
      toast.success(
        `Inscrito em ${result.enrolled} cadeira(s) · ${result.credits} créditos no ano.`,
      );
      setSelected([]);
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível inscrever."),
  });
  const record = useMutation({
    mutationFn: () => {
      if (!launch) throw new Error("Nada para lançar.");
      const num = (value: string) => (value.trim() === "" ? null : Number(value));
      return recordUnitResult({
        data: {
          programId,
          studentId,
          unitId: launch.unitId,
          season: launch.season,
          frequency: num(launch.frequency),
          exam: num(launch.exam),
          absencePercent: num(launch.absence),
        },
      });
    },
    onSuccess: async (result) => {
      toast.success(
        `Resultado: ${STATUS_LABEL[result.status as EnrollmentStatus] ?? result.status}${
          result.finalGrade !== null ? ` · ${result.finalGrade} valores` : ""
        }.`,
      );
      setLaunch(null);
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível lançar."),
  });
  const exempt = useMutation({
    mutationFn: (unitId: string) =>
      grantUnitExemption({
        data: { programId, studentId, unitId, reason: "Creditação por equivalência." },
      }),
    onSuccess: async () => {
      toast.success("Cadeira creditada.");
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível creditar."),
  });

  if (!student.data) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  const { progress, units } = student.data;
  const bySemester = [...new Set(units.map((u) => u.semester))].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <StatGrid
        items={[
          {
            label: "Créditos",
            value: `${progress.creditsEarned}/${progress.creditsTotal}`,
            hint: `${progress.percent}% do curso`,
          },
          { label: "Média", value: progress.average === null ? "—" : `${progress.average}` },
          { label: "GPA", value: progress.gpa === null ? "—" : progress.gpa.toFixed(2) },
          {
            label: "Situação",
            value: progress.completed
              ? "Concluiu"
              : progress.finalist
                ? "Finalista"
                : `${progress.curricularYear}.º ano`,
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => enroll.mutate()} disabled={!selected.length || enroll.isPending}>
          {enroll.isPending
            ? "A inscrever…"
            : `Inscrever nas ${selected.length} cadeira(s) escolhidas`}
        </Button>
        {!student.data.activeYearId ? (
          <span className="text-xs text-destructive">
            Sem ano lectivo activo: não há inscrições.
          </span>
        ) : null}
      </div>
      {bySemester.map((sem) => (
        <Panel key={sem} title={`${sem}.º semestre`}>
          <ul className="divide-y">
            {units
              .filter((unit) => unit.semester === sem)
              .map((unit) => {
                const last = unit.latest;
                const seasons = (Object.keys(SEASON_LABEL) as ExamSeason[]).filter((season) =>
                  season === "frequencia" ? last?.status === "inscrito" : unit.seasons[season],
                );
                return (
                  <li key={unit.id} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <Checkbox
                          checked={selected.includes(unit.id)}
                          disabled={!unit.canEnroll}
                          aria-label={`Inscrever em ${unit.name}`}
                          onCheckedChange={(value) =>
                            setSelected((current) =>
                              value
                                ? [...current, unit.id]
                                : current.filter((id) => id !== unit.id),
                            )
                          }
                        />
                        {unit.name}
                        <span className="text-xs font-normal text-muted-foreground">
                          {unit.credits} créditos
                        </span>
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        {last ? (
                          <Badge
                            variant={
                              last.status === "aprovado" || last.status === "dispensado"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {STATUS_LABEL[last.status]}
                            {last.finalGrade !== null ? ` · ${last.finalGrade}` : ""}
                            {last.season ? ` · ${SEASON_LABEL[last.season]}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Por fazer</Badge>
                        )}
                        {seasons.map((season) => (
                          <Button
                            key={season}
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setLaunch({
                                unitId: unit.id,
                                season,
                                frequency: "",
                                exam: "",
                                absence: "",
                              })
                            }
                          >
                            {SEASON_LABEL[season]}
                          </Button>
                        ))}
                        {!last || (last.status !== "aprovado" && last.status !== "dispensado") ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => exempt.mutate(unit.id)}
                            disabled={exempt.isPending}
                          >
                            Creditar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {!unit.canEnroll && !last ? (
                      <p className="text-xs text-muted-foreground">
                        {unit.enrollReasons.join(" ")}
                      </p>
                    ) : null}
                    {launch?.unitId === unit.id ? (
                      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-4 sm:items-end">
                        <p className="text-xs font-semibold sm:col-span-4">
                          {SEASON_LABEL[launch.season]} — {unit.name}
                        </p>
                        {launch.season === "frequencia" ? (
                          <>
                            <div className="space-y-1">
                              <Label htmlFor={`freq-${unit.id}`}>Média de frequência</Label>
                              <Input
                                id={`freq-${unit.id}`}
                                type="number"
                                min={0}
                                max={20}
                                step={0.1}
                                value={launch.frequency}
                                onChange={(e) =>
                                  setLaunch({ ...launch, frequency: e.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`abs-${unit.id}`}>Faltas (%)</Label>
                              <Input
                                id={`abs-${unit.id}`}
                                type="number"
                                min={0}
                                max={100}
                                value={launch.absence}
                                onChange={(e) => setLaunch({ ...launch, absence: e.target.value })}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <Label htmlFor={`exam-${unit.id}`}>Nota do exame</Label>
                            <Input
                              id={`exam-${unit.id}`}
                              type="number"
                              min={0}
                              max={20}
                              step={0.1}
                              value={launch.exam}
                              onChange={(e) => setLaunch({ ...launch, exam: e.target.value })}
                            />
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => record.mutate()}
                            disabled={record.isPending}
                          >
                            {record.isPending ? "A lançar…" : "Lançar"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setLaunch(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

// ── Regulamento ─────────────────────────────────────────────────────────────

const REGULATION_FIELDS: Array<{
  key: Exclude<keyof HigherEdRegulation, "improvement_enabled">;
  label: string;
  hint: string;
  step?: number;
}> = [
  {
    key: "max_credits_per_year",
    label: "Créditos máximos por ano",
    hint: "Limite de inscrição num ano lectivo.",
  },
  {
    key: "max_credits_per_semester",
    label: "Créditos máximos por semestre",
    hint: "Não pode exceder o anual.",
  },
  {
    key: "frequency_weight",
    label: "Peso da frequência (0–1)",
    hint: "Na época normal; o exame vale o restante.",
    step: 0.05,
  },
  {
    key: "exam_admission_min",
    label: "Admissão a exame",
    hint: "Abaixo disto fica excluído por frequência.",
    step: 0.5,
  },
  {
    key: "exam_exemption_min",
    label: "Dispensa de exame",
    hint: "A partir disto aprova sem exame. 0 = sem dispensa.",
    step: 0.5,
  },
  { key: "passing_grade", label: "Nota mínima de aprovação", hint: "Escala 0–20.", step: 0.5 },
  {
    key: "max_absence_percent",
    label: "Faltas máximas (%)",
    hint: "Acima disto, excluído por faltas. 0 = sem limite.",
  },
  {
    key: "special_season_max_units",
    label: "Cadeiras para época especial",
    hint: "Finalista com até N cadeiras em falta.",
  },
  { key: "max_attempts", label: "Tentativas por cadeira", hint: "0 = sem limite." },
];

function RegulationTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const fetchRegulation = useServerFn(getHigherEdRegulation);
  const regulation = useQuery({
    queryKey: ["higher-ed", "regulation"],
    queryFn: () => fetchRegulation(),
  });
  const [draft, setDraft] = useState<HigherEdRegulation | null>(null);
  const current = draft ?? regulation.data?.regulation ?? null;
  const save = useMutation({
    mutationFn: () =>
      saveHigherEdRegulation({ data: current as unknown as Record<string, unknown> }),
    onSuccess: async () => {
      toast.success("Regulamento guardado.");
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["higher-ed"] });
    },
    onError: (error) => toastActionError(error, "Não foi possível guardar o regulamento."),
  });
  if (!current) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  return (
    <Panel
      title="Regulamento académico"
      description={
        regulation.data?.configured
          ? "As regras da instituição, usadas nas inscrições e em todas as épocas."
          : "Ainda com os valores de partida: confirme-os com o regulamento da instituição."
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {REGULATION_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`reg-${field.key}`}>{field.label}</Label>
            <Input
              id={`reg-${field.key}`}
              type="number"
              step={field.step ?? 1}
              value={String(current[field.key])}
              disabled={!canEdit}
              onChange={(event) =>
                setDraft({ ...current, [field.key]: Number(event.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">{field.hint}</p>
          </div>
        ))}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch
            id="reg-improvement"
            checked={current.improvement_enabled}
            disabled={!canEdit}
            onCheckedChange={(value) => setDraft({ ...current, improvement_enabled: value })}
          />
          <Label htmlFor="reg-improvement">Época de melhoria (nunca baixa a nota)</Label>
        </div>
      </div>
      {canEdit ? (
        <div className="mt-4">
          <Button onClick={() => save.mutate()} disabled={!draft || save.isPending}>
            {save.isPending ? "A guardar…" : "Guardar regulamento"}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Só o Administrador altera o regulamento.
        </p>
      )}
    </Panel>
  );
}
