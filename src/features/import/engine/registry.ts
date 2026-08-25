import type { ImportModule } from "../schemas";
import type { RowImporter } from "./types";
import { pessoasImporter } from "../importers/pessoas-importer";
import { alunosImporter } from "../importers/alunos-importer";

/**
 * Registo central do motor de importação. Cada módulo novo regista aqui o
 * seu RowImporter (analyzeRow + commitRow) — o resto do motor (parsing,
 * staging, lotes, dry-run, auditoria, rollback) é comum a todos.
 *
 * Módulos ainda não implementados (ver plano faseado): encarregados,
 * professores, funcionarios, turmas, classes, cursos, disciplinas, salas,
 * matriculas, inscricoes, horarios, notas, avaliacoes, presencas, propinas,
 * pagamentos, dividas, historico_academico, historico_financeiro.
 */
export const IMPORTER_REGISTRY: Partial<Record<ImportModule, RowImporter>> = {
  pessoas: pessoasImporter,
  alunos: alunosImporter,
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
