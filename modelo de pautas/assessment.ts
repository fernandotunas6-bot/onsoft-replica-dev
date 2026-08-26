export type CalculationProfile = "MED_424_25_TRANSITION" | "MANUAL";

export const MAX_GRADE = 20;
export const MIN_GRADE = 0;

export function isGrade(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= MIN_GRADE && value <= MAX_GRADE
  );
}

export function normalizeGrade(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  if (value < MIN_GRADE || value > MAX_GRADE) {
    throw new RangeError(`Nota fora da escala ${MIN_GRADE}-${MAX_GRADE}: ${value}`);
  }
  return value;
}

export function roundGrade(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Decreto Executivo n.º 424/25 — perfil de classes de transição.
 * MT = (MACT + NPT) / 2
 */
export function calculateTrimesterAverage(
  mact: number | null | undefined,
  npt: number | null | undefined,
  decimals = 0,
): number | null {
  const a = normalizeGrade(mact);
  const p = normalizeGrade(npt);
  if (a === null || p === null) return null;
  return roundGrade((a + p) / 2, decimals);
}

/** MFD = (MT1 + MT2 + MT3) / 3 */
export function calculateFinalDisciplineAverage(
  mt1: number | null | undefined,
  mt2: number | null | undefined,
  mt3: number | null | undefined,
  decimals = 0,
): number | null {
  const values = [normalizeGrade(mt1), normalizeGrade(mt2), normalizeGrade(mt3)];
  if (values.some((v) => v === null)) return null;
  const [a, b, c] = values as number[];
  return roundGrade((a + b + c) / 3, decimals);
}

export function formatGrade(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export function deriveElectronicStatusClass(status?: string): string {
  const negative = new Set([
    "NÃO TRANSITA",
    "REPROVADO",
    "NÃO ADMITIDO",
    "NÃO APTO",
    "RETIDO",
    "EXCLUÍDO",
  ]);
  return status && negative.has(status.toUpperCase()) ? "status-negative" : "status-positive";
}
