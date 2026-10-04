/**
 * Forma de um curso do Ensino Superior: código normalizado e os anos
 * curriculares (grade_levels) que o acompanham. Puro, para testar sem base.
 */
export type HigherEdProgramKind = "undergraduate" | "postgraduate";

/** O mesmo nível dos modelos de estrutura (curriculum-templates: «ES»). */
export const HIGHER_ED_LEVEL = { code: "ES", name: "Ensino Superior", sequence: 5 } as const;

/** Código do curso como nos modelos de estrutura: «ES-DIREITO». */
export function higherEdProgramCode(raw: string) {
  const code = normalizeProgramCode(raw);
  return code.startsWith("ES-") ? code : `ES-${code}`.slice(0, 16);
}

/** «eng. informática» → «ENG-INFORMATICA»; só letras, dígitos e hífen. */
export function normalizeProgramCode(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
}

export function defaultYearsFor(kind: HigherEdProgramKind) {
  return kind === "postgraduate" ? 2 : 4;
}

/**
 * Anos curriculares de um curso. O código é o mesmo em todos os cursos («1ANO»,
 * único dentro do curso, como nos modelos de estrutura); o nome leva o curso
 * para as listas não mostrarem vários «1º Ano» iguais.
 */
export function programYears(code: string, years: number) {
  const count = Math.max(1, Math.min(7, Math.trunc(years)));
  const label = code.replace(/^ES-/, "");
  return Array.from({ length: count }, (_, index) => ({
    code: `${index + 1}ANO`,
    name: `${index + 1}º Ano · ${label}`,
    sequence: index + 1,
  }));
}
