import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Copy,
  DoorOpen,
  Eye,
  Pencil,
  Plus,
  Send,
  Search,
  Trash2,
  User,
  Users,
  Sparkles,
} from "lucide-react";
import { Panel } from "@/components/layout/PageHeader";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ScheduleClassGroup,
  ScheduleClassSubject,
  ScheduleRoom,
  ScheduleSlot,
  ScheduleSlotInput,
  ScheduleSlotUpdate,
  ScheduleSubject,
  ScheduleTeacher,
} from "./types";
import { detectScheduleConflicts } from "./utils/conflicts";
import { getWeeklyScheduleCoverage } from "./utils/workload";
import { toast } from "sonner";

const weekdays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
const weekdayByLabel = new Map<string, number>(weekdays.map((label, index) => [label, index + 1]));

function optionLabel(id: string, label: string) {
  return `${label} · ${id.slice(0, 8)}`;
}

function timeValue(value: string) {
  return value.slice(0, 5);
}

function weekdayLabel(value: number) {
  return weekdays[value - 1] ?? `Dia ${value}`;
}

function gridRows(slots: ScheduleSlot[]) {
  const ranges = Array.from(
    new Set(slots.map((slot) => `${timeValue(slot.starts_at)} – ${timeValue(slot.ends_at)}`)),
  ).sort();

  return ranges.map((range) => {
    const [start] = range.split(" – ");
    return {
      range,
      cells: weekdays.map((_, index) => {
        const daySlots = slots.filter(
          (slot) =>
            slot.weekday === index + 1 &&
            `${timeValue(slot.starts_at)} – ${timeValue(slot.ends_at)}` === range,
        );
        return { slot: daySlots[0], additionalCount: Math.max(0, daySlots.length - 1) };
      }),
    };
  });
}

export function ScheduleWorkspace({
  activeYearLabel,
  activeYearId,
  canManage,
  scheduleAvailable,
  classGroups,
  subjects,
  classSubjects = [],
  rooms = [],
  teachers = [],
  slots,
  virtualRooms,
  onCreateSlot,
  onUpdateSlot,
  onDeleteSlot,
  onPublishSchedule,
}: {
  activeYearLabel: string;
  activeYearId?: string;
  canManage: boolean;
  scheduleAvailable: boolean;
  classGroups: ScheduleClassGroup[];
  subjects: ScheduleSubject[];
  classSubjects?: ScheduleClassSubject[];
  rooms?: ScheduleRoom[];
  teachers?: ScheduleTeacher[];
  slots: ScheduleSlot[];
  virtualRooms: Array<{ label: string; url: string }>;
  onCreateSlot: (input: ScheduleSlotInput) => Promise<void>;
  onUpdateSlot: (input: ScheduleSlotUpdate) => Promise<void>;
  onDeleteSlot: (slotId: string) => Promise<void>;
  onPublishSchedule?: (classGroupId: string) => Promise<void>;
}) {
  const [viewMode, setViewMode] = useState<"turma" | "professor" | "sala">("turma");
  const [classGroupId, setClassGroupId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [query, setQuery] = useState("");
  const [publishing, setPublishing] = useState(false);

  // Seleções ativas por modo
  const selectedClassGroupId =
    classGroupId ||
    slots.find((slot) => slot.class_group_id)?.class_group_id ||
    classGroups[0]?.id ||
    "";
  const selectedClassGroup = classGroups.find((group) => group.id === selectedClassGroupId);

  const selectedTeacherId = teacherId || teachers[0]?.id || "";
  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId);

  const selectedRoomId = roomId || rooms[0]?.id || "";
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  // Filtrar slots conforme modo de visualização
  const currentSlots = useMemo(() => {
    if (viewMode === "professor") {
      return slots.filter((slot) => slot.teacher_id === selectedTeacherId);
    }
    if (viewMode === "sala") {
      return slots.filter(
        (slot) =>
          slot.room_id === selectedRoomId ||
          (selectedRoom &&
            slot.label?.trim().toLowerCase() === selectedRoom.name.trim().toLowerCase()),
      );
    }
    return slots.filter((slot) => slot.class_group_id === selectedClassGroupId);
  }, [viewMode, slots, selectedTeacherId, selectedRoomId, selectedRoom, selectedClassGroupId]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSlots = currentSlots.filter((slot) => {
    if (!normalizedQuery) return true;
    return [
      slot.display_label,
      slot.label,
      slot.room_name,
      slot.subject_name,
      slot.teacher_name,
      slot.class_group_name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
  });

  const conflicts = useMemo(() => detectScheduleConflicts(slots), [slots]);
  const weeklyCoverage = useMemo(
    () => getWeeklyScheduleCoverage(slots, classSubjects, selectedClassGroupId),
    [slots, classSubjects, selectedClassGroupId],
  );
  const hasScheduleGaps = weeklyCoverage.some((item) => item.missingPeriods > 0);
  const selectedConflicts = conflicts.filter((conflict) =>
    conflict.slotIds.some((slotId) => currentSlots.some((slot) => slot.id === slotId)),
  );

  const rows = gridRows(visibleSlots);

  const classGroupOptions = classGroups.map((group) => optionLabel(group.id, group.name));
  const subjectOptions = subjects.map((subject) => optionLabel(subject.id, subject.name));
  const teacherOptions = [
    "Sem professor atribuído",
    ...teachers.map((t) => optionLabel(t.id, t.name)),
  ];
  const roomOptions = [
    "Sem sala fixa",
    ...rooms.map((r) => optionLabel(r.id, `${r.name} (${r.capacity || "?"} lugares)`)),
  ];

  const handleCreateSlot = async (values: Record<string, string | undefined>) => {
    const groupOption = values["turma"] ?? "";
    const subjectOption = values["disciplina"] ?? "";
    const classGroup = classGroups.find(
      (group) => optionLabel(group.id, group.name) === groupOption,
    );
    const subject = subjects.find((item) => optionLabel(item.id, item.name) === subjectOption);
    const weekday = weekdayByLabel.get(values["dia"] ?? "");

    if (!classGroup || !subject || !weekday) {
      throw new Error("Seleccione turma, disciplina e dia da semana.");
    }

    const teacherOpt = values["professor"];
    const resolvedTeacher = teachers.find((t) => optionLabel(t.id, t.name) === teacherOpt);

    const roomOpt = values["sala"];
    const resolvedRoom = rooms.find(
      (r) => optionLabel(r.id, `${r.name} (${r.capacity || "?"} lugares)`) === roomOpt,
    );

    const roomLabel = resolvedRoom?.name || values["rotulo"]?.trim() || "Sala";
    const virtualRoom = virtualRooms.find((item) => item.label === values["salaVirtual"]);

    await onCreateSlot({
      classGroupId: classGroup.id,
      subjectId: subject.id,
      weekday,
      startsAt: values["inicio"] ?? "",
      endsAt: values["fim"] ?? "",
      teacherId: resolvedTeacher?.id ?? null,
      roomId: resolvedRoom?.id ?? null,
      label: virtualRoom ? `${roomLabel} · ${virtualRoom.url}` : roomLabel,
      notes: values["observacoes"]?.trim() || undefined,
    });

    setClassGroupId(classGroup.id);
  };

  const handleEditSlot = async (slot: ScheduleSlot, values: Record<string, string | undefined>) => {
    const weekday = weekdayByLabel.get(values["dia"] ?? "");
    if (!weekday) throw new Error("Seleccione o dia.");

    const teacherOpt = values["professor"];
    const resolvedTeacher = teachers.find((t) => optionLabel(t.id, t.name) === teacherOpt);

    const roomOpt = values["sala"];
    const resolvedRoom = rooms.find(
      (r) => optionLabel(r.id, `${r.name} (${r.capacity || "?"} lugares)`) === roomOpt,
    );
    const roomLabel = resolvedRoom?.name || values["rotulo"]?.trim() || slot.label || "Sala";

    await onUpdateSlot({
      slotId: slot.id,
      weekday,
      startsAt: values["inicio"] ?? "",
      endsAt: values["fim"] ?? "",
      teacherId: resolvedTeacher?.id ?? null,
      roomId: resolvedRoom?.id ?? null,
      label: roomLabel,
      notes: values["observacoes"]?.trim() || undefined,
    });
  };

  const handleCopySlot = async (slot: ScheduleSlot, values: Record<string, string | undefined>) => {
    if (!slot.class_group_id || !slot.subject_id) {
      throw new Error("Este slot não tem turma ou disciplina associada.");
    }
    const weekday = weekdayByLabel.get(values["dia"] ?? "");
    if (!weekday) throw new Error("Seleccione o dia.");

    await onCreateSlot({
      classGroupId: slot.class_group_id,
      subjectId: slot.subject_id,
      weekday,
      startsAt: timeValue(slot.starts_at),
      endsAt: timeValue(slot.ends_at),
      teacherId: slot.teacher_id ?? null,
      roomId: slot.room_id ?? null,
      label: slot.label ?? "Sala",
    });
  };

  const handlePublish = async () => {
    if (!selectedClassGroupId || !onPublishSchedule) return;
    setPublishing(true);
    try {
      await onPublishSchedule(selectedClassGroupId);
      toast.success("Horário publicado e sincronizado com o Calendário Escolar!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao publicar horário.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Panel
      title={
        viewMode === "turma"
          ? selectedClassGroup
            ? `Horário semanal — Turma ${selectedClassGroup.name}`
            : "Horário semanal por Turma"
          : viewMode === "professor"
            ? selectedTeacher
              ? `Horário pessoal — Prof. ${selectedTeacher.name}`
              : "Horário do Professor"
            : selectedRoom
              ? `Ocupação semanal — Sala ${selectedRoom.name}`
              : "Horário da Sala"
      }
      description={
        scheduleAvailable
          ? "Planeamento de aulas sem conflitos, com motor de choques e sincronização com o calendário."
          : "Não foi possível carregar os horários neste momento."
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-full font-medium">
            <CalendarDays className="size-3.5 text-primary" /> {activeYearLabel}
          </span>

          {canManage && scheduleAvailable && classGroups.length > 0 && (
            <>
              {onPublishSchedule && selectedClassGroupId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs border-primary/30 text-primary hover:bg-primary/10 gap-1.5"
                  onClick={handlePublish}
                  disabled={publishing || selectedConflicts.length > 0 || hasScheduleGaps}
                >
                  <Send className="size-3.5" />
                  {publishing ? "A publicar…" : "Publicar Horário"}
                </Button>
              )}

              <QuickFormModal
                title="Nova Aula no Horário"
                eyebrow="Horário Escolar"
                description="Adicione um slot semanal de aula com validação imediata de choque e capacidade."
                icon={<Plus className="size-5" />}
                submitLabel="Adicionar ao Horário"
                onSubmit={handleCreateSlot}
                fields={[
                  {
                    name: "turma",
                    label: "Turma",
                    type: "select",
                    options: classGroupOptions,
                    defaultValue: selectedClassGroup
                      ? optionLabel(selectedClassGroup.id, selectedClassGroup.name)
                      : undefined,
                    required: true,
                    full: true,
                  },
                  {
                    name: "disciplina",
                    label: "Disciplina",
                    type: "select",
                    options: subjectOptions,
                    required: true,
                  },
                  {
                    name: "professor",
                    label: "Professor Responsável",
                    type: "select",
                    options: teacherOptions,
                  },
                  {
                    name: "dia",
                    label: "Dia da Semana",
                    type: "select",
                    options: [...weekdays],
                    required: true,
                  },
                  {
                    name: "inicio",
                    label: "Hora Início",
                    type: "time",
                    defaultValue: "07:00",
                    required: true,
                  },
                  {
                    name: "fim",
                    label: "Hora Fim",
                    type: "time",
                    defaultValue: "07:45",
                    required: true,
                  },
                  { name: "sala", label: "Sala de Aula", type: "select", options: roomOptions },
                  ...(virtualRooms.length > 0
                    ? [
                        {
                          name: "salaVirtual",
                          label: "Sala Virtual (Opcional)",
                          type: "select" as const,
                          options: virtualRooms.map((r) => r.label),
                        },
                      ]
                    : []),
                  {
                    name: "observacoes",
                    label: "Observações",
                    placeholder: "Ex: Aula em laboratório prático",
                    required: false,
                  },
                ]}
                trigger={(open) => (
                  <Button size="sm" className="rounded-xl text-xs gap-1.5" onClick={open}>
                    <Plus className="size-3.5" /> Nova Aula
                  </Button>
                )}
              />
            </>
          )}
        </div>
      }
    >
      {/* Barra de Modos de Visualização & Seletores */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4 mb-4">
        {/* Seletor de Modo */}
        <div className="flex items-center gap-1.5 rounded-xl bg-muted/40 p-1 border border-border/60">
          <Button
            variant={viewMode === "turma" ? "default" : "ghost"}
            size="sm"
            className="rounded-lg text-xs h-7 px-3"
            onClick={() => setViewMode("turma")}
          >
            <Users className="mr-1.5 size-3.5" /> Por Turma
          </Button>

          <Button
            variant={viewMode === "professor" ? "default" : "ghost"}
            size="sm"
            className="rounded-lg text-xs h-7 px-3"
            onClick={() => setViewMode("professor")}
          >
            <User className="mr-1.5 size-3.5" /> Por Professor
          </Button>

          <Button
            variant={viewMode === "sala" ? "default" : "ghost"}
            size="sm"
            className="rounded-lg text-xs h-7 px-3"
            onClick={() => setViewMode("sala")}
          >
            <DoorOpen className="mr-1.5 size-3.5" /> Por Sala
          </Button>
        </div>

        {/* Filtros Contextuais */}
        <div className="flex flex-wrap items-center gap-3">
          {viewMode === "turma" && (
            <select
              aria-label="Filtrar por turma"
              value={selectedClassGroupId}
              onChange={(e) => setClassGroupId(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {classGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  Turma: {group.name} ({group.enrolled_count} alunos)
                </option>
              ))}
            </select>
          )}

          {viewMode === "professor" && (
            <select
              aria-label="Filtrar por professor"
              value={selectedTeacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  Docente: {t.name}
                </option>
              ))}
            </select>
          )}

          {viewMode === "sala" && (
            <select
              aria-label="Filtrar por sala"
              value={selectedRoomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  Sala: {r.name} ({r.capacity || "?"} lugares)
                </option>
              ))}
            </select>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <input
              aria-label="Filtrar grade"
              type="text"
              placeholder="Filtrar grade..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-xl border border-border bg-background py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </div>
      </div>

      {viewMode === "turma" && selectedClassGroup ? (
        <div className="mb-4 grid gap-2 rounded-xl border border-border bg-muted/20 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="text-muted-foreground">Nível:</span> <span className="font-semibold text-foreground">{selectedClassGroup.grade_name || "Não definido"}</span></div>
          <div><span className="text-muted-foreground">Curso:</span> <span className="font-semibold text-foreground">{selectedClassGroup.course_name || "Não definido"}</span></div>
          <div><span className="text-muted-foreground">Turno:</span> <span className="font-semibold text-foreground">{selectedClassGroup.shift || "Não definido"}</span></div>
          <div><span className="text-muted-foreground">Lotação:</span> <span className="font-semibold text-foreground">{selectedClassGroup.enrolled_count}/{selectedClassGroup.capacity ?? "—"} alunos</span></div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-border bg-muted/40 px-3 py-1.5 font-medium text-muted-foreground">
          {visibleSlots.length} aulas visíveis
        </span>
        <span
          className={
            selectedConflicts.length
              ? "rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5 font-semibold text-destructive"
              : "rounded-full border border-success/30 bg-success/10 px-3 py-1.5 font-semibold text-success"
          }
        >
          {selectedConflicts.length
            ? `${selectedConflicts.length} conflito(s) a resolver`
            : "Sem conflitos nesta vista"}
        </span>
        {viewMode === "turma" && hasScheduleGaps ? (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-700 dark:text-amber-300">
            {weeklyCoverage.filter((item) => item.missingPeriods > 0).length} disciplina(s) com carga semanal pendente
          </span>
        ) : null}
      </div>
      {viewMode === "turma" && hasScheduleGaps ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
          <p className="font-semibold">Publicação bloqueada até completar a carga semanal configurada.</p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {weeklyCoverage.filter((item) => item.missingPeriods > 0).map((item) => (
              <li key={item.subjectId}>{item.subjectName}: {item.plannedPeriods}/{item.requiredPeriods} tempos semanais.</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Alertas de Conflito em Tempo Real */}
      {selectedConflicts.length > 0 && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
          <div className="flex items-center gap-2 font-bold text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              Motor de Conflitos: Foram detectadas {selectedConflicts.length} colisões de horário
            </span>
          </div>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground pl-1">
            {selectedConflicts.map((c) => (
              <li key={c.id}>{c.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Grade Semanal de Horário */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[120px] text-xs font-bold text-foreground">Horário</TableHead>
              {weekdays.map((day) => (
                <TableHead key={day} className="text-center text-xs font-bold text-foreground">
                  {day}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={weekdays.length + 1} className="py-12 text-center text-xs text-muted-foreground">
                  Nenhuma aula agendada para esta selecção.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.range} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap bg-muted/20">
                    {row.range}
                  </TableCell>
                  {row.cells.map(({ slot, additionalCount }, cellIdx) => (
                    <TableCell
                      key={cellIdx}
                      className="p-1.5 align-top min-w-[140px] max-w-[180px]"
                    >
                      {slot ? (
                        <div
                          className={`group relative rounded-xl border p-2.5 shadow-sm transition-all hover:shadow-md ${
                            selectedConflicts.some((c) => c.slotIds.includes(slot.id))
                              ? "border-destructive/60 bg-destructive/10"
                              : "border-primary/20 bg-gradient-to-br from-card to-primary/5 hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-bold text-xs text-foreground tracking-tight line-clamp-1">
                              {slot.subject_name || slot.display_label}
                            </span>
                            {canManage && (
                              <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                                <QuickFormModal
                                  title="Editar Aula"
                                  description={`Actualize o horário de ${slot.display_label}.`}
                                  submitLabel="Guardar"
                                  successDescription="Slot actualizado."
                                  onSubmit={(values) => handleEditSlot(slot, values)}
                                  fields={[
                                    {
                                      name: "dia",
                                      label: "Dia da Semana",
                                      type: "select",
                                      options: [...weekdays],
                                      defaultValue: weekdayLabel(slot.weekday),
                                      required: true,
                                    },
                                    {
                                      name: "inicio",
                                      label: "Hora Início",
                                      type: "time",
                                      defaultValue: timeValue(slot.starts_at),
                                      required: true,
                                    },
                                    {
                                      name: "fim",
                                      label: "Hora Fim",
                                      type: "time",
                                      defaultValue: timeValue(slot.ends_at),
                                      required: true,
                                    },
                                    {
                                      name: "professor",
                                      label: "Professor Responsável",
                                      type: "select",
                                      options: teacherOptions,
                                      defaultValue: (() => {
                                        const current = teachers.find(
                                          (t) => t.id === slot.teacher_id,
                                        );
                                        return current
                                          ? optionLabel(current.id, current.name)
                                          : "Sem professor atribuído";
                                      })(),
                                    },
                                    {
                                      name: "sala",
                                      label: "Sala de Aula",
                                      type: "select",
                                      options: roomOptions,
                                      defaultValue: (() => {
                                        const current = rooms.find((r) => r.id === slot.room_id);
                                        return current
                                          ? optionLabel(
                                              current.id,
                                              `${current.name} (${current.capacity || "?"} lugares)`,
                                            )
                                          : "Sem sala fixa";
                                      })(),
                                    },
                                    {
                                      name: "rotulo",
                                      label: "Sala / rótulo",
                                      defaultValue: slot.label ?? "Sala",
                                      full: true,
                                      required: false,
                                    },
                                    {
                                      name: "observacoes",
                                      label: "Observações",
                                      defaultValue: slot.notes ?? "",
                                      required: false,
                                    },
                                  ]}
                                  trigger={(open) => (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="size-6 p-0 text-muted-foreground hover:text-primary"
                                      onClick={open}
                                      aria-label="Editar aula"
                                    >
                                      <Pencil className="size-3" />
                                    </Button>
                                  )}
                                />
                                <QuickFormModal
                                  title="Copiar Aula"
                                  description={`Copia ${slot.display_label} para outro dia da semana.`}
                                  submitLabel="Copiar"
                                  successDescription="Slot copiado para o dia escolhido."
                                  onSubmit={(values) => handleCopySlot(slot, values)}
                                  fields={[
                                    {
                                      name: "dia",
                                      label: "Dia da Semana",
                                      type: "select",
                                      options: weekdays.filter(
                                        (day) => day !== weekdayLabel(slot.weekday),
                                      ),
                                      required: true,
                                    },
                                  ]}
                                  trigger={(open) => (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="size-6 p-0 text-muted-foreground hover:text-primary"
                                      onClick={open}
                                      aria-label="Copiar aula"
                                    >
                                      <Copy className="size-3" />
                                    </Button>
                                  )}
                                />
                                <ConfirmActionModal
                                  title="Remover Aula"
                                  description={`Retira ${slot.display_label} de ${weekdayLabel(slot.weekday)} (${timeValue(slot.starts_at)}–${timeValue(slot.ends_at)}) do horário.`}
                                  confirmLabel="Remover"
                                  onConfirm={() => onDeleteSlot(slot.id)}
                                  trigger={(open) => (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="size-6 p-0 text-muted-foreground hover:text-destructive"
                                      onClick={open}
                                      aria-label="Remover aula"
                                    >
                                      <Trash2 className="size-3" />
                                    </Button>
                                  )}
                                />
                              </div>
                            )}
                          </div>

                          <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                            {viewMode !== "turma" && (
                              <p className="font-medium text-foreground line-clamp-1">
                                Turma: {slot.class_group_name}
                              </p>
                            )}
                            {viewMode !== "professor" && (
                              <p className="line-clamp-1 text-[10px]">
                                Prof:{" "}
                                <span className="font-medium text-foreground">
                                  {slot.teacher_name || "A definir"}
                                </span>
                              </p>
                            )}
                            {viewMode !== "sala" && (
                              <p className="line-clamp-1 text-[10px]">
                                Sala:{" "}
                                <span className="font-medium text-foreground">
                                  {slot.room_name || slot.label || "A definir"}
                                </span>
                              </p>
                            )}
                          </div>
                          {additionalCount > 0 ? (
                            <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive">
                              +{additionalCount} aula(s) no mesmo horário — reveja os conflitos.
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="h-full min-h-[50px] rounded-lg border border-dashed border-border/40 hover:border-primary/40 transition-colors" />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}
