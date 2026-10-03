/**
 * Forma de um curso do Ensino Superior: código normalizado e os anos
 * curriculares (grade_levels) que o acompanham. Puro, para testar sem base.
 */
export type HigherEdProgramKind = "undergraduate" | "postgraduate";

export const HIGHER_ED_LEVEL = { code: "higher", name: "Ensino Superior", sequence: 5 } as const;

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

export function programYears(code: string, years: number) {
  const count = Math.max(1, Math.min(7, Math.trunc(years)));
  return Array.from({ length: count }, (_, index) => ({
    code: `${index + 1}ANO-${code}`,
    // Com o código do curso: vários cursos têm «1º Ano» e as listas de turmas e
    // de matrícula ficavam com nomes repetidos (como «10ª Classe · CFB» no II Ciclo).
    name: `${index + 1}º Ano · ${code}`,
    sequence: index + 1,
  }));
}
