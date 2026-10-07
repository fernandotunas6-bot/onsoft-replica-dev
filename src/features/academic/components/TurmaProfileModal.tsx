import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  ModalShell,
  ModalSidebar,
  SubModal,
  type ModalSidebarItem,
} from "@/components/ui/modal-system";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import {
  assignClassSubjectTeacher,
  applyCurriculumToClassGroup,
  deleteClassGroup,
  updateClassGroup,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import { isClassTeacherLevel } from "@/lib/academic-nav";
import { errorMessage } from "@/lib/error-message";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { mapClassGroupToSnapshot } from "@/features/intelligence/classes/class-relations-adapter";
import { useRelations } from "@/features/intelligence/use-relations";
import { useSuggestions } from "@/features/intelligence/use-suggestions";
import { safeHref } from "@/lib/safe-url";

type SalaOption = { id: string; name: string; capacity: number | null };

const weekdayLabels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const shiftLabelMap: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
};
const shiftValueMap: Record<string, string> = {
  Manhã: "morning",
  Tarde: "afternoon",
  Noite: "evening",
};

export function TurmaProfileModal({
  open,
  onOpenChange,
  classGroupId,
  workspace,
  teacherOptions,
  teacherIds,
  salas = [],
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classGroupId: string | null;
  workspace: PedagogicalWorkspace | undefined;
  teacherOptions: string[];
  teacherIds: string[];
  /** Salas físicas activas (`rooms`) para escolher na edição. */
  salas?: SalaOption[];
  onRefresh: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState("resumo");
  const [editOpen, setEditOpen] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [applyingCurriculum, setApplyingCurriculum] = useState(false);
  const { school } = useSchoolSettings();

  // Memoizados: cada um alimenta, directa ou indirectamente, focusedClassEntity
  // (via classRelationsSnapshot) abaixo. useDeclareEntityFocus exige que a
  // entidade só mude de referência quando o conteúdo muda de facto — recriar
  // estes arrays a cada render (com .filter() sem useMemo) fazia
  // focusedClassEntity mudar sempre, disparando o efeito de
  // useDeclareEntityFocus em loop ("Maximum update depth exceeded").
  const turma = useMemo(
    () => workspace?.classGroups.find((group) => group.id === classGroupId),
    [workspace?.classGroups, classGroupId],
  );
  const alunos = useMemo(
    () => (workspace?.enrollmentOptions ?? []).filter((row) => row.class_group_id === classGroupId),
    [workspace?.enrollmentOptions, classGroupId],
  );
  const disciplinas = useMemo(
    () => (workspace?.classSubjects ?? []).filter((row) => row.class_group_id === classGroupId),
    [workspace?.classSubjects, classGroupId],
  );
  const horario = useMemo(
    () =>
      (workspace?.scheduleSlots ?? [])
        .filter((row) => row.class_group_id === classGroupId)
        .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at)),
    [workspace?.scheduleSlots, classGroupId],
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
    if (!open || !turma || !classRelationsSnapshot) return null;
    return {
      type: "class" as const,
      id: turma.id,
      label: turma.name,
      schoolId: school?.id ?? "",
      data: classRelationsSnapshot,
    };
  }, [open, turma, classRelationsSnapshot, school?.id]);
  useDeclareEntityFocus(focusedClassEntity);
  const classRelations = useRelations();
  const classSuggestions = useSuggestions();

  if (!open || !classGroupId || !turma) return null;

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
      await onRefresh();
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

  const sidebarItems: ModalSidebarItem[] = [
    { value: "resumo", label: "Resumo", icon: GraduationCap },
    { value: "alunos", label: `Alunos (${alunos.length})`, icon: Users },
    {
      value: "disciplinas",
      label: `Professores & Disciplinas (${disciplinas.length})`,
      icon: BookOpen,
    },
    { value: "horario", label: `Horário (${horario.length})`, icon: Calendar },
    { value: "avaliacoes", label: "Avaliações", icon: GraduationCap },
  ];

  const occupancyPct = turma.capacity
    ? Math.min(100, Math.round((turma.enrolled_count / turma.capacity) * 100))
    : 0;

  return (
    <ModalShell open={open} onOpenChange={onOpenChange} size="2xl">
      <div className="flex h-full max-h-[88vh] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-card to-secondary/30 px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-extrabold text-foreground">{turma.name}</h2>
              <Badge variant={turma.status === "active" ? "default" : "secondary"}>
                {turma.status === "active" ? "Activa" : "Inactiva"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {turma.grade_name} · {turma.course_name} · {shiftLabelMap[turma.shift] ?? turma.shift}{" "}
              · {turma.academic_year_name}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
                        shift: (["morning", "afternoon", "evening"].includes(turma.shift)
                          ? turma.shift
                          : "morning") as "morning" | "afternoon" | "evening",
                        capacity: turma.capacity ?? undefined,
                        status: "active",
                      },
                    });
                    await onRefresh();
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
                  await onRefresh();
                  onOpenChange(false);
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

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="vertical"
          className="flex min-h-0 flex-1 flex-col sm:flex-row"
        >
          <ModalSidebar items={sidebarItems} />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-secondary/10 p-6">
            <TabsContent value="resumo" className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
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
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <span className="text-xs font-semibold text-muted-foreground">Média Geral</span>
                  <p className="mt-2 text-2xl font-extrabold tabular-nums">
                    {turma.average_score != null ? turma.average_score.toFixed(1) : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <span className="text-xs font-semibold text-muted-foreground">Assiduidade</span>
                  <p className="mt-2 text-2xl font-extrabold tabular-nums">
                    {turma.attendance_rate != null ? `${Math.round(turma.attendance_rate)}%` : "—"}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <dl className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Código</dt>
                    <dd className="mt-0.5 text-sm font-medium">{turma.code}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Sala</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {turma.room_name && turma.room_name !== "—"
                        ? turma.room_name
                        : "Sem sala fixa"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Campus</dt>
                    <dd className="mt-0.5 text-sm font-medium">{turma.campus_name || "—"}</dd>
                  </div>
                  {turma.whatsapp_invite_url ? (
                    <div className="sm:col-span-2">
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
              </div>
              {classRelations.length > 0 || classSuggestions.length > 0 ? (
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
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
                              <p className="mt-0.5 text-muted-foreground">
                                {suggestion.description}
                              </p>
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
            </TabsContent>

            <TabsContent value="alunos">
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
            </TabsContent>

            <TabsContent value="disciplinas">
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
            </TabsContent>

            <TabsContent value="horario">
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
            </TabsContent>

            <TabsContent value="avaliacoes">
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
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <TurmaEditSubModal
        open={editOpen}
        onOpenChange={setEditOpen}
        turma={turma}
        salas={salas}
        onSaved={onRefresh}
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
        onAssigned={onRefresh}
      />
    </ModalShell>
  );
}

function TurmaEditSubModal({
  open,
  onOpenChange,
  turma,
  salas,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salas: SalaOption[];
  turma: {
    id: string;
    code: string;
    name: string;
    shift: string;
    capacity: number | null;
    campus_id: string | null;
    room_id: string | null;
    status: string;
    whatsapp_invite_url?: string | null;
    whatsapp_group_name?: string | null;
  };
  onSaved: () => Promise<void>;
}) {
  const whatsappOn = useInstalledIntegrations().hasCapability("whatsapp.class_groups");
  const [code, setCode] = useState(turma.code);
  const [name, setName] = useState(turma.name);
  const [shift, setShift] = useState(shiftLabelMap[turma.shift] ?? "Manhã");
  const [capacity, setCapacity] = useState(String(turma.capacity ?? 35));
  const [roomId, setRoomId] = useState(turma.room_id ?? "");
  const [whatsappGroupName, setWhatsappGroupName] = useState(turma.whatsapp_group_name ?? "");
  const [whatsappInviteUrl, setWhatsappInviteUrl] = useState(turma.whatsapp_invite_url ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await updateClassGroup({
        data: {
          id: turma.id,
          code,
          name,
          shift: (shiftValueMap[shift] ?? "morning") as "morning" | "afternoon" | "evening",
          capacity: Number(capacity) || undefined,
          // Só envia a sala quando muda: "" tira a sala fixa.
          ...(roomId !== (turma.room_id ?? "") ? { roomId: roomId || null } : {}),
          whatsappInviteUrl: whatsappInviteUrl.trim() || undefined,
          whatsappGroupName: whatsappGroupName.trim() || undefined,
        },
      });
      await onSaved();
      toast.success("Turma actualizada.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível guardar a turma.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubModal
      open={open}
      onOpenChange={onOpenChange}
      title="Editar turma"
      subtitle="Código, nome, sala, turno e capacidade."
      icon={Pencil}
      submitLabel="Guardar"
      isSubmitting={saving}
      hasUnsavedChanges={
        code !== turma.code ||
        name !== turma.name ||
        roomId !== (turma.room_id ?? "") ||
        whatsappGroupName !== (turma.whatsapp_group_name ?? "") ||
        whatsappInviteUrl !== (turma.whatsapp_invite_url ?? "")
      }
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label htmlFor="turma-edit-name" className="space-y-1 text-xs">
          <span className="font-semibold text-muted-foreground">Designação</span>
          <input
            id="turma-edit-name"
            aria-label="Designação da turma"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label htmlFor="turma-edit-code" className="space-y-1 text-xs">
          <span className="font-semibold text-muted-foreground">Código</span>
          <input
            id="turma-edit-code"
            aria-label="Código da turma"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label htmlFor="turma-edit-room" className="space-y-1 text-xs sm:col-span-2">
          <span className="font-semibold text-muted-foreground">Sala</span>
          <select
            id="turma-edit-room"
            aria-label="Sala da turma"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          >
            <option value="">Sem sala fixa</option>
            {salas.map((sala) => (
              <option key={sala.id} value={sala.id}>
                {sala.capacity ? `${sala.name} (${sala.capacity} lugares)` : sala.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="turma-edit-shift" className="space-y-1 text-xs">
          <span className="font-semibold text-muted-foreground">Turno</span>
          <select
            id="turma-edit-shift"
            aria-label="Turno da turma"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={shift}
            onChange={(e) => setShift(e.target.value)}
          >
            <option>Manhã</option>
            <option>Tarde</option>
            <option>Noite</option>
          </select>
        </label>
        <label htmlFor="turma-edit-capacity" className="space-y-1 text-xs">
          <span className="font-semibold text-muted-foreground">Capacidade</span>
          <input
            id="turma-edit-capacity"
            aria-label="Capacidade da turma"
            type="number"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        {whatsappOn ? (
          <>
            <label htmlFor="turma-whatsapp-group" className="space-y-1 text-xs">
              <span className="font-semibold text-muted-foreground">Sala WhatsApp</span>
              <input
                id="turma-whatsapp-group"
                aria-label="Sala WhatsApp"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={whatsappGroupName}
                onChange={(e) => setWhatsappGroupName(e.target.value)}
                placeholder={`Turma ${turma.name}`}
              />
            </label>
            <label htmlFor="turma-whatsapp-invite" className="space-y-1 text-xs sm:col-span-2">
              <span className="font-semibold text-muted-foreground">Link do grupo WhatsApp</span>
              <input
                id="turma-whatsapp-invite"
                aria-label="Link do grupo WhatsApp"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={whatsappInviteUrl}
                onChange={(e) => setWhatsappInviteUrl(e.target.value)}
                placeholder="https://chat.whatsapp.com/…"
              />
            </label>
          </>
        ) : null}
      </div>
    </SubModal>
  );
}

function TurmaAssignTeacherSubModal({
  open,
  onOpenChange,
  classGroupId,
  gradeName,
  subjectOptions,
  subjectIds,
  teacherOptions,
  teacherIds,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classGroupId: string;
  gradeName: string;
  subjectOptions: string[];
  subjectIds: string[];
  teacherOptions: string[];
  teacherIds: string[];
  onAssigned: () => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [teacher, setTeacher] = useState("");
  const [saving, setSaving] = useState(false);

  // Primário e iniciação: um só professor titular leciona todas as disciplinas da turma
  // (monodocência) — mesma detecção usada na navegação lateral (src/lib/academic-nav.ts), para nunca
  // divergir sobre que turmas são monodocentes.
  const monodocente = isClassTeacherLevel(gradeName);

  const handleSubmit = async () => {
    const teacherId = teacherIds[teacherOptions.indexOf(teacher)];
    if (!teacherId) {
      toast.error("Seleccione o professor.");
      return;
    }
    if (monodocente) {
      if (subjectIds.length === 0) {
        toast.error("Não há disciplinas no catálogo da escola para atribuir.");
        return;
      }
      setSaving(true);
      try {
        await Promise.all(
          subjectIds.map((subjectId) =>
            assignClassSubjectTeacher({ data: { classGroupId, subjectId, teacherId } }),
          ),
        );
        await onAssigned();
        toast.success(`Professor titular atribuído a ${subjectIds.length} disciplina(s).`);
        setTeacher("");
        onOpenChange(false);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Não foi possível atribuir o professor titular.",
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    const subjectId = subjectIds[subjectOptions.indexOf(subject)];
    if (!subjectId) {
      toast.error("Seleccione a disciplina e o professor.");
      return;
    }
    setSaving(true);
    try {
      await assignClassSubjectTeacher({ data: { classGroupId, subjectId, teacherId } });
      await onAssigned();
      toast.success("Professor atribuído à disciplina.");
      setSubject("");
      setTeacher("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atribuir o professor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubModal
      open={open}
      onOpenChange={onOpenChange}
      title={monodocente ? "Professor titular da turma" : "Atribuir professor"}
      subtitle={
        monodocente
          ? "Turma de regime monodocente — este professor fica responsável por todas as disciplinas."
          : "Liga um docente a uma disciplina desta turma."
      }
      icon={UserPlus}
      submitLabel={monodocente ? "Atribuir a todas as disciplinas" : "Atribuir"}
      isSubmitting={saving}
      hasUnsavedChanges={Boolean(subject || teacher)}
      onSubmit={handleSubmit}
    >
      <div className="space-y-3">
        {!monodocente ? (
          <label htmlFor="turma-assign-subject" className="block space-y-1 text-xs">
            <span className="font-semibold text-muted-foreground">Disciplina</span>
            <select
              id="turma-assign-subject"
              aria-label="Disciplina"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">Seleccione…</option>
              {subjectOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Regime monodocente: ao gravar, este professor é atribuído às {subjectIds.length}{" "}
            disciplina(s) do catálogo da escola nesta turma.
          </p>
        )}
        <label htmlFor="turma-assign-teacher" className="block space-y-1 text-xs">
          <span className="font-semibold text-muted-foreground">Professor</span>
          <select
            id="turma-assign-teacher"
            aria-label="Professor"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
          >
            <option value="">Seleccione…</option>
            {teacherOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
    </SubModal>
  );
}
