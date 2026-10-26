import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  GraduationCap,
  Pencil,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
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
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { mapClassGroupToSnapshot } from "@/features/intelligence/classes/class-relations-adapter";
import { useRelations } from "@/features/intelligence/use-relations";
import { useSuggestions } from "@/features/intelligence/use-suggestions";
import { errorMessage } from "@/lib/error-message";
import { safeHref } from "@/lib/safe-url";

export const Route = createFileRoute("/pedagogica_/turmas/$turmaId")({
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

function TurmaDetail() {
  const { turmaId } = Route.useParams();
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const { school, selectedYearId } = useSchoolSettings();
  const canManageAcademic = canWriteModule(account.role, "pedagogica", account.grants);
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
    enabled: canManageAcademic,
  });
  const classroomsQuery = useQuery({
    queryKey: ["academic", "rooms"],
    queryFn: () => listRooms(),
    enabled: canReadAcademic,
  });

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
  const avaliacoes = useMemo(() => {
    const alunoIds = new Set(alunos.map((a) => a.student_id).filter(Boolean));
    return (workspace?.termGrades ?? []).filter(
      (row) => row.student_id && alunoIds.has(row.student_id),
    );
  }, [workspace?.termGrades, alunos]);

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
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
          <Link to="/pedagogica" search={{ tab: "turmas" }}>
            <ArrowLeft className="size-4" /> Turmas
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-gradient-to-r from-card via-card to-secondary/30 p-5 shadow-soft">
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setAssignOpen(true)}
            >
              <UserPlus className="size-3.5" /> Professor
            </Button>
            {turma.course_id ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={applyingCurriculum}
                onClick={handleApplyCurriculum}
              >
                <BookOpen className="size-3.5" /> Aplicar currículo do curso
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-3.5" /> Editar
            </Button>
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
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <IconChip icon={GraduationCap} size="sm" label="Resumo" />
              <h2 className="font-display text-base font-bold">Resumo</h2>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-secondary/10 p-4">
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
              <div className="rounded-xl border border-border bg-secondary/10 p-4">
                <span className="text-xs font-semibold text-muted-foreground">Média Geral</span>
                <p className="mt-2 text-2xl font-extrabold tabular-nums">
                  {turma.average_score != null ? turma.average_score.toFixed(1) : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/10 p-4">
                <span className="text-xs font-semibold text-muted-foreground">Assiduidade</span>
                <p className="mt-2 text-2xl font-extrabold tabular-nums">
                  {turma.attendance_rate != null ? `${Math.round(turma.attendance_rate)}%` : "—"}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
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
              <div className="mt-4 rounded-xl border border-border bg-secondary/10 p-5">
                <p className="mb-3 text-xs font-semibold text-muted-foreground">Relacionado</p>
                <div className="mb-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2.5">
              <IconChip icon={Users} size="sm" label="Alunos" />
              <h2 className="font-display text-base font-bold">Alunos ({alunos.length})</h2>
            </div>
            <div className="mt-4">
              {alunos.length ? (
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {alunos.map((aluno) => (
                    <Link
                      key={aluno.id}
                      to="/alunos/$studentId"
                      params={{ studentId: aluno.student_id ?? "" }}
                      className="flex items-center justify-between gap-2 p-3 text-xs hover:bg-secondary/40"
                    >
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {aluno.student_name}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {aluno.registration_number || "—"}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Nenhum aluno matriculado nesta turma ainda.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2.5">
              <IconChip icon={BookOpen} size="sm" label="Professores e disciplinas" />
              <h2 className="font-display text-base font-bold">
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
                      <span className="font-medium text-foreground">{row.subject_name}</span>
                      <span className={row.teacher_name ? "text-muted-foreground" : "text-warning"}>
                        {row.teacher_name || "Sem professor atribuído"}
                      </span>
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

          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2.5">
              <IconChip icon={Calendar} size="sm" label="Horário" />
              <h2 className="font-display text-base font-bold">Horário ({horario.length})</h2>
            </div>
            <div className="mt-4">
              {horario.length ? (
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {horario.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between gap-2 p-3 text-xs"
                    >
                      <span className="font-medium text-foreground">
                        {weekdayLabels[slot.weekday] ?? slot.weekday}
                      </span>
                      <span className="text-muted-foreground">
                        {slot.starts_at}–{slot.ends_at} · {slot.subject_name || slot.label || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Sem horário definido para esta turma.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2.5">
              <IconChip icon={GraduationCap} size="sm" label="Avaliações" />
              <h2 className="font-display text-base font-bold">Avaliações</h2>
            </div>
            <div className="mt-4">
              {avaliacoes.length ? (
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {avaliacoes.map((grade) => (
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
            </div>
          </section>
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
