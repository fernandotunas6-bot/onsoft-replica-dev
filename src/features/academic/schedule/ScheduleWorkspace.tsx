import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
  ScheduleSlot,
  ScheduleSlotInput,
  ScheduleSlotUpdate,
  ScheduleSubject,
} from "./types";
import { detectScheduleConflicts } from "./utils/conflicts";

const weekdays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"] as const;
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
      cells: weekdays.map((_, index) =>
        slots.find(
          (slot) => slot.weekday === index + 1 && timeValue(slot.starts_at) === start,
        ),
      ),
    };
  });
}

export function ScheduleWorkspace({
  activeYearLabel,
  canManage,
  scheduleAvailable,
  classGroups,
  subjects,
  slots,
  virtualRooms,
  onCreateSlot,
  onUpdateSlot,
  onDeleteSlot,
}: {
  activeYearLabel: string;
  canManage: boolean;
  scheduleAvailable: boolean;
  classGroups: ScheduleClassGroup[];
  subjects: ScheduleSubject[];
  slots: ScheduleSlot[];
  virtualRooms: Array<{ label: string; url: string }>;
  onCreateSlot: (input: ScheduleSlotInput) => Promise<void>;
  onUpdateSlot: (input: ScheduleSlotUpdate) => Promise<void>;
  onDeleteSlot: (slotId: string) => Promise<void>;
}) {
  const [classGroupId, setClassGroupId] = useState("");
  const [query, setQuery] = useState("");
  const selectedClassGroupId =
    classGroupId || slots.find((slot) => slot.class_group_id)?.class_group_id || classGroups[0]?.id || "";
  const selectedClassGroup = classGroups.find((group) => group.id === selectedClassGroupId);
  const selectedSlots = slots.filter((slot) => slot.class_group_id === selectedClassGroupId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSlots = selectedSlots.filter((slot) => {
    if (!normalizedQuery) return true;
    return [slot.display_label, slot.label, slot.subject_name, slot.class_group_name]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
  });
  const conflicts = useMemo(() => detectScheduleConflicts(slots), [slots]);
  const selectedConflicts = conflicts.filter((conflict) =>
    conflict.slotIds.some((slotId) => selectedSlots.some((slot) => slot.id === slotId)),
  );
  const rows = gridRows(visibleSlots);
  const classGroupOptions = classGroups.map((group) => optionLabel(group.id, group.name));
  const subjectOptions = subjects.map((subject) => optionLabel(subject.id, subject.name));

  const createSlot = async (values: Record<string, string | undefined>) => {
    const groupOption = values["turma"] ?? "";
    const subjectOption = values["disciplina"] ?? "";
    const classGroup = classGroups.find((group) => optionLabel(group.id, group.name) === groupOption);
    const subject = subjects.find((item) => optionLabel(item.id, item.name) === subjectOption);
    const weekday = weekdayByLabel.get(values["dia"] ?? "");
    if (!classGroup || !subject || !weekday) throw new Error("Seleccione turma, disciplina e dia.");

    const room = values["rotulo"]?.trim() || "Sala";
    const virtualRoom = virtualRooms.find((item) => item.label === values["salaVirtual"]);
    await onCreateSlot({
      classGroupId: classGroup.id,
      subjectId: subject.id,
      weekday,
      startsAt: values["inicio"] ?? "",
      endsAt: values["fim"] ?? "",
      label: virtualRoom ? `${room} · ${virtualRoom.url}` : room,
    });
    setClassGroupId(classGroup.id);
  };

  return (
    <Panel
      title={selectedClassGroup ? `Horário semanal — ${selectedClassGroup.name}` : "Horário semanal"}
      description={
        scheduleAvailable
          ? "Slots reais da escola, organizados por turma, disciplina e sala."
          : "Não foi possível carregar os horários neste momento."
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-4" /> {activeYearLabel}
          </span>
          {canManage && scheduleAvailable && classGroups.length > 0 ? (
            <QuickFormModal
              title="Novo slot"
              eyebrow="Horário"
              description="Adicione uma aula ao horário real da turma."
              icon={<Plus className="size-5" />}
              submitLabel="Criar slot"
              onSubmit={createSlot}
              fields={[
                { name: "turma", label: "Turma", type: "select", options: classGroupOptions, full: true },
                { name: "dia", label: "Dia", type: "select", options: [...weekdays] },
                { name: "inicio", label: "Início (HH:MM)", placeholder: "07:30" },
                { name: "fim", label: "Fim (HH:MM)", placeholder: "08:20" },
                { name: "disciplina", label: "Disciplina", type: "select", options: subjectOptions, full: true },
                {
                  name: "rotulo",
                  label: "Sala / rótulo",
                  placeholder: "Ex.: Sala 1",
                  defaultValue: "Sala 1",
                  full: true,
                },
                ...(virtualRooms.length > 0
                  ? [
                      {
                        name: "salaVirtual",
                        label: "Sala virtual",
                        type: "select" as const,
                        options: ["Sem sala virtual", ...virtualRooms.map((item) => item.label)],
                        required: false,
                        full: true,
                      },
                    ]
                  : []),
              ]}
              trigger={(open) => (
                <Button size="sm" className="gap-1.5" onClick={open}>
                  <Plus className="size-3.5" /> Slot
                </Button>
              )}
            />
          ) : null}
        </div>
      }
    >
      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          A consulta de horários reais está reservada a Secretaria/Admin.
        </p>
      ) : !scheduleAvailable ? (
        <p className="text-sm text-muted-foreground">
          Tente novamente ou contacte o suporte técnico se o problema persistir.
        </p>
      ) : classGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Crie primeiro uma turma para definir o horário semanal.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm font-medium" htmlFor="horario-turma">
              Turma
              <select
                id="horario-turma"
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                value={selectedClassGroupId}
                onChange={(event) => setClassGroupId(event.target.value)}
              >
                {classGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <input
                aria-label="Pesquisar horário"
                className="min-w-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Pesquisar horário"
              />
            </label>
          </div>

          {selectedConflicts.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
              {selectedConflicts.map((conflict) => (
                <p key={conflict.id} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {conflict.message}
                </p>
              ))}
            </div>
          ) : null}

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem slots para esta turma. Adicione o primeiro com o botão Slot.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    {weekdays.map((day) => (
                      <TableHead key={day}>{day}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.range}>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {row.range}
                      </TableCell>
                      {row.cells.map((slot, index) => (
                        <TableCell key={`${row.range}-${weekdays[index]}`}>
                          {slot ? (
                            <div className="min-w-32 space-y-1">
                              <p className="font-medium">{slot.display_label}</p>
                              {slot.label && slot.label !== slot.display_label ? (
                                <p className="text-xs text-muted-foreground">{slot.label}</p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {visibleSlots.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border">
              {visibleSlots.map((slot) => (
                <li
                  key={slot.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                >
                  <p className="text-sm">
                    <span className="font-medium">{weekdayLabel(slot.weekday)}</span>
                    <span className="mx-2 font-mono text-xs text-muted-foreground">
                      {timeValue(slot.starts_at)}–{timeValue(slot.ends_at)}
                    </span>
                    {slot.display_label}
                  </p>
                  <div className="flex items-center gap-1">
                    {canManage ? (
                      <QuickFormModal
                        title="Editar slot"
                        description={`Actualize o horário de ${slot.display_label}.`}
                        submitLabel="Guardar"
                        successDescription="Slot actualizado."
                        onSubmit={async (values) => {
                          const weekday = weekdayByLabel.get(values["dia"] ?? "");
                          if (!weekday) throw new Error("Seleccione o dia.");
                          await onUpdateSlot({
                            slotId: slot.id,
                            weekday,
                            startsAt: values["inicio"] ?? "",
                            endsAt: values["fim"] ?? "",
                            label: values["rotulo"]?.trim() || "Sala",
                          });
                        }}
                        fields={[
                          {
                            name: "dia",
                            label: "Dia",
                            type: "select",
                            options: [...weekdays],
                            defaultValue: weekdayLabel(slot.weekday),
                          },
                          { name: "inicio", label: "Início (HH:MM)", defaultValue: timeValue(slot.starts_at) },
                          { name: "fim", label: "Fim (HH:MM)", defaultValue: timeValue(slot.ends_at) },
                          {
                            name: "rotulo",
                            label: "Sala / rótulo",
                            defaultValue: slot.label ?? "Sala",
                            full: true,
                          },
                        ]}
                        trigger={(open) => (
                          <Button size="sm" variant="ghost" className="gap-1.5" onClick={open}>
                            <Pencil className="size-3.5" /> Editar
                          </Button>
                        )}
                      />
                    ) : null}
                    {canManage ? (
                      <QuickFormModal
                        title="Copiar slot"
                        description={`Copia ${slot.display_label} para outro dia da semana.`}
                        submitLabel="Copiar"
                        successDescription="Slot copiado para o dia escolhido."
                        onSubmit={async (values) => {
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
                            label: slot.label ?? "Sala",
                          });
                        }}
                        fields={[
                          {
                            name: "dia",
                            label: "Dia",
                            type: "select",
                            options: weekdays.filter((day) => day !== weekdayLabel(slot.weekday)),
                          },
                        ]}
                        trigger={(open) => (
                          <Button size="sm" variant="ghost" className="gap-1.5" onClick={open}>
                            <Copy className="size-3.5" /> Copiar
                          </Button>
                        )}
                      />
                    ) : null}
                    {virtualRooms.length > 0 && /https?:\/\//i.test(slot.label ?? "") ? (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={(slot.label ?? "").match(/https?:\/\/\S+/)?.[0]}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Sala
                        </a>
                      </Button>
                    ) : null}
                    {canManage ? (
                      <ConfirmActionModal
                        title="Remover slot"
                        description={`Retira ${slot.display_label} de ${weekdayLabel(slot.weekday)} (${timeValue(slot.starts_at)}–${timeValue(slot.ends_at)}) do horário desta turma.`}
                        confirmLabel="Remover"
                        onConfirm={() => onDeleteSlot(slot.id)}
                        trigger={(open) => (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-destructive"
                            onClick={open}
                          >
                            <Trash2 className="size-3.5" /> Remover
                          </Button>
                        )}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
