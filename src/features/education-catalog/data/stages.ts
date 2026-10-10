/**
 * Camada nacional: etapas de ensino, classes/anos e planos curriculares por
 * país, cada um com fonte e estado de verificação.
 *
 * Angola reaproveita os modelos já usados pelas escolas
 * (academic/curriculum-templates.ts): a mesma árvore, aqui ligada ao
 * catálogo global (ISCED, códigos globais de cursos e disciplinas).
 *
 * Moçambique tem só etapas e classes: as disciplinas por classe ficam por
 * importar até haver fonte conferida (INDE). Melhor uma lista vazia com o
 * aviso do que uma lista inventada.
 */
import { EDUCATION_LEVELS, type EducationLevelId } from "@/features/academic/curriculum-templates";
import type { IscedLevel } from "./isced";
import type { CatalogSourceId, VerificationStatus } from "./sources";

export type PeriodModel = "trimestres" | "periodos" | "semestres";

export const PERIOD_MODEL_LABEL: Record<PeriodModel, string> = {
  trimestres: "3 trimestres",
  periodos: "3 períodos",
  semestres: "2 semestres",
};

export type CurriculumEntry = {
  /** Curso global (`courses.ts`); `null` quando a etapa não tem cursos (primário, I ciclo). */
  course: string | null;
  grades: number[];
  /** Disciplinas obrigatórias (códigos globais). */
  core: string[];
  /** Disciplinas de opção, quando o plano as tem. */
  optional?: string[];
};

export type EducationStage = {
  id: string;
  country: string;
  name: string;
  /** Ciclo dentro da etapa, quando existe («I Ciclo», «2.º ciclo»). */
  cycle?: string;
  isced: IscedLevel;
  track: "general" | "technical" | "higher";
  grades: number[];
  /** Rótulo de cada classe/ano. */
  gradeUnit: "classe" | "ano";
  periodModels: PeriodModel[];
  assessment?: { min: number; max: number; passing: number };
  /** Cursos (globais) que existem nesta etapa no país. */
  courses: string[];
  curriculum: CurriculumEntry[];
  /** Ligação ao modelo de estrutura do SIGA, quando existe. */
  templateLevel?: EducationLevelId;
  source: CatalogSourceId;
  status: VerificationStatus;
  version: string;
  effectiveFrom?: string;
  notes?: string;
};

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// ── Angola: derivado dos modelos de estrutura ──────────────────────────────

/** Códigos dos modelos angolanos que mudam no catálogo global. */
export const AO_TEMPLATE_SUBJECT_MAP: Record<string, string> = { LE: "ING", PT: "PTEC" };

export const AO_TEMPLATE_COURSE_MAP: Record<string, string> = {
  CFB: "SEC-CFB",
  CEJ: "SEC-CEJ",
  CH: "SEC-CH",
  INF: "TEC-INF",
  CG: "TEC-CG",
  EE: "TEC-EE",
  CC: "TEC-CC",
  MEC: "TEC-MEC",
  DIR: "LIC-DIR",
  ECO: "LIC-ECO",
  GEST: "LIC-GEST",
  CAUD: "LIC-CG",
  EINF: "LIC-EINF",
  ENF: "LIC-ENF",
  PSI: "LIC-PSI",
  ARQ: "LIC-ARQ",
};

const AO_LEVEL_META: Record<
  EducationLevelId,
  Pick<EducationStage, "id" | "isced" | "track" | "cycle" | "periodModels" | "assessment">
> = {
  primario: { id: "AO-EP", isced: 1, track: "general", periodModels: ["trimestres"] },
  secundario_1: {
    id: "AO-ESG1",
    isced: 2,
    track: "general",
    cycle: "I Ciclo",
    periodModels: ["trimestres"],
    assessment: { min: 0, max: 20, passing: 10 },
  },
  secundario_2: {
    id: "AO-ESG2",
    isced: 3,
    track: "general",
    cycle: "II Ciclo",
    periodModels: ["trimestres"],
    assessment: { min: 0, max: 20, passing: 10 },
  },
  tecnico: {
    id: "AO-ETP",
    isced: 3,
    track: "technical",
    periodModels: ["trimestres"],
    assessment: { min: 0, max: 20, passing: 10 },
  },
  superior: {
    id: "AO-ES",
    isced: 6,
    track: "higher",
    periodModels: ["semestres"],
    assessment: { min: 0, max: 20, passing: 10 },
  },
};

function angolaStages(): EducationStage[] {
  const pre: EducationStage = {
    id: "AO-PRE",
    country: "AO",
    name: "Educação Pré-Escolar (Iniciação)",
    isced: 0,
    track: "general",
    grades: [0],
    gradeUnit: "classe",
    periodModels: ["trimestres"],
    courses: [],
    curriculum: [],
    source: "ao-lbsee",
    status: "in_review",
    version: "Lei 17/16 + Lei 32/20",
    notes: "A classe de iniciação aparece como «Iniciação» (classe 0).",
  };
  const fromTemplates = EDUCATION_LEVELS.map((level): EducationStage => {
    const meta = AO_LEVEL_META[level.id];
    const multi = level.courses.length > 1 || level.kind === "undergraduate";
    const courses = multi ? level.courses.map((c) => AO_TEMPLATE_COURSE_MAP[c.code] ?? c.code) : [];
    const curriculum: CurriculumEntry[] = [];
    for (const course of level.courses) {
      for (const n of course.grades) {
        const codes = [...(course.subjects["*"] ?? []), ...(course.subjects[n] ?? [])];
        if (!codes.length) continue;
        curriculum.push({
          course: multi ? (AO_TEMPLATE_COURSE_MAP[course.code] ?? course.code) : null,
          grades: [n],
          core: [...new Set(codes.map((c) => AO_TEMPLATE_SUBJECT_MAP[c] ?? c))],
        });
      }
    }
    return {
      ...meta,
      country: "AO",
      name: level.name,
      grades: [...new Set(level.courses.flatMap((c) => c.grades))].sort((a, b) => a - b),
      gradeUnit: level.kind === "undergraduate" ? "ano" : "classe",
      courses,
      curriculum,
      templateLevel: level.id,
      source: level.kind === "undergraduate" ? "ao-lbsee" : "ao-inide-planos",
      status: "in_review",
      version: "Planos INIDE em vigor",
      notes:
        level.kind === "undergraduate"
          ? "Unidades curriculares variam por instituição e curso: não pré-carregadas."
          : "Cargas horárias não incluídas: variam por plano.",
    };
  });
  return [pre, ...fromTemplates];
}

// ── Moçambique: etapas e classes (Lei n.º 18/2018) ─────────────────────────

const MZ_COMMON = {
  country: "MZ",
  gradeUnit: "classe" as const,
  courses: [],
  curriculum: [],
  source: "mz-lei-sne" as const,
  status: "in_review" as const,
  version: "Lei 18/2018",
  notes: "Disciplinas por classe por importar (INDE): sem fonte conferida.",
};

const MOZAMBIQUE: EducationStage[] = [
  {
    ...MZ_COMMON,
    id: "MZ-PRE",
    name: "Educação Pré-Escolar",
    isced: 0,
    track: "general",
    grades: [],
    periodModels: ["trimestres"],
  },
  {
    ...MZ_COMMON,
    id: "MZ-EP1",
    name: "Ensino Primário",
    cycle: "1.º Ciclo",
    isced: 1,
    track: "general",
    grades: range(1, 3),
    periodModels: ["trimestres"],
  },
  {
    ...MZ_COMMON,
    id: "MZ-EP2",
    name: "Ensino Primário",
    cycle: "2.º Ciclo",
    isced: 1,
    track: "general",
    grades: range(4, 6),
    periodModels: ["trimestres"],
  },
  {
    ...MZ_COMMON,
    id: "MZ-ESG1",
    name: "Ensino Secundário",
    cycle: "1.º Ciclo",
    isced: 2,
    track: "general",
    grades: range(7, 9),
    periodModels: ["trimestres"],
    assessment: { min: 0, max: 20, passing: 10 },
  },
  {
    ...MZ_COMMON,
    id: "MZ-ESG2",
    name: "Ensino Secundário",
    cycle: "2.º Ciclo",
    isced: 3,
    track: "general",
    grades: range(10, 12),
    periodModels: ["trimestres"],
    assessment: { min: 0, max: 20, passing: 10 },
  },
  {
    ...MZ_COMMON,
    id: "MZ-ES",
    name: "Ensino Superior",
    isced: 6,
    track: "higher",
    grades: range(1, 4),
    gradeUnit: "ano",
    periodModels: ["semestres"],
    notes: "Cursos e unidades curriculares por instituição.",
  },
];

// ── Portugal: matrizes do Decreto-Lei n.º 55/2018 ─────────────────────────

const PT_COMMON = {
  country: "PT",
  source: "pt-dge-curriculo" as const,
  status: "in_review" as const,
  version: "DL 55/2018",
  gradeUnit: "ano" as const,
};

const PORTUGAL: EducationStage[] = [
  {
    ...PT_COMMON,
    id: "PT-PRE",
    name: "Educação Pré-Escolar",
    isced: 0,
    track: "general",
    grades: [],
    periodModels: ["periodos", "semestres"],
    courses: [],
    curriculum: [],
    notes:
      "Orientações Curriculares para a Educação Pré-Escolar (áreas de conteúdo, não disciplinas).",
  },
  {
    ...PT_COMMON,
    id: "PT-EB1",
    name: "Ensino Básico",
    cycle: "1.º Ciclo",
    isced: 1,
    track: "general",
    grades: range(1, 4),
    periodModels: ["periodos", "semestres"],
    courses: [],
    curriculum: [
      {
        course: null,
        grades: [1, 2],
        core: ["LP", "MAT", "EM", "EA", "EF", "CD", "TIC"],
        optional: ["EMRC"],
      },
      {
        course: null,
        grades: [3, 4],
        core: ["LP", "MAT", "EM", "EA", "EF", "ING", "CD", "TIC"],
        optional: ["EMRC"],
      },
    ],
    notes: "Cidadania e Desenvolvimento e TIC são áreas de integração curricular no 1.º ciclo.",
  },
  {
    ...PT_COMMON,
    id: "PT-EB2",
    name: "Ensino Básico",
    cycle: "2.º Ciclo",
    isced: 1,
    track: "general",
    grades: range(5, 6),
    periodModels: ["periodos", "semestres"],
    assessment: { min: 1, max: 5, passing: 3 },
    courses: [],
    curriculum: [
      {
        course: null,
        grades: [5, 6],
        core: ["LP", "ING", "HGP", "CD", "MAT", "CN", "EV", "ET", "EMUS", "EF", "TIC"],
        optional: ["EMRC"],
      },
    ],
  },
  {
    ...PT_COMMON,
    id: "PT-EB3",
    name: "Ensino Básico",
    cycle: "3.º Ciclo",
    isced: 2,
    track: "general",
    grades: range(7, 9),
    periodModels: ["periodos", "semestres"],
    assessment: { min: 1, max: 5, passing: 3 },
    courses: [],
    curriculum: [
      {
        course: null,
        grades: [7, 8, 9],
        core: ["LP", "ING", "LE2", "HIST", "GEO", "CD", "MAT", "CN", "FQ", "EV", "TIC", "EF"],
        optional: ["EMRC"],
      },
    ],
    notes: "TIC partilha a carga com a Oferta de Escola, conforme a escola.",
  },
  {
    ...PT_COMMON,
    id: "PT-SEC",
    name: "Ensino Secundário — Cursos Científico-Humanísticos",
    isced: 3,
    track: "general",
    grades: range(10, 12),
    periodModels: ["periodos", "semestres"],
    assessment: { min: 0, max: 20, passing: 10 },
    courses: ["SEC-CT", "SEC-CSE", "SEC-LH", "SEC-AV"],
    curriculum: [
      {
        course: "SEC-CT",
        grades: [10, 11],
        core: ["LP", "ING", "FIL", "EF", "MATA"],
        optional: ["FQA", "BG", "GDA"],
      },
      { course: "SEC-CT", grades: [12], core: ["LP", "EF", "MATA"] },
      {
        course: "SEC-CSE",
        grades: [10, 11],
        core: ["LP", "ING", "FIL", "EF", "MATA"],
        optional: ["ECOA", "GEO"],
      },
      { course: "SEC-CSE", grades: [12], core: ["LP", "EF", "MATA"] },
      {
        course: "SEC-LH",
        grades: [10, 11],
        core: ["LP", "ING", "FIL", "EF", "HISTA"],
        optional: ["GEO", "LIT", "MATAP", "LE2"],
      },
      { course: "SEC-LH", grades: [12], core: ["LP", "EF", "HISTA"] },
      {
        course: "SEC-AV",
        grades: [10, 11],
        core: ["LP", "ING", "FIL", "EF", "DES"],
        optional: ["GDA", "HART"],
      },
      { course: "SEC-AV", grades: [12], core: ["LP", "EF", "DES"] },
    ],
    notes: "Opções anuais do 12.º ano e cursos profissionais por importar.",
  },
  {
    ...PT_COMMON,
    id: "PT-TESP",
    name: "Cursos Técnicos Superiores Profissionais",
    isced: 5,
    track: "higher",
    grades: range(1, 2),
    periodModels: ["semestres"],
    assessment: { min: 0, max: 20, passing: 10 },
    courses: ["CTS-RSI", "CTS-DSW"],
    curriculum: [],
    source: "pt-dges-graus",
    version: "DL 74/2006 (republicado)",
  },
  {
    ...PT_COMMON,
    id: "PT-LIC",
    name: "Licenciatura",
    isced: 6,
    track: "higher",
    grades: range(1, 4),
    periodModels: ["semestres"],
    assessment: { min: 0, max: 20, passing: 10 },
    courses: [
      "LIC-EINF",
      "LIC-ENF",
      "LIC-DIR",
      "LIC-GEST",
      "LIC-ECO",
      "LIC-PSI",
      "LIC-ECIV",
      "LIC-EELT",
      "LIC-PED",
      "LIC-EP",
    ],
    curriculum: [],
    source: "pt-dges-graus",
    version: "DL 74/2006 (republicado)",
    notes: "180–240 ECTS. Unidades curriculares por instituição (registo na DGES/A3ES).",
  },
  {
    ...PT_COMMON,
    id: "PT-MES",
    name: "Mestrado",
    isced: 7,
    track: "higher",
    grades: range(1, 2),
    periodModels: ["semestres"],
    assessment: { min: 0, max: 20, passing: 10 },
    courses: ["MES-EDU", "MES-GEST", "MES-SP"],
    curriculum: [],
    source: "pt-dges-graus",
    version: "DL 74/2006 (republicado)",
  },
];

export const EDUCATION_STAGES: readonly EducationStage[] = [
  ...angolaStages(),
  ...MOZAMBIQUE,
  ...PORTUGAL,
];

export function stagesFor(countryCode: string) {
  return EDUCATION_STAGES.filter((s) => s.country === countryCode.toUpperCase());
}

export function stage(id: string) {
  return EDUCATION_STAGES.find((s) => s.id === id);
}

/** «10ª Classe», «7.º ano», «Iniciação», «1.º Ano» (superior). */
export function gradeLabel(s: Pick<EducationStage, "gradeUnit" | "country" | "track">, n: number) {
  if (n === 0) return "Iniciação";
  if (s.gradeUnit === "classe") return `${n}ª Classe`;
  return s.country === "PT" ? `${n}.º ano` : `${n}º Ano`;
}
