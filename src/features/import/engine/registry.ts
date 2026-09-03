import type { ImportModule } from "../schemas";
import type { RowImporter } from "./types";
import { pessoasImporter } from "../importers/pessoas-importer";
import { alunosImporter } from "../importers/alunos-importer";
import { professoresImporter } from "../importers/professores-importer";
import { turmasImporter } from "../importers/turmas-importer";
import { matriculasImporter } from "../importers/matriculas-importer";
import { notasImporter } from "../importers/notas-importer";
import { cursosImporter } from "../importers/cursos-importer";
import { classesImporter } from "../importers/classes-importer";
import { disciplinasImporter } from "../importers/disciplinas-importer";
import { salasImporter } from "../importers/salas-importer";
import { encarregadosImporter } from "../importers/encarregados-importer";
import { pagamentosImporter } from "../importers/pagamentos-importer";
import { dividasImporter } from "../importers/dividas-importer";
import { funcionariosImporter } from "../importers/funcionarios-importer";
import { horariosImporter } from "../importers/horarios-importer";
import { presencasImporter } from "../importers/presencas-importer";
import { pautasImporter } from "../importers/pautas-importer";
import { propinasImporter } from "../importers/propinas-importer";

/**
 * Registo central do motor de importação. Apenas módulos com RowImporter real
 * entram neste mapa: declarar um módulo no selector não significa fingir que
 * a importação está implementada.
 */
export const IMPORTER_REGISTRY: Partial<Record<ImportModule, RowImporter>> = {
  pessoas: pessoasImporter,
  alunos: alunosImporter,
  professores: professoresImporter,
  turmas: turmasImporter,
  matriculas: matriculasImporter,
  notas: notasImporter,
  cursos: cursosImporter,
  classes: classesImporter,
  disciplinas: disciplinasImporter,
  salas: salasImporter,
  encarregados: encarregadosImporter,
  pagamentos: pagamentosImporter,
  dividas: dividasImporter,
  funcionarios: funcionariosImporter,
  horarios: horariosImporter,
  presencas: presencasImporter,
  pautas: pautasImporter,
  propinas: propinasImporter,
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
