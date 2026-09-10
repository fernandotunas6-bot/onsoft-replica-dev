import { OFFICIAL_TEMPLATES } from "../official-templates";
import { importModuleOptions, type ImportModule } from "../schemas";
import { foldForCompare } from "./normalize";
import { FIELD_CATALOG, findCatalogMatch } from "./field-catalog";

const MODULE_HEADER_SIGNALS: Partial<Record<ImportModule, string[]>> = {
  alunos: ["aluno", "turma", "encarregado", "nascimento", "classe", "processo", "estudante"],
  professores: ["professor", "docente", "disciplina", "especialidade", "agente", "habilitacao"],
  matriculas: ["matricula", "processo", "ano lectivo", "ano letivo", "confirmacao"],
  turmas: ["turma", "classe", "grau", "sala", "capacidade", "turno"],
  notas: ["nota", "mac", "npp", "npt", "avaliacao", "periodo", "trimestre", "pauta"],
  pagamentos: ["valor", "propina", "referencia", "pagamento", "mes", "multicaixa"],
  pessoas: ["nome", "bi", "documento", "email", "telefone", "morada"],
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
  const mapping: Record<string, string> = {};
  const catalog = FIELD_CATALOG[module];
  const spec = OFFICIAL_TEMPLATES[module];

  for (const header of headers) {
    // 1. Tentar primeiro o Field Catalog com regras de aliases
    if (catalog) {
      const match = findCatalogMatch(header, catalog);
      if (match && match.confidence >= 0.7) {
        mapping[header] = match.field.key;
        continue;
      }
    }

    // 2. Tentar o template oficial (legado ou alternativo)
    if (spec) {
      const folded = foldForCompare(header);
      const exact = spec.columns.find((c) => foldForCompare(c.header) === folded);
      if (exact) {
        mapping[header] = exact.key;
        continue;
      }
      const partial = spec.columns.find(
        (c) =>
          foldForCompare(c.header).includes(folded) || folded.includes(foldForCompare(c.header)),
      );
      if (partial) {
        mapping[header] = partial.key;
        continue;
      }
    }

    mapping[header] = "ignore";
  }

  return mapping;
}
