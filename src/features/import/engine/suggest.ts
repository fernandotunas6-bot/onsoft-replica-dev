import { OFFICIAL_TEMPLATES } from "../official-templates";
import { importModuleOptions, type ImportModule } from "../schemas";
import { foldForCompare } from "./normalize";

const MODULE_HEADER_SIGNALS: Partial<Record<ImportModule, string[]>> = {
  alunos: ["aluno", "turma", "encarregado", "nascimento", "classe"],
  professores: ["professor", "docente", "disciplina", "especialidade"],
  matriculas: ["matricula", "processo", "ano lectivo", "ano letivo"],
  notas: ["nota", "mac", "npp", "npt", "avaliacao", "periodo", "trimestre"],
  pagamentos: ["valor", "propina", "referencia", "pagamento", "mes"],
  pessoas: ["nome", "bi", "documento", "email", "telefone"],
};

/** Sugere o módulo mais provável a partir dos cabeçalhos do ficheiro — nunca decide sozinho. */
export function suggestModule(headers: string[]): { module: ImportModule; score: number } {
  const folded = headers.map((h) => foldForCompare(h));
  let best: { module: ImportModule; score: number } = { module: "pessoas", score: 0 };
  for (const module of importModuleOptions) {
    const signals = MODULE_HEADER_SIGNALS[module];
    if (!signals) continue;
    const hits = signals.filter((signal) => folded.some((h) => h.includes(signal))).length;
    const score = hits / signals.length;
    if (score > best.score) best = { module, score };
  }
  return best;
}

/** Sugere, para cada cabeçalho do ficheiro, a coluna SIGA mais provável (De/Para). */
export function suggestColumnMapping(
  headers: string[],
  module: ImportModule,
): Record<string, string> {
  const spec = OFFICIAL_TEMPLATES[module];
  const mapping: Record<string, string> = {};
  if (!spec) {
    headers.forEach((h) => (mapping[h] = "ignore"));
    return mapping;
  }
  for (const header of headers) {
    const folded = foldForCompare(header);
    const exact = spec.columns.find((c) => foldForCompare(c.header) === folded);
    if (exact) {
      mapping[header] = exact.key;
      continue;
    }
    const partial = spec.columns.find(
      (c) => foldForCompare(c.header).includes(folded) || folded.includes(foldForCompare(c.header)),
    );
    mapping[header] = partial ? partial.key : "ignore";
  }
  return mapping;
}
