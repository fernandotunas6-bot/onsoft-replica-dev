/**
 * Exportar o horário: CSV com as mesmas colunas do modelo de importação (exportar,
 * corrigir no Excel e voltar a importar) e iCalendar com cada aula a repetir todas as
 * semanas até ao fim do ano lectivo (Google, Apple e Outlook lêem-no).
 */
import { addDaysIso } from "@/features/calendar/dates";
import { toIcsTimedCalendar } from "@/features/calendar/ics";
import type { CsvValue } from "@/lib/export-csv";
import type { ScheduleSlot } from "../types";

const WEEKDAY_LABELS = [
  "",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];

/** Colunas iguais a `official-templates.ts › horarios`, pela mesma ordem. */
export function timetableCsvColumns(classCodeById: ReadonlyMap<string, string>) {
  const columns: Array<{ label: string; value: (slot: ScheduleSlot) => CsvValue }> = [
    {
      label: "Turma",
      value: (slot) =>
        (slot.class_group_id && classCodeById.get(slot.class_group_id)) || slot.class_group_name,
    },
    { label: "Disciplina", value: (slot) => slot.subject_name ?? "" },
    { label: "Professor (Nº Agente ou BI)", value: (slot) => slot.teacher_name ?? "" },
    { label: "Dia da Semana", value: (slot) => WEEKDAY_LABELS[slot.weekday] ?? "" },
    { label: "Hora de Início", value: (slot) => slot.starts_at.slice(0, 5) },
    { label: "Hora de Fim", value: (slot) => slot.ends_at.slice(0, 5) },
    { label: "Sala", value: (slot) => slot.room_name || slot.label || "" },
  ];
  return columns;
}

export function sortedForExport(slots: ScheduleSlot[]) {
  return [...slots].sort(
    (a, b) =>
      a.class_group_name.localeCompare(b.class_group_name, "pt") ||
      a.weekday - b.weekday ||
      a.starts_at.localeCompare(b.starts_at),
  );
}

/** Dia ISO da semana (1 = segunda … 7 = domingo) de uma data AAAA-MM-DD. */
function isoWeekday(iso: string) {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Primeiro dia ≥ `from` que cai no dia da semana pedido. */
export function firstOccurrence(from: string, weekday: number) {
  const delta = (weekday - isoWeekday(from) + 7) % 7;
  return addDaysIso(from, delta);
}

/** Calendário com cada aula semanal de `from` até `until` (hora de Luanda, UTC+1 sem verão). */
export function timetableIcs(
  slots: ScheduleSlot[],
  options: { calendarName: string; from: string; until: string },
) {
  const events = slots.flatMap((slot) => {
    const date = firstOccurrence(options.from, slot.weekday);
    if (date > options.until) return [];
    const room = slot.room_name || slot.label || null;
    return [
      {
        uid: `${slot.id}@horario.siga.plus`,
        title: slot.subject_name ?? "Aula",
        description: [slot.class_group_name, slot.teacher_name].filter(Boolean).join(" · "),
        starts_at: `${date}T${slot.starts_at.slice(0, 5)}:00+01:00`,
        ends_at: `${date}T${slot.ends_at.slice(0, 5)}:00+01:00`,
        location: room,
        weekly_until: options.until,
      },
    ];
  });
  return toIcsTimedCalendar(events, {
    calendarName: options.calendarName,
    calendarDescription: "Horário semanal publicado no SIGA",
  });
}

/** Descarrega texto como ficheiro (CSV, ICS ou HTML). */
export function downloadTextFile(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Nome de ficheiro seguro a partir de um rótulo («Turma 10ª A» → «turma-10a-a»). */
export function fileSlug(label: string) {
  return (
    label
      .replace(/ª/g, "a")
      .replace(/º/g, "o")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "horario"
  );
}
