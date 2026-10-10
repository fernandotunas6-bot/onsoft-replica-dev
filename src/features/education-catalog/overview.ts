/**
 * Resumo do catálogo para o painel de governação (ADMIN) e para quem precisar
 * de o ler de fora do SIGA: totais, cobertura real por país, etapas e fontes.
 * Só dados de referência — nada de escolas, alunos ou pessoas.
 */
import { catalogCoverage, TRACK_LABEL } from "./catalog";
import { COUNTRIES } from "./data/countries";
import { GLOBAL_COURSES } from "./data/courses";
import { ISCED_FIELDS, ISCED_LEVELS, iscedLevel } from "./data/isced";
import { CATALOG_SOURCES, VERIFICATION_LABEL } from "./data/sources";
import { EDUCATION_STAGES, PERIOD_MODEL_LABEL } from "./data/stages";
import { GLOBAL_SUBJECTS } from "./data/subjects";

/** Muda quando os dados do catálogo mudam (comparado pelo ADMIN e pela carga SQL). */
export const CATALOG_VERSION = "2026.10.10";

export function buildCatalogOverview() {
  return {
    version: CATALOG_VERSION,
    totals: {
      iscedLevels: ISCED_LEVELS.length,
      iscedFields: ISCED_FIELDS.length,
      countries: COUNTRIES.length,
      countriesWithStages: COUNTRIES.filter((c) => c.stagesLoaded).length,
      stages: EDUCATION_STAGES.length,
      subjects: GLOBAL_SUBJECTS.length,
      courses: GLOBAL_COURSES.length,
      sources: CATALOG_SOURCES.length,
    },
    coverage: catalogCoverage(),
    stages: EDUCATION_STAGES.map((s) => ({
      id: s.id,
      country: s.country,
      name: s.cycle ? `${s.name} — ${s.cycle}` : s.name,
      isced: s.isced,
      iscedName: iscedLevel(s.isced).name,
      track: TRACK_LABEL[s.track],
      grades: s.grades,
      periods: s.periodModels.map((p) => PERIOD_MODEL_LABEL[p]),
      courses: s.courses.length,
      planEntries: s.curriculum.length,
      status: s.status,
      statusLabel: VERIFICATION_LABEL[s.status],
      source: s.source,
      version: s.version,
      notes: s.notes ?? null,
    })),
    sources: CATALOG_SOURCES.map((s) => ({ ...s, statusLabel: VERIFICATION_LABEL[s.status] })),
  };
}

export type CatalogOverview = ReturnType<typeof buildCatalogOverview>;
