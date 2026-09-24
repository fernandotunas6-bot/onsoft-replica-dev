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
  Printer,
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
  ScheduleRoom,
  ScheduleSlot,
  ScheduleSlotInput,
  ScheduleSlotUpdate,
  ScheduleSubject,
  ScheduleTeacher,
} from "./types";
import { detectScheduleConflicts } from "./utils/conflicts";
import { gridRows } from "./utils/gridRows";
import { schedulePublicationReadiness } from "./utils/publicationReadiness";
import { assertValidScheduleTime, assertNoScheduleConflict } from "./utils/validation";
import { toast } from "sonner";

const weekdays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;
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


export function ScheduleWorkspace({
  activeYearLabel,
  activeYearId,
  canManage,
  scheduleAvailable,
  classGroups,
  subjects,
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
    (classGroupId && classGroups.some((group) => group.id === classGroupId) ? classGroupId : "") ||
    classGroups[0]?.id ||
    "";
  const selectedClassGroup = classGroups.find((group) => group.id === selectedClassGroupId);

  const selectedTeacherId = teachers.some((teacher) => teacher.id === teacherId) ? teacherId : teachers[0]?.id || "";
  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId);

  const selectedRoomId = rooms.some((room) => room.id === roomId) ? roomId : rooms[0]?.id || "";
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

  const conflicts = useMemo(() => detectScheduleConflicts(slots.filter((slot) =>
    currentSlots.some((visible) => visible.id === slot.id ||
      (visible.schedule_id != null && visible.schedule_id === slot.schedule_id) ||
      (visible.schedule_id == null && slot.schedule_id == null)),
  )), [slots, currentSlots]);
  const selectedConflicts = conflicts.filter((conflict) =>
    conflict.slotIds.some((slotId) => currentSlots.some((slot) => slot.id === slotId)),
  );

  const rows = gridRows(visibleSlots);
  const visibleWeekdays = weekdays.slice(0, visibleSlots.some((slot) => slot.weekday > 5) ? 7 : 5);
  const publication = schedulePublicationReadiness({ classGroupId: selectedClassGroupId, slots, classGroups, subjects, teachers, rooms });

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

    const classVersions = new Set(slots.filter((item) => item.class_group_id === classGroup.id).map((item) => item.schedule_id ?? "__legacy__"));
    if (classVersions.size > 1) throw new Error("Existem várias versões da turma. Seleccione uma versão antes de adicionar aulas.");
    if (classVersions.size === 0) throw new Error("Crie primeiro uma versão de horário para esta turma antes de adicionar aulas.");

    const teacherOpt = values["professor"];
    const resolvedTeacher = teachers.find((t) => optionLabel(t.id, t.name) === teacherOpt);
    if (teacherOpt && teacherOpt !== "Sem professor atribuído" && !resolvedTeacher) {
      throw new Error("O professor seleccionado não está disponível nesta instituição.");
    }

    const roomOpt = values["sala"];
    const resolvedRoom = rooms.find(
      (r) => optionLabel(r.id, `${r.name} (${r.capacity || "?"} lugares)`) === roomOpt,
    );
    if (roomOpt && roomOpt !== "Sem sala fixa" && !resolvedRoom) {
      throw new Error("A sala seleccionada não está disponível nesta instituição.");
    }

    if (resolvedRoom?.capacity != null && classGroup.enrolled_count > resolvedRoom.capacity) {
      throw new Error(`A sala ${resolvedRoom.name} comporta ${resolvedRoom.capacity} alunos; a turma tem ${classGroup.enrolled_count}.`);
    }
    const roomLabel = resolvedRoom?.name || values["rotulo"]?.trim() || "Sala";
    const virtualRoom = virtualRooms.find((item) => item.label === values["salaVirtual"]);
    if (values["salaVirtual"] && !virtualRoom) throw new Error("A sala virtual seleccionada não está disponível.");

    const startsAt = values["inicio"] ?? "";
    const endsAt = values["fim"] ?? "";
    assertValidScheduleTime(weekday, startsAt, endsAt);
    assertNoScheduleConflict(slots, { class_group_id: classGroup.id, teacher_id: resolvedTeacher?.id ?? null, room_id: resolvedRoom?.id ?? null, weekday, starts_at: startsAt, ends_at: endsAt }, undefined, slots.find((item) => item.class_group_id === classGroup.id)?.schedule_id ?? null);

    await onCreateSlot({
      classGroupId: classGroup.id,
      scheduleId: slots.find((item) => item.class_group_id === classGroup.id)?.schedule_id ?? null,
      subjectId: subject.id,
      weekday,
      startsAt,
      endsAt,
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
    if (teacherOpt && teacherOpt !== "Sem professor atribuído" && !resolvedTeacher) {
      throw new Error("O professor seleccionado não está disponível nesta instituição.");
    }

    const roomOpt = values["sala"];
    const resolvedRoom = rooms.find(
      (r) => optionLabel(r.id, `${r.name} (${r.capacity || "?"} lugares)`) === roomOpt,
    );
    if (roomOpt && roomOpt !== "Sem sala fixa" && !resolvedRoom) {
      throw new Error("A sala seleccionada não está disponível nesta instituição.");
    }
    const currentGroup = classGroups.find((group) => group.id === slot.class_group_id);
    if (resolvedRoom?.capacity != null && currentGroup && currentGroup.enrolled_count > resolvedRoom.capacity) {
      throw new Error(`A sala ${resolvedRoom.name} comporta ${resolvedRoom.capacity} alunos; a turma tem ${currentGroup.enrolled_count}.`);
    }
    const roomLabel = resolvedRoom?.name || values["rotulo"]?.trim() || slot.label || "Sala";

    const startsAt = values["inicio"] ?? "";
    const endsAt = values["fim"] ?? "";
    assertValidScheduleTime(weekday, startsAt, endsAt);
    assertNoScheduleConflict(slots, { class_group_id: slot.class_group_id, teacher_id: resolvedTeacher?.id ?? null, room_id: resolvedRoom?.id ?? null, weekday, starts_at: startsAt, ends_at: endsAt }, slot.id, slot.schedule_id);

    await onUpdateSlot({
      slotId: slot.id,
      scheduleId: slot.schedule_id ?? null,
      weekday,
      startsAt,
      endsAt,
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

    assertValidScheduleTime(weekday, slot.starts_at, slot.ends_at);
    assertNoScheduleConflict(slots, { class_group_id: slot.class_group_id, teacher_id: slot.teacher_id, room_id: slot.room_id ?? null, weekday, starts_at: slot.starts_at, ends_at: slot.ends_at }, undefined, slot.schedule_id);
    await onCreateSlot({
      classGroupId: slot.class_group_id,
      scheduleId: slot.schedule_id ?? null,
      subjectId: slot.subject_id,
      weekday,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      teacherId: slot.teacher_id ?? null,
      roomId: slot.room_id ?? null,
      label: slot.label ?? "Sala",
    });
  };

  const handlePublish = async () => {
    if (!selectedClassGroupId || !onPublishSchedule) return;
    if (!publication.ready) {
      toast.error(`Resolva ${publication.issues.length} pendência(s) antes de publicar.`);
      return;
    }
    setPublishing(true);
    try {
      await onPublishSchedule(selectedClassGroupId);
      toast.success("Horário publicado com sucesso.");
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
          ? "Planeamento semanal com validação de conflitos, turmas, professores e salas."
          : "Não foi possível carregar os horários neste momento."
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-full font-medium">
            <CalendarDays className="size-3.5 text-primary" /> {activeYearLabel}
          </span>

          {canManage && scheduleAvailable && classGroups.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1.5 print:hidden" onClick={() => window.print()} title="Imprimir o horário actualmente visível">
                <Printer className="size-3.5" /> Imprimir
              </Button>
              {onPublishSchedule && selectedClassGroupId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs border-primary/30 text-primary hover:bg-primary/10 gap-1.5"
                  onClick={handlePublish}
                  disabled={publishing || !publication.ready || viewMode !== "turma"}
                  title={!publication.ready ? publication.issues.map((issue) => issue.message).join("\n") : "Publicar horário da turma seleccionada"}
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

      {viewMode === "turma" && canManage && onPublishSchedule && (
        <section aria-label="Preparação para publicação" className="mb-4 rounded-2xl border border-border bg-gradient-to-r from-card to-muted/30 p-4 shadow-sm print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Preparação para publicação</h3>
              <p className="mt-1 text-xs text-muted-foreground">{publication.lessonCount} aulas · {publication.teacherCount} professores · {publication.roomCount} salas</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${publication.ready ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
              {publication.ready ? "Pronto para publicar" : `${publication.issues.length} pendência(s)`}
            </span>
          </div>
          {publication.issues.length > 0 && (
            <ul className="mt-3 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2" aria-live="polite">
              {publication.issues.slice(0, 8).map((issue, index) => <li key={`${issue.code}-${issue.slotId ?? index}`} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />{issue.message}</li>)}
              {publication.issues.length > 8 && <li>Mais {publication.issues.length - 8} pendência(s).</li>}
            </ul>
          )}
        </section>
      )}

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
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm print:overflow-visible print:shadow-none">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[120px] text-xs font-bold text-foreground">Horário</TableHead>
              {visibleWeekdays.map((day) => (
                <TableHead key={day} className="text-center text-xs font-bold text-foreground">
                  {day}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleWeekdays.length + 1} className="py-12 text-center text-xs text-muted-foreground">
                  Nenhuma aula agendada para esta selecção.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.key} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="font-mono text-xs font-semibold text-muted-foreground whitespace-nowrap bg-muted/20">
                    {row.range}
                  </TableCell>
                  {row.cells.slice(0, visibleWeekdays.length).map((slot, cellIdx) => (
                    <TableCell
                      key={cellIdx}
                      className="p-2 align-top min-w-[150px] max-w-[200px]"
                    >
                      {slot ? (
                        <div
                          className={`group relative rounded-xl border-l-4 border p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
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
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
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
