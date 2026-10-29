import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  GraduationCap,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconChip } from "@/components/ui/icon-chip";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppShell } from "@/components/layout/AppShell";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import {
  TurmaEditSubModal,
  TurmaAssignTeacherSubModal,
  shiftLabelMap,
} from "@/features/academic/components/TurmaFormModals";
import {
  applyCurriculumToClassGroup,
  deleteClassGroup,
  listPedagogicalWorkspace,
  listRooms,
  updateClassGroup,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import { listTeachers } from "@/features/people/server";
import { canWriteModule } from "@/features/auth/access-policy";
import { canReadStudentSection } from "@/features/students/student-sections";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { mapClassGroupToSnapshot } from "@/features/intelligence/classes/class-relations-adapter";
import { useRelations } from "@/features/intelligence/use-relations";
import { useSuggestions } from "@/features/intelligence/use-suggestions";
import { errorMessage } from "@/lib/error-message";
import { safeHref } from "@/lib/safe-url";
import { TURMA_SECTIONS, type TurmaSection } from "@/features/academic/turma-sections";
import {
  timetableDays,
  visibleTimetableSlots,
  type TimetableDay,
} from "@/features/academic/class-timetable-visibility";
import { exportCsv } from "@/lib/export-csv";
import { TurmaTeacherContextPanel } from "@/features/academic/components/TurmaTeacherContextPanel";
import { z } from "zod";

/**
 * `?secao=` (SIGA Context Engine): o menu da turma abre a ficha numa secção
 * («Alunos da turma» → `?secao=alunos`). A página mostra tudo e leva até lá.
 */
const turmaSearchSchema = z.object({
  secao: z.enum(TURMA_SECTIONS).optional().catch(undefined),
});

export const Route = createFileRoute("/pedagogica_/turmas/$turmaId")({
  validateSearch: (search) => turmaSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Ficha da Turma · SIGA" },
      {
        name: "description",
        content:
          "Ficha completa da turma: ocupação, alunos, professores, disciplinas, horário e avaliações.",
      },
      { property: "og:title", content: "Ficha da Turma · SIGA" },
      {
        property: "og:description",
        content: "Ocupação, alunos, professores, disciplinas, horário e avaliações da turma.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TurmaDetail,
});

const foldRosterSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt")
    .trim();

const weekdayLabels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function NotFoundOrError({ title }: { title: string }) {
  return (
    <AppShell>
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-soft">
        <h1 className="font-display text-xl font-bold">{title}</h1>
        <Button asChild className="mt-6">
          <Link to="/pedagogica" search={{ tab: "turmas" }}>
            Voltar à lista
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

/** O id de cada secção na página, para `?secao=` e para ligações directas. */
const sectionId = (section: TurmaSection) => `turma-${section}`;

function TurmaDetail() {
  const { turmaId } = Route.useParams();
  const { secao } = Route.useSearch();
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const { school, selectedYearId } = useSchoolSettings();
  const canManageAcademic = canWriteModule(account.role, "pedagogica", account.grants);
  const canManageTurma =
    (account.role === "Administrador" || account.role === "Secretaria") && canManageAcademic;
  const canReadAcademic =
    account.role === "Administrador" ||
    account.role === "Secretaria" ||
    account.role === "Professor";

  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
    enabled: canReadAcademic,
    retry: false,
  });
  const teachersQuery = useQuery({
    queryKey: ["people", "teachers", "assign"],
    queryFn: () => listTeachers({ data: { status: "active", limit: 200 } }),
    enabled: canManageTurma,
  });
  const classroomsQuery = useQuery({
    queryKey: ["academic", "rooms"],
    queryFn: () => listRooms(),
    enabled: canReadAcademic,
  });

  const [studentSearch, setStudentSearch] = useState({ classId: turmaId, value: "" });
  const [expandedLists, setExpandedLists] = useState({
    classId: turmaId,
    alunos: false,
    horario: false,
    avaliacoes: false,
  });
  const expanded =
    expandedLists.classId === turmaId
      ? expandedLists
      : { classId: turmaId, alunos: false, horario: false, avaliacoes: false };
  const toggleList = (section: "alunos" | "horario" | "avaliacoes") =>
    setExpandedLists((current) => {
      const base =
        current.classId === turmaId
          ? current
          : { classId: turmaId, alunos: false, horario: false, avaliacoes: false };
      return { ...base, [section]: !base[section] };
    });
  const searchValue = studentSearch.classId === turmaId ? studentSearch.value : "";
  const [scheduleDayFilter, setScheduleDayFilter] = useState<{
    classId: string;
    day: TimetableDay;
  }>({ classId: turmaId, day: "todos" });
  const [editOpen, setEditOpen] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [applyingCurriculum, setApplyingCurriculum] = useState(false);

  const workspace = workspaceQuery.data;
  const teachers = teachersQuery.data ?? [];
  const activeClassrooms = (classroomsQuery.data ?? []).filter((room) => room.status === "active");
  const teacherOptions = teachers.map((teacher) => teacher.full_name);
  const teacherIds = teachers.map((teacher) => teacher.id);

  const refreshAcademic = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["academic", "rooms"] }),
    ]);
  };

  const turma = useMemo(
    () => workspace?.classGroups.find((group) => group.id === turmaId),
    [workspace?.classGroups, turmaId],
  );
  const alunos = useMemo(
    () => (workspace?.enrollmentOptions ?? []).filter((row) => row.class_group_id === turmaId),
    [workspace?.enrollmentOptions, turmaId],
  );
  const filteredStudents = useMemo(() => {
    const words = foldRosterSearch(searchValue).split(/\s+/).filter(Boolean);
    return alunos
      .filter((student) => {
        const text = foldRosterSearch(
          `${student.student_name} ${student.registration_number ?? ""}`,
        );
        return words.every((word) => text.includes(word));
      })
      .sort((a, b) => a.student_name.localeCompare(b.student_name, "pt"));
  }, [alunos, searchValue]);
  const visibleStudents = expanded.alunos ? filteredStudents : filteredStudents.slice(0, 10);
  const disciplinas = useMemo(
    () => (workspace?.classSubjects ?? []).filter((row) => row.class_group_id === turmaId),
    [workspace?.classSubjects, turmaId],
  );
  const horario = useMemo(
    () =>
      (workspace?.scheduleSlots ?? [])
        .filter((row) => row.class_group_id === turmaId)
        .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at)),
    [workspace?.scheduleSlots, turmaId],
  );
  const availableDays = timetableDays(horario);
  const requestedDay = scheduleDayFilter.classId === turmaId ? scheduleDayFilter.day : "todos";
  const selectedDay =
    typeof requestedDay === "number" && !availableDays.includes(requestedDay)
      ? "todos"
      : requestedDay;
  const scheduleSelection = visibleTimetableSlots(horario, selectedDay, expanded.horario);
  const visibleSchedule = scheduleSelection.items;
  const avaliacoes = useMemo(() => {
    const alunoIds = new Set(alunos.map((a) => a.student_id).filter(Boolean));
    return (workspace?.termGrades ?? []).filter(
      (row) => row.student_id && alunoIds.has(row.student_id),
    );
  }, [workspace?.termGrades, alunos]);

  const visibleGrades = expanded.avaliacoes ? avaliacoes : avaliacoes.slice(0, 8);
  const classRelationsSnapshot = useMemo(
    () =>
      turma ? mapClassGroupToSnapshot(turma, disciplinas, horario.length, avaliacoes.length) : null,
    [turma, disciplinas, horario.length, avaliacoes.length],
  );
  const focusedClassEntity = useMemo(() => {
    if (!turma || !classRelationsSnapshot) return null;
    return {
      type: "class" as const,
      id: turma.id,
      label: turma.name,
      schoolId: school?.id ?? "",
      data: classRelationsSnapshot,
    };
  }, [turma, classRelationsSnapshot, school?.id]);
  useDeclareEntityFocus(focusedClassEntity);
  // Com a turma carregada, leva à secção pedida pelo menu.
  const turmaLoaded = Boolean(turma);
  useEffect(() => {
    if (!turmaLoaded || !secao) return;
    document.getElementById(sectionId(secao))?.scrollIntoView?.({ block: "start" });
    document.getElementById(`${sectionId(secao)}-titulo`)?.focus({ preventScroll: true });
  }, [turmaLoaded, turma?.id, secao]);
  const classRelations = useRelations();
  const classSuggestions = useSuggestions();

  if (workspaceQuery.isLoading) {
    return (
      <AppShell>
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-soft">
          A carregar ficha da turma…
        </div>
      </AppShell>
    );
  }

  if (workspaceQuery.isError) {
    return <NotFoundOrError title="Não foi possível carregar a ficha da turma" />;
  }

  if (!turma) return <NotFoundOrError title="Turma não encontrada" />;

  const handleApplyCurriculum = async () => {
    if (!turma.course_id) {
      toast.error("Esta turma não está ligada a um curso.");
      return;
    }
    setApplyingCurriculum(true);
    try {
      const result = await applyCurriculumToClassGroup({
        data: { classGroupId: turma.id, programId: turma.course_id },
      });
      await refreshAcademic();
      if (result.appliedCount === 0) {
        toast.info(
          "Nenhuma disciplina nova por aplicar — o currículo já está reflectido nesta turma.",
        );
      } else {
        toast.success(
          `${result.appliedCount} disciplina(s) do currículo do curso aplicada(s) à turma.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível aplicar o currículo.");
    } finally {
      setApplyingCurriculum(false);
    }
  };

  const occupancyPct = turma.capacity
    ? Math.min(100, Math.round((turma.enrolled_count / turma.capacity) * 100))
    : 0;

  return (
    <AppShell>
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
          <Link to="/pedagogica" search={{ tab: "turmas" }}>
            <ArrowLeft className="size-4" /> Turmas
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-xl font-extrabold text-foreground">
                {turma.name}
              </h1>
              <Badge variant={turma.status === "active" ? "default" : "secondary"}>
                {turma.status === "active" ? "Activa" : "Inactiva"}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {turma.grade_name} · {turma.course_name} · {shiftLabelMap[turma.shift] ?? turma.shift}{" "}
              · {turma.academic_year_name}
            </p>
          </div>
          {canManageTurma ? (
            <div className="flex flex-wrap items-center gap-2">
              {turma.status === "active" ? (
                <Button asChild size="sm" className="gap-1.5">
                  <Link to="/alunos" search={{ action: "matricular", classGroupId: turma.id }}>
                    <UserPlus className="size-3.5" /> Matricular nesta turma
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setAssignOpen(true)}
              >
                <UserPlus className="size-3.5" /> Professor
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5">
                    <MoreHorizontal className="size-4" /> Mais opções
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>Gestão da turma</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil className="size-4" /> Editar dados da turma
                  </DropdownMenuItem>
                  {turma.course_id ? (
                    <DropdownMenuItem
                      disabled={applyingCurriculum}
                      onSelect={() => void handleApplyCurriculum()}
                    >
                      <BookOpen className="size-4" /> Aplicar currículo do curso
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    disabled={!alunos.length}
                    onSelect={() =>
                      exportCsv(
                        `alunos-turma-${turma.code}`,
                        [
                          { label: "Nome", value: (row: (typeof alunos)[number]) => row.student_name },
                          {
                            label: "N.º de processo",
                            value: (row: (typeof alunos)[number]) =>
                              String(row.registration_number ?? ""),
                          },
                        ],
                        alunos,
                      )
                    }
                  >
                    <Download className="size-4" /> Exportar alunos (CSV)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {turma.status !== "active" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={reactivating}
                  onClick={async () => {
                    setReactivating(true);
                    try {
                      await updateClassGroup({
                        data: {
                          id: turma.id,
                          code: turma.code,
                          name: turma.name,
                          // Só o estado: o turno, a lotação e o grupo de WhatsApp ficam.
                          status: "active",
                        },
                      });
                      await refreshAcademic();
                      toast.success("Turma reactivada.");
                    } catch (err) {
                      toast.error(errorMessage(err, "Não foi possível reactivar a turma."));
                    } finally {
                      setReactivating(false);
                    }
                  }}
                >
                  <RotateCcw className="size-3.5" /> Reactivar
                </Button>
              ) : null}
              <ConfirmActionModal
                trigger={(openConfirm) =>
                  turma.status === "active" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive"
                      onClick={openConfirm}
                    >
                      <Trash2 className="size-3.5" /> Desactivar
                    </Button>
                  ) : null
                }
                eyebrow="Turma"
                title="Desactivar esta turma?"
                description={`"${turma.name}" será marcada como inactiva. ${turma.enrolled_count > 0 ? `Tem ${turma.enrolled_count} aluno(s) matriculado(s) — a operação será recusada até transferir ou anular essas matrículas.` : "Não tem matrículas activas."}`}
                confirmLabel="Desactivar turma"
                onConfirm={async () => {
                  try {
                    await deleteClassGroup({ data: { id: turma.id } });
                    await refreshAcademic();
                    toast.success("Turma desactivada.");
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Não foi possível desactivar a turma.",
                    );
                    throw err;
                  }
                }}
              />
            </div>
          ) : null}
        </div>

        <div
          className={
            account.role === "Professor"
              ? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]"
              : "space-y-4"
          }
        >
          <section
            id={sectionId("resumo")}
            aria-labelledby={`${sectionId("resumo")}-titulo`}
            className={
              account.role === "Professor"
                ? "scroll-mt-[88px] rounded-xl border border-border bg-card p-4 xl:col-start-1"
                : "scroll-mt-[88px] rounded-xl border border-border bg-card p-4"
            }
          >
            <div className="flex items-center gap-2.5">
              <IconChip icon={GraduationCap} size="sm" label="Resumo" />
              <h2
                id={`${sectionId("resumo")}-titulo`}
                tabIndex={-1}
                className="font-display text-base font-bold"
              >
                Resumo
              </h2>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-secondary/10 p-3">
                <span className="text-xs font-semibold text-muted-foreground">Ocupação</span>
                <p className="mt-2 text-2xl font-extrabold tabular-nums">
                  {turma.enrolled_count}
                  <span className="text-sm font-medium text-muted-foreground">
                    {" "}
                    / {turma.capacity ?? "—"}
                  </span>
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${occupancyPct >= 90 ? "bg-destructive" : occupancyPct >= 70 ? "bg-warning" : "bg-success"}`}
                    style={{ width: `${occupancyPct}%` }}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-border bg-secondary/10 p-3">
                <span className="text-xs font-semibold text-muted-foreground">Média Geral</span>
                <p className="mt-2 text-2xl font-extrabold tabular-nums">
                  {turma.average_score != null ? turma.average_score.toFixed(1) : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/10 p-3">
                <span className="text-xs font-semibold text-muted-foreground">Assiduidade</span>
                <p className="mt-2 text-2xl font-extrabold tabular-nums">
                  {turma.attendance_rate != null ? `${Math.round(turma.attendance_rate)}%` : "—"}
                </p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
              <Field label="Código" value={turma.code} />
              <Field
                label="Sala"
                value={
                  turma.room_name && turma.room_name !== "—" ? turma.room_name : "Sem sala fixa"
                }
              />
              <Field label="Campus" value={turma.campus_name || "—"} />
              {turma.whatsapp_invite_url ? (
                <div>
                  <dt className="text-muted-foreground">WhatsApp</dt>
                  <dd className="mt-0.5 text-sm font-medium">
                    <a
                      href={safeHref(turma.whatsapp_invite_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {turma.whatsapp_group_name || "Abrir grupo"}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            {classRelations.length > 0 || classSuggestions.length > 0 ? (
              <details className="mt-3 rounded-lg border border-border bg-secondary/10 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-foreground focus-visible:outline-2">
                  Relações e próximas acções
                </summary>
                <div className="mb-3 mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {classRelations.map((relation) => (
                    <div key={relation.key} className="flex items-center gap-2 text-xs">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          relation.status === "ok"
                            ? "bg-success"
                            : relation.status === "attention"
                              ? "bg-warning"
                              : relation.status === "critical"
                                ? "bg-destructive"
                                : "bg-muted-foreground/40"
                        }`}
                      />
                      <span className="font-medium text-foreground">{relation.label}</span>
                      <span className="text-muted-foreground">· {relation.summary}</span>
                    </div>
                  ))}
                </div>
                {classSuggestions.length > 0 ? (
                  <>
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      Próximas ações
                    </p>
                    <div className="space-y-2">
                      {classSuggestions.slice(0, 4).map((suggestion) => (
                        <div
                          key={suggestion.id}
                          className="rounded-lg border border-border/70 p-2.5 text-xs"
                        >
                          <p className="font-semibold text-foreground">{suggestion.title}</p>
                          {suggestion.description ? (
                            <p className="mt-0.5 text-muted-foreground">{suggestion.description}</p>
                          ) : null}
                          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                            {suggestion.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </details>
            ) : null}
          </section>

          <div
            className={
              account.role === "Professor"
                ? "grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 xl:col-start-1 xl:grid-cols-1 2xl:grid-cols-2"
                : "grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2"
            }
          >
            <div className="min-w-0 space-y-4">
              <section
                id={sectionId("alunos")}
                aria-labelledby={`${sectionId("alunos")}-titulo`}
                className="scroll-mt-[88px] rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-2.5">
                  <IconChip icon={Users} size="sm" label="Alunos" />
                  <h2
                    id={`${sectionId("alunos")}-titulo`}
                    tabIndex={-1}
                    className="font-display text-base font-bold"
                  >
                    Alunos ({alunos.length})
                  </h2>
                </div>
                <div className="mt-4">
                  {alunos.length > 0 ? (
                    <div className="mb-3 space-y-2">
                      <label htmlFor="turma-alunos-pesquisa" className="text-xs font-medium">
                        Procurar aluno nesta turma
                      </label>
                      <Input
                        id="turma-alunos-pesquisa"
                        type="search"
                        placeholder="Nome ou número de processo"
                        value={searchValue}
                        onChange={(event) =>
                          setStudentSearch({ classId: turmaId, value: event.target.value })
                        }
                        aria-describedby="turma-alunos-resultados"
                      />
                      <p
                        id="turma-alunos-resultados"
                        role="status"
                        className="text-xs text-muted-foreground"
                      >
                        {filteredStudents.length} de {alunos.length} alunos
                      </p>
                    </div>
                  ) : null}
                  {filteredStudents.length ? (
                    <div className="rounded-lg border border-border bg-card">
                      {visibleStudents.map((aluno) => (
                        <div
                          key={aluno.id}
                          className="flex min-w-0 items-center gap-1 border-b border-border last:border-b-0 hover:bg-secondary/40"
                        >
                          {aluno.student_id ? (
                            <Link
                              to="/alunos/$studentId"
                              params={{ studentId: aluno.student_id }}
                              className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2.5 text-xs focus-visible:outline-2"
                            >
                              <span className="min-w-0 truncate font-medium text-foreground">
                                {aluno.student_name}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                {aluno.registration_number || "—"}
                              </span>
                            </Link>
                          ) : (
                            <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2.5 text-xs">
                              <span className="truncate font-medium">{aluno.student_name}</span>
                              <span className="text-muted-foreground">
                                {aluno.registration_number || "—"}
                              </span>
                            </div>
                          )}
                          {aluno.student_id ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="mr-1 shrink-0"
                                  aria-label={`Acções de ${aluno.student_name}`}
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel className="truncate">
                                  {aluno.student_name}
                                </DropdownMenuLabel>
                                <DropdownMenuItem asChild>
                                  <Link
                                    to="/alunos/$studentId"
                                    params={{ studentId: aluno.student_id }}
                                  >
                                    <Users className="size-4" /> Ver ficha do aluno
                                  </Link>
                                </DropdownMenuItem>
                                {canReadStudentSection(
                                  "academico",
                                  account.role,
                                  account.grants,
                                ) ? (
                                  <DropdownMenuItem asChild>
                                    <Link
                                      to="/alunos/$studentId"
                                      params={{ studentId: aluno.student_id }}
                                      search={{ secao: "academico" }}
                                    >
                                      <GraduationCap className="size-4" /> Dados académicos
                                    </Link>
                                  </DropdownMenuItem>
                                ) : null}
                                {canReadStudentSection(
                                  "financeiro",
                                  account.role,
                                  account.grants,
                                ) ? (
                                  <DropdownMenuItem asChild>
                                    <Link
                                      to="/alunos/$studentId"
                                      params={{ studentId: aluno.student_id }}
                                      search={{ secao: "financeiro" }}
                                    >
                                      <BookOpen className="size-4" /> Propinas e finanças
                                    </Link>
                                  </DropdownMenuItem>
                                ) : null}
                                {canReadStudentSection(
                                  "documentos",
                                  account.role,
                                  account.grants,
                                ) ? (
                                  <DropdownMenuItem asChild>
                                    <Link
                                      to="/alunos/$studentId"
                                      params={{ studentId: aluno.student_id }}
                                      search={{ secao: "documentos" }}
                                    >
                                      <BookOpen className="size-4" /> Documentos do aluno
                                    </Link>
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      {alunos.length
                        ? "Nenhum aluno corresponde à pesquisa nesta turma."
                        : "Nenhum aluno matriculado nesta turma ainda."}
                      {alunos.length > 0 ? (
                        <Button
                          type="button"
                          variant="link"
                          className="mt-2 block w-full"
                          onClick={() => setStudentSearch({ classId: turmaId, value: "" })}
                        >
                          Limpar pesquisa
                        </Button>
                      ) : null}
                    </div>
                  )}
                  {filteredStudents.length > 10 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full gap-1.5"
                      aria-expanded={expanded.alunos}
                      onClick={() => toggleList("alunos")}
                    >
                      {expanded.alunos ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                      {expanded.alunos
                        ? "Mostrar menos"
                        : `Mostrar todos os ${filteredStudents.length} alunos`}
                    </Button>
                  ) : null}
                </div>
              </section>

              <section
                id={sectionId("horario")}
                aria-labelledby={`${sectionId("horario")}-titulo`}
                className="scroll-mt-[88px] rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-2.5">
                  <IconChip icon={Calendar} size="sm" label="Horário" />
                  <h2
                    id={`${sectionId("horario")}-titulo`}
                    tabIndex={-1}
                    className="font-display text-base font-bold"
                  >
                    Horário ({horario.length})
                  </h2>
                </div>
                {availableDays.length > 1 ? (
                  <div className="mt-3 max-w-56">
                    <Select
                      value={String(selectedDay)}
                      onValueChange={(value) => {
                        setScheduleDayFilter({
                          classId: turmaId,
                          day: value === "todos" ? "todos" : Number(value),
                        });
                        setExpandedLists((current) => ({
                          ...(current.classId === turmaId
                            ? current
                            : { classId: turmaId, alunos: false, horario: false, avaliacoes: false }),
                          horario: false,
                        }));
                      }}
                    >
                      <SelectTrigger aria-label="Filtrar horário por dia" className="h-10">
                        <SelectValue placeholder="Todos os dias" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os dias</SelectItem>
                        {availableDays.map((day) => (
                          <SelectItem key={day} value={String(day)}>
                            {weekdayLabels[day]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="mt-3">
                  {horario.length ? (
                    <div className="divide-y divide-border rounded-lg border border-border bg-card">
                      {visibleSchedule.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between gap-2 p-3 text-xs"
                        >
                          <span className="font-medium text-foreground">
                            {weekdayLabels[slot.weekday] ?? slot.weekday}
                          </span>
                          <span className="text-muted-foreground">
                            {slot.starts_at}–{slot.ends_at} ·{" "}
                            {slot.subject_name || slot.label || "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      Sem horário definido para esta turma.
                    </p>
                  )}
                  {scheduleSelection.total > 8 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full gap-1.5"
                      aria-expanded={expanded.horario}
                      onClick={() => toggleList("horario")}
                    >
                      {expanded.horario ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                      {expanded.horario ? "Mostrar menos" : `Ver todos os ${scheduleSelection.total} tempos`}
                    </Button>
                  ) : null}
                  {horario.length ? (
                    <p role="status" className="mt-2 text-xs text-muted-foreground">
                      {visibleSchedule.length} de {scheduleSelection.total} tempos no filtro
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
            <div className="min-w-0 space-y-4">
              <section
                id={sectionId("disciplinas")}
                aria-labelledby={`${sectionId("disciplinas")}-titulo`}
                className="scroll-mt-[88px] rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-2.5">
                  <IconChip icon={BookOpen} size="sm" label="Professores e disciplinas" />
                  <h2
                    id={`${sectionId("disciplinas")}-titulo`}
                    tabIndex={-1}
                    className="font-display text-base font-bold"
                  >
                    Professores &amp; Disciplinas ({disciplinas.length})
                  </h2>
                </div>
                <div className="mt-4">
                  {disciplinas.length ? (
                    <div className="divide-y divide-border rounded-lg border border-border bg-card">
                      {disciplinas.map((row) => (
                        <div
                          key={`${row.subject_id}-${row.teacher_id ?? "sem-professor"}`}
                          className="flex items-center justify-between gap-2 p-3 text-xs"
                        >
                          <Link
                            to="/pedagogica"
                            search={{ tab: "notas", turma: turma.id, disciplina: row.subject_id }}
                            className="min-w-0 font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {row.subject_name}
                          </Link>
                          {row.teacher_id && row.teacher_name ? (
                            <Link
                              to="/professores/$teacherId"
                              params={{ teacherId: row.teacher_id }}
                              className="min-w-0 truncate text-right text-muted-foreground hover:text-primary hover:underline"
                            >
                              {row.teacher_name}
                            </Link>
                          ) : (
                            <span className="text-warning">Sem professor atribuído</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      Nenhuma disciplina associada a esta turma ainda.
                    </p>
                  )}
                </div>
              </section>

              <section
                id={sectionId("avaliacoes")}
                aria-labelledby={`${sectionId("avaliacoes")}-titulo`}
                className="scroll-mt-[88px] rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-2.5">
                  <IconChip icon={GraduationCap} size="sm" label="Avaliações" />
                  <h2
                    id={`${sectionId("avaliacoes")}-titulo`}
                    tabIndex={-1}
                    className="font-display text-base font-bold"
                  >
                    Avaliações
                  </h2>
                </div>
                <div className="mt-4">
                  {avaliacoes.length ? (
                    <div className="divide-y divide-border rounded-lg border border-border bg-card">
                      {visibleGrades.map((grade) => (
                        <div
                          key={grade.id}
                          className="flex items-center justify-between gap-2 p-3 text-xs"
                        >
                          <span className="min-w-0 truncate font-medium text-foreground">
                            {grade.student_name} · {grade.term}º trimestre
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            Média: {grade.average?.toFixed(1) ?? "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      Ainda sem avaliações lançadas para os alunos desta turma.
                    </p>
                  )}
                  {avaliacoes.length > 8 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full gap-1.5"
                      aria-expanded={expanded.avaliacoes}
                      onClick={() => toggleList("avaliacoes")}
                    >
                      {expanded.avaliacoes ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                      {expanded.avaliacoes
                        ? "Mostrar menos"
                        : `Ver todas as ${avaliacoes.length} avaliações`}
                    </Button>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
          {account.role === "Professor" ? (
            <TurmaTeacherContextPanel classGroupId={turma.id} weeklySlots={horario.length} />
          ) : null}
        </div>
      </div>

      <TurmaEditSubModal
        open={editOpen}
        onOpenChange={setEditOpen}
        turma={turma}
        salas={activeClassrooms}
        onSaved={refreshAcademic}
      />
      <TurmaAssignTeacherSubModal
        open={assignOpen}
        onOpenChange={setAssignOpen}
        classGroupId={turma.id}
        gradeName={turma.grade_name}
        subjectOptions={(workspace?.subjects ?? []).map((s) => s.name)}
        subjectIds={(workspace?.subjects ?? []).map((s) => s.id)}
        teacherOptions={teacherOptions}
        teacherIds={teacherIds}
        onAssigned={refreshAcademic}
      />
    </AppShell>
  );
}
