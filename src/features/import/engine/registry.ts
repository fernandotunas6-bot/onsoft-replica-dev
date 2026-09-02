import type { ImportModule } from "../schemas";
import type { RowImporter } from "./types";
import { pessoasImporter } from "../importers/pessoas-importer";
import { alunosImporter } from "../importers/alunos-importer";
import { matriculasImporter } from "../importers/matriculas-importer";
import { notasImporter, pautasImporter } from "../importers/notas-importer";

/**
 * Registo central do motor de importação. Cada módulo novo regista aqui o
 * seu RowImporter (analyzeRow + commitRow) — o resto do motor (parsing,
 * staging, lotes, dry-run, auditoria, rollback) é comum a todos.
 */
export const IMPORTER_REGISTRY: Partial<Record<ImportModule, RowImporter>> = {
  pessoas: pessoasImporter,
  alunos: alunosImporter,
  matriculas: matriculasImporter,
  notas: notasImporter,
  pautas: pautasImporter,
};

export function getImporter(module: ImportModule): RowImporter {
  const importer = IMPORTER_REGISTRY[module];
  if (!importer) {
    throw new Error(
      `O módulo "${module}" ainda não tem um importador implementado. Módulos disponíveis: ${Object.keys(IMPORTER_REGISTRY).join(", ")}.`,
    );
  }
  return importer;
}

export function isModuleImplemented(module: ImportModule): boolean {
  return module in IMPORTER_REGISTRY;
}
