/**
 * Calendário escolar nacional (Ensino Geral e Técnico-Profissional, MED) como
 * sugestão para o ano lectivo e os três trimestres.
 *
 * Fonte: Decreto Executivo n.º 686/25, de 26 de Agosto (Calendário Escolar
 * Nacional 2025/2026): aulas de 2 de Setembro de 2025 a 31 de Julho de 2026;
 *   - I trimestre até 19/12 (provas 8–19/12; pausa de 22/12 a 2/1);
 *   - II trimestre de 5/1 a 27/3 (pausa da Páscoa de 30/3 a 10/4);
 *   - III trimestre de 13/4 a 8/7 (provas 10–19/6; exames nacionais 29/6–8/7).
 *
 * O calendário de 2026/2027 foi publicado (Setembro a Julho), mas o texto não
 * estava acessível quando isto foi escrito. Para os anos sem decreto transcrito
 * aplica-se a mesma estrutura: início no primeiro dia útil de Setembro, pausa
 * de Natal a partir da semana de 22/12, pausa da Páscoa da Segunda-feira Santa
 * à sexta-feira seguinte à Páscoa, fim a 31 de Julho. A regra reproduz o
 * decreto de 2025/2026 dia a dia (ver tests/academic/med-calendar.test.ts).
 *
 * É sempre uma sugestão: a escola confirma no formulário antes de gravar.
 */

export type MedTerm = { sequence: 1 | 2 | 3; name: string; startsOn: string; endsOn: string };

export type MedCalendar = {
  name: string;
  startsOn: string;
  endsOn: string;
  terms: MedTerm[];
  /** De onde vêm as datas, para a escola saber o que está a confirmar. */
  source: { kind: "decreto" | "padrao"; label: string };
};

const DAY = 86_400_000;

function utc(year: number, month: number, day: number) {
  return Date.UTC(year, month - 1, day);
}
function iso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}
function weekday(ms: number) {
  return new Date(ms).getUTCDay(); // 0 = domingo
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(utc(year, month, day));
}

/** Primeiro dia útil (seg–sex) a partir de `ms`, inclusive. */
function firstWeekdayFrom(ms: number) {
  let t = ms;
  while (weekday(t) === 0 || weekday(t) === 6) t += DAY;
  return t;
}
/** Último dia útil até `ms`, inclusive. */
function lastWeekdayUntil(ms: number) {
  let t = ms;
  while (weekday(t) === 0 || weekday(t) === 6) t -= DAY;
  return t;
}

/** Datas transcritas de decretos publicados. */
const DECRETOS: Record<number, MedCalendar> = {
  2025: {
    name: "2025/2026",
    startsOn: "2025-09-02",
    endsOn: "2026-07-31",
    terms: [
      { sequence: 1, name: "1º Trimestre", startsOn: "2025-09-02", endsOn: "2025-12-19" },
      { sequence: 2, name: "2º Trimestre", startsOn: "2026-01-05", endsOn: "2026-03-27" },
      { sequence: 3, name: "3º Trimestre", startsOn: "2026-04-13", endsOn: "2026-07-08" },
    ],
    source: { kind: "decreto", label: "Decreto Executivo n.º 686/25 (MED)" },
  },
};

/** Calendário pela regra do decreto, para o ano lectivo que começa em Setembro de `startYear`. */
export function medCalendarByRule(startYear: number): MedCalendar {
  const next = startYear + 1;
  // O ano abre a 1 de Setembro e as aulas começam no dia útil seguinte
  // (2025: abertura segunda 1/9, aulas terça 2/9).
  const start = firstWeekdayFrom(utc(startYear, 9, 2));
  // Pausa de Natal a partir da semana que contém 22/12: o I trimestre fecha na
  // sexta-feira anterior.
  const christmasBreak = utc(startYear, 12, 22);
  const breakMonday = christmasBreak - ((weekday(christmasBreak) + 6) % 7) * DAY;
  const term1End = breakMonday - 3 * DAY;
  // O II trimestre abre na primeira segunda-feira a partir de 4 de Janeiro.
  let term2Start = utc(next, 1, 4);
  while (weekday(term2Start) !== 1) term2Start += DAY;
  const easter = Date.parse(`${easterSunday(next)}T00:00:00Z`);
  const holyMonday = easter - 6 * DAY;
  const term2End = holyMonday - 3 * DAY;
  const term3Start = easter + 8 * DAY;
  const term3End = lastWeekdayUntil(utc(next, 7, 8));
  return {
    name: `${startYear}/${next}`,
    startsOn: iso(start),
    endsOn: iso(utc(next, 7, 31)),
    terms: [
      { sequence: 1, name: "1º Trimestre", startsOn: iso(start), endsOn: iso(term1End) },
      { sequence: 2, name: "2º Trimestre", startsOn: iso(term2Start), endsOn: iso(term2End) },
      { sequence: 3, name: "3º Trimestre", startsOn: iso(term3Start), endsOn: iso(term3End) },
    ],
    source: {
      kind: "padrao",
      label: "Estrutura do calendário escolar nacional (MED) — confirme com o decreto do ano",
    },
  };
}

/** Calendário do ano lectivo que começa em Setembro de `startYear`. */
export function medCalendar(startYear: number): MedCalendar {
  return DECRETOS[startYear] ?? medCalendarByRule(startYear);
}

/** Ano de início do ano lectivo em curso (ou a abrir) numa data `YYYY-MM-DD`. */
export function currentSchoolStartYear(today: string): number {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  // De Agosto em diante já se prepara o ano que abre em Setembro.
  return month >= 8 ? year : year - 1;
}

/**
 * Trimestres do MED para um ano lectivo gravado, se o ano coincidir com o
 * calendário nacional (começa em Setembro e acaba em Julho seguinte). Um ano
 * com datas próprias — escola internacional, ensino superior — fica sem
 * sugestão do MED.
 */
export function medTermsForYear(year: { startsOn: string; endsOn: string }): MedTerm[] | null {
  const startYear = Number(year.startsOn.slice(0, 4));
  const startMonth = Number(year.startsOn.slice(5, 7));
  const endYear = Number(year.endsOn.slice(0, 4));
  const endMonth = Number(year.endsOn.slice(5, 7));
  if (startMonth < 8 || startMonth > 9 || endYear !== startYear + 1 || endMonth < 6) return null;
  const calendar = medCalendar(startYear);
  // Os trimestres têm de caber dentro das datas que a escola gravou.
  const first = calendar.terms[0]!;
  const last = calendar.terms[2]!;
  const terms = calendar.terms.map((term) => ({ ...term }));
  if (first.startsOn < year.startsOn) terms[0] = { ...first, startsOn: year.startsOn };
  if (last.endsOn > year.endsOn) terms[2] = { ...last, endsOn: year.endsOn };
  return terms;
}
