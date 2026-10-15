/**
 * Nomes das disciplinas tal como saem impressos num documento (pauta,
 * boletim, certificado, declaração com notas). Ficam no registo da emissão
 * (`documents.issued`), para a verificação mostrar o que o documento dizia no
 * dia em que foi emitido — mesmo que a disciplina seja renomeada ou junta a
 * outra depois. Só os nomes: as notas não vão para a página pública.
 *
 * Lê as formas que os modelos usam (print-catalog.ts): `grades[].subject`,
 * `subjects[].name` e `subject.name`.
 */
const MAX_SUBJECTS = 40;
const MAX_LENGTH = 120;

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function printedSubjectNames(payload: Record<string, unknown>): string[] {
  const names: unknown[] = [];
  for (const row of Array.isArray(payload["grades"]) ? payload["grades"] : []) {
    names.push(asRecord(row)?.["subject"]);
  }
  for (const row of Array.isArray(payload["subjects"]) ? payload["subjects"] : []) {
    names.push(asRecord(row)?.["name"]);
  }
  names.push(asRecord(payload["subject"])?.["name"]);
  const out: string[] = [];
  for (const name of names) {
    if (typeof name !== "string") continue;
    const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
    if (clean && !out.includes(clean)) out.push(clean);
    if (out.length === MAX_SUBJECTS) break;
  }
  return out;
}
