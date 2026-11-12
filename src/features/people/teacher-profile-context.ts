import { angolaTeachingLevels, type AngolaTeachingLevelId } from "@/lib/angola-academic";

/**
 * O tipo jurídico da escola (pública, privada, etc.) nunca determina o nível.
 * Os níveis do professor vêm das turmas atribuídas, e os da instituição da
 * configuração pedagógica. Se as turmas não forem reconhecidas, não inventamos.
 */
export function resolveTeacherLevels(
  classNames: readonly string[],
  configuredLevels: readonly string[] = [],
): { assigned: AngolaTeachingLevelId[]; school: AngolaTeachingLevelId[] } {
  const school = angolaTeachingLevels
    .filter((level) => configuredLevels.includes(level.id))
    .map((level) => level.id);
  const assigned = angolaTeachingLevels
    .filter((level) => classNames.some((name) => level.match.test(name)))
    .map((level) => level.id);
  return { assigned, school };
}

export function teachingLevelLabel(level: AngolaTeachingLevelId): string {
  return angolaTeachingLevels.find((item) => item.id === level)?.label ?? level;
}

const weekdayAliases: readonly (readonly string[])[] = [
  ["domingo", "dom"],
  ["segunda", "segunda feira", "2 feira", "2a feira", "2ª feira", "seg"],
  ["terca", "terca feira", "3 feira", "3a feira", "3ª feira", "ter"],
  ["quarta", "quarta feira", "4 feira", "4a feira", "4ª feira", "qua"],
  ["quinta", "quinta feira", "5 feira", "5a feira", "5ª feira", "qui"],
  ["sexta", "sexta feira", "6 feira", "6a feira", "6ª feira", "sex"],
  ["sabado", "sab"],
];

function normalizeDay(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A agenda é apenas prevista; não afirma que a aula ocorreu ou teve chamada. */
export function plannedLessonsToday<T extends { weekday_label: string }>(
  slots: readonly T[],
  instant: Date = new Date(),
): T[] {
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Luanda",
    weekday: "long",
  })
    .format(instant)
    .toLowerCase();
  const index = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ].indexOf(today);
  if (index < 0) return [];
  return slots.filter((slot) => weekdayAliases[index].includes(normalizeDay(slot.weekday_label)));
}
