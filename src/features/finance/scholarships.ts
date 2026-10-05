/**
 * Bolsas de estudo (`student_scholarships`, 20261005160000).
 *
 * Na emissão de uma fatura o desconto é o MAIOR entre o do contrato (desconto de irmãos,
 * Definições › Cobrança) e o da bolsa em vigor nessa data: não se somam. Uma bolsa de
 * `scope = "tuition"` só desconta propinas; `all` desconta todas as taxas.
 */

export const SCHOLARSHIP_KINDS = [
  { value: "merit", label: "Mérito" },
  { value: "social", label: "Social" },
  { value: "staff", label: "Filho de funcionário" },
  { value: "institutional", label: "Protocolo institucional" },
  { value: "other", label: "Outra" },
] as const;

export type ScholarshipKind = (typeof SCHOLARSHIP_KINDS)[number]["value"];
export type ScholarshipScope = "tuition" | "all";

export type ScholarshipRow = {
  percent: number | string;
  scope: ScholarshipScope | string;
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
};

export function scholarshipKindLabel(kind: string) {
  return SCHOLARSHIP_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** Bolsa em vigor numa data (AAAA-MM-DD): não revogada, já começou e ainda não acabou. */
export function scholarshipInForce(row: ScholarshipRow, on: string) {
  const day = on.slice(0, 10);
  return !row.revoked_at && row.valid_from <= day && (!row.valid_until || row.valid_until >= day);
}

/**
 * Percentagem da bolsa que se aplica a uma fatura desta taxa (`feeKind` como em
 * `categoryToFeeKind`: "tuition", "enrollment", ou null para outras) emitida em `on`.
 */
export function scholarshipPercentFor(
  rows: readonly ScholarshipRow[],
  feeKind: string | null,
  on: string,
): number {
  let best = 0;
  for (const row of rows) {
    if (!scholarshipInForce(row, on)) continue;
    if (row.scope !== "all" && feeKind !== "tuition") continue;
    best = Math.max(best, Math.min(Math.max(Number(row.percent) || 0, 0), 100));
  }
  return best;
}

/** O maior dos dois descontos (irmãos no contrato, bolsa): não se acumulam. */
export function effectiveDiscountPercent(contractPercent: number, scholarshipPercent: number) {
  return Math.min(Math.max(Number(contractPercent) || 0, Number(scholarshipPercent) || 0, 0), 100);
}

/** Valor do desconto em Kz, arredondado ao cêntimo. */
export function discountAmountFor(amount: number, percent: number) {
  if (!(percent > 0)) return 0;
  return Math.round(((amount * percent) / 100) * 100) / 100;
}

export type ScholarCount = {
  total: number;
  m: number;
  f: number;
  byKind: Record<ScholarshipKind, number>;
};

/**
 * Bolseiros por curso, para a base «Bolsas» do SISIES: estudantes matriculados com uma
 * bolsa em vigor em `on`. Cada estudante conta uma vez, pelo tipo da bolsa de maior
 * percentagem.
 */
export function scholarsByProgram(
  rows: readonly (ScholarshipRow & { student_id: string; kind: string })[],
  programOfStudent: ReadonlyMap<string, string>,
  sexOfStudent: ReadonlyMap<string, string>,
  on: string,
): Map<string, ScholarCount> {
  const best = new Map<string, { kind: ScholarshipKind; percent: number }>();
  for (const row of rows) {
    if (!scholarshipInForce(row, on) || !programOfStudent.has(row.student_id)) continue;
    const kind = (
      SCHOLARSHIP_KINDS.some((k) => k.value === row.kind) ? row.kind : "other"
    ) as ScholarshipKind;
    const percent = Number(row.percent) || 0;
    const current = best.get(row.student_id);
    if (!current || percent > current.percent) best.set(row.student_id, { kind, percent });
  }
  const counts = new Map<string, ScholarCount>();
  for (const [studentId, { kind }] of best) {
    const programId = programOfStudent.get(studentId)!;
    const count = counts.get(programId) ?? {
      total: 0,
      m: 0,
      f: 0,
      byKind: { merit: 0, social: 0, staff: 0, institutional: 0, other: 0 },
    };
    count.total += 1;
    const sex = sexOfStudent.get(studentId);
    if (sex === "M") count.m += 1;
    if (sex === "F") count.f += 1;
    count.byKind[kind] += 1;
    counts.set(programId, count);
  }
  return counts;
}
