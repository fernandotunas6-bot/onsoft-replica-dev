import type { ClassContext, SchoolIdentity } from "./types";

type SchoolSettingsSource = {
  name?: string | null;
  province?: string | null;
  municipality?: string | null;
  branding?: { logo_url?: string | null } | null;
};

type ClassGroupSource = {
  grade_name?: string | null;
  name?: string | null;
  shift?: string | null;
  room_name?: string | null;
  course_name?: string | null;
};

const shiftLabels: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
};

function clean(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function administrativeLine(value: string | null | undefined, prefix: string) {
  const normalized = clean(value);
  if (!normalized) return undefined;
  return normalized.toLocaleUpperCase("pt-AO").startsWith(prefix)
    ? normalized
    : `${prefix} DE ${normalized}`;
}

/** Projecção da ficha institucional; não inventa níveis administrativos ausentes. */
export function buildPautaSchoolIdentity(
  school: SchoolSettingsSource | null | undefined,
): SchoolIdentity {
  const province = administrativeLine(school?.province, "GOVERNO PROVINCIAL");
  const municipality = administrativeLine(school?.municipality, "ADMINISTRAÇÃO MUNICIPAL");
  const logoUrl = clean(school?.branding?.logo_url);

  return {
    republic: "REPÚBLICA DE ANGOLA",
    schoolName: clean(school?.name) ?? "ESCOLA",
    ...(province ? { province } : {}),
    ...(municipality ? { municipality } : {}),
    ...(logoUrl ? { logoUrl } : {}),
  };
}

/** Projecção da turma usada pelos quatro modelos de pauta. */
export function buildPautaClassContext(params: {
  currentClass?: ClassGroupSource | undefined;
  academicYear: string;
  cycle: ClassContext["cycle"];
  pautaNumber?: string | undefined;
  teacherName?: string | undefined;
  term?: number | undefined;
  periodCount?: number | undefined;
}): ClassContext {
  const shift = clean(params.currentClass?.shift);
  const room = clean(params.currentClass?.room_name);
  const pautaNumber = clean(params.pautaNumber);

  return {
    academicYear: params.academicYear,
    className: clean(params.currentClass?.grade_name) ?? "—",
    classGroup: clean(params.currentClass?.name) ?? "—",
    period: shift ? (shiftLabels[shift] ?? shift) : "—",
    cycle: params.cycle,
    ...(room && room !== "—" ? { room } : {}),
    ...(pautaNumber ? { pautaNumber } : {}),
    ...(params.periodCount !== undefined ? { periodCount: params.periodCount } : {}),
    ...(clean(params.currentClass?.course_name)
      ? { courseName: clean(params.currentClass?.course_name) }
      : {}),
    ...(clean(params.teacherName) ? { teacher: clean(params.teacherName) } : {}),
    ...(params.term !== undefined ? { term: params.term } : {}),
  };
}
