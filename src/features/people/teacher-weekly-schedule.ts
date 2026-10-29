/**
 * Resumo semanal exclusivamente a partir dos tempos PREVISTOS carregados.
 * Não confundir horas agendadas com assiduidade, aulas ministradas ou salário.
 */
export type TeacherScheduleSlot = {
  id: string;
  weekday_label: string;
  starts_at: string;
  ends_at: string;
  subject_name: string;
  class_group_name: string;
};

const DAY_ORDER = [
  ["Segunda-feira", ["segunda", "segunda feira", "segunda-feira", "2 feira", "2ª feira", "seg"]],
  ["Terça-feira", ["terca", "terca feira", "terca-feira", "3 feira", "3ª feira", "ter"]],
  ["Quarta-feira", ["quarta", "quarta feira", "quarta-feira", "4 feira", "4ª feira", "qua"]],
  ["Quinta-feira", ["quinta", "quinta feira", "quinta-feira", "5 feira", "5ª feira", "qui"]],
  ["Sexta-feira", ["sexta", "sexta feira", "sexta-feira", "6 feira", "6ª feira", "sex"]],
  ["Sábado", ["sabado", "sab"]],
  ["Domingo", ["domingo", "dom"]],
] as const;
function dayIndex(label: string): number {
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[.\-_]/g, " ").replace(/\s+/g, " ").trim();
  const n = DAY_ORDER.findIndex(([, names]) =>
    (names as readonly string[]).includes(normalized));
  return n < 0 ? 7 : n;
}
function minutes(raw: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}
export type TeacherWeeklyDay = {
  label: string;
  slots: TeacherScheduleSlot[];
  /** Sinal preventivo: não altera automaticamente horários aprovados. */
  conflicts: string[];
};

export function groupTeacherWeeklySchedule(slots: readonly TeacherScheduleSlot[]): TeacherWeeklyDay[] {
  const groups: TeacherWeeklyDay[] = [];
  for (let i = 0; i < DAY_ORDER.length; i++) {
    const daySlots = slots.filter((slot) => dayIndex(slot.weekday_label) === i)
      .sort((a,b) => (minutes(a.starts_at) ?? 9999) - (minutes(b.starts_at) ?? 9999) ||
        a.class_group_name.localeCompare(b.class_group_name, "pt"));
    if (!daySlots.length) continue;
    const conflicts: string[] = [];
    for (let j = 1; j < daySlots.length; j++) {
      const prev = daySlots[j-1]!;
      const current = daySlots[j]!;
      const a = minutes(prev.ends_at);
      const b = minutes(current.starts_at);
      if (a !== null && b !== null && b < a && prev.id !== current.id) {
        conflicts.push(`${prev.subject_name} / ${current.subject_name}`);
      }
    }
    groups.push({ label: DAY_ORDER[i]![0], slots: daySlots, conflicts });
  }
  const unspecified = slots.filter((slot) => dayIndex(slot.weekday_label) === 7);
  if (unspecified.length) groups.push({ label: "Dia por identificar", slots: [...unspecified], conflicts: [] });
  return groups;
}
