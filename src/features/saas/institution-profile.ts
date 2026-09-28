/**
 * Perfil da instituição, escolhido no registo: que ensino oferece, em que
 * turnos e com quantas salas. Tudo o que a escola recebe ao nascer depende
 * daqui — níveis, classes, disciplinas, períodos, turnos e salas —, como nas
 * plataformas escolares que começam por um modelo e deixam ajustar depois.
 *
 * Funções puras: o plano é calculado aqui e gravado por `applyInstitutionPlan`
 * (school-bootstrap). Um complexo escolar é simplesmente mais do que um nível.
 */
import { z } from "zod";

export const INSTITUTION_LEVELS = [
  "pre_escolar",
  "primario",
  "i_ciclo",
  "ii_ciclo",
  "tecnico",
  "superior",
] as const;
export type InstitutionLevel = (typeof INSTITUTION_LEVELS)[number];

/** Nomes para o ecrã (a WEB tem a mesma lista em painel/web/src/lib/angola.ts). */
export const INSTITUTION_LEVEL_LABELS: Record<InstitutionLevel, { label: string; detail: string }> =
  {
    pre_escolar: { label: "Pré-escolar", detail: "Iniciação" },
    primario: { label: "Primário", detail: "1ª à 6ª classe" },
    i_ciclo: { label: "I Ciclo", detail: "7ª à 9ª classe" },
    ii_ciclo: { label: "II Ciclo / Médio", detail: "10ª à 12ª classe" },
    tecnico: { label: "Técnico-profissional", detail: "10ª à 13ª classe" },
    superior: { label: "Ensino Superior", detail: "Cursos e semestres" },
  };

export const INSTITUTION_SHIFTS = ["morning", "afternoon", "evening"] as const;
export type InstitutionShift = (typeof INSTITUTION_SHIFTS)[number];

export const INSTITUTION_SHIFT_LABELS: Record<InstitutionShift, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
};

export const MAX_INITIAL_ROOMS = 200;

export const institutionProfileSchema = z.object({
  levels: z
    .array(z.enum(INSTITUTION_LEVELS))
    .min(1, "Escolha pelo menos um nível de ensino.")
    .max(6),
  shifts: z.array(z.enum(INSTITUTION_SHIFTS)).min(1, "Escolha pelo menos um turno.").max(3),
  rooms: z.number().int().min(0).max(MAX_INITIAL_ROOMS).default(0),
  /** País do sistema de ensino seguido (define notas, créditos e regras). */
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .default("AO"),
});
export type InstitutionProfile = z.infer<typeof institutionProfileSchema>;

type Subject = { code: string; name: string; short_name: string };

type LevelDefinition = {
  code: string;
  name: string;
  sequence: number;
  /** `null` para o superior: os cursos criam-se em Pedagógica → Currículo. */
  program: { code: string; name: string; kind: "general" | "technical" } | null;
  grades: Array<{ code: string; name: string; sequence: number }>;
  subjects: Subject[];
  /** Id em `angolaTeachingLevels` (definições pedagógicas). */
  teachingLevel: "pre_escolar" | "primario" | "i_ciclo" | "ii_ciclo" | "superior";
  /** Curso do secundário a activar nas definições pedagógicas. */
  course?: "tecnico";
};

const s = (code: string, name: string, short_name = code): Subject => ({ code, name, short_name });

const LP = s("LP", "Língua Portuguesa", "Port");
const MAT = s("MAT", "Matemática", "Mat");
const EF = s("EF", "Educação Física", "EF");
const EMC = s("EMC", "Educação Moral e Cívica", "EMC");
const HIST = s("HIST", "História", "Hist");
const GEO = s("GEO", "Geografia", "Geo");
const FIS = s("FIS", "Física", "Fís");
const QUI = s("QUI", "Química", "Quí");
const BIO = s("BIO", "Biologia", "Bio");
const ING = s("ING", "Língua Estrangeira — Inglês", "Ing");
const INF = s("INF", "Informática", "Inf");
const EMPR = s("EMPR", "Empreendedorismo", "Empr");

/**
 * Plano de estudos de referência do sistema de educação angolano (Lei n.º 17/16,
 * alterada pela Lei n.º 32/20). É um ponto de partida: a escola acrescenta,
 * renomeia ou retira disciplinas em Pedagógica.
 */
const LEVELS: Record<InstitutionLevel, LevelDefinition> = {
  pre_escolar: {
    code: "PRE",
    name: "Educação Pré-escolar",
    sequence: 1,
    program: { code: "PRE", name: "Iniciação", kind: "general" },
    grades: [{ code: "INIC", name: "Iniciação", sequence: 1 }],
    subjects: [
      s("CL", "Comunicação e Linguagem", "Com"),
      s("RM", "Representação Matemática", "RMat"),
      s("MFS", "Meio Físico e Social", "Meio"),
      s("EXP", "Expressões", "Exp"),
    ],
    teachingLevel: "pre_escolar",
  },
  primario: {
    code: "PRIM",
    name: "Ensino Primário",
    sequence: 2,
    program: { code: "PRIM", name: "Ensino Primário", kind: "general" },
    grades: [1, 2, 3, 4, 5, 6].map((n) => ({ code: `${n}C`, name: `${n}ª Classe`, sequence: n })),
    subjects: [
      LP,
      MAT,
      s("EM", "Estudo do Meio", "EMeio"),
      s("CN", "Ciências da Natureza", "CN"),
      HIST,
      GEO,
      EMC,
      s("EMP", "Educação Manual e Plástica", "EMP"),
      s("EMUS", "Educação Musical", "EMus"),
      EF,
    ],
    teachingLevel: "primario",
  },
  i_ciclo: {
    code: "SEC1",
    name: "I Ciclo do Ensino Secundário",
    sequence: 3,
    program: { code: "SEC1", name: "I Ciclo do Ensino Secundário", kind: "general" },
    grades: [7, 8, 9].map((n) => ({ code: `${n}C`, name: `${n}ª Classe`, sequence: n })),
    subjects: [
      LP,
      MAT,
      FIS,
      QUI,
      BIO,
      GEO,
      HIST,
      ING,
      s("FRA", "Língua Estrangeira — Francês", "Fra"),
      s("EVP", "Educação Visual e Plástica", "EVP"),
      s("EL", "Educação Laboral", "EL"),
      EMC,
      EF,
    ],
    teachingLevel: "i_ciclo",
  },
  ii_ciclo: {
    code: "SEC2",
    name: "II Ciclo do Ensino Secundário",
    sequence: 4,
    program: { code: "SEC2", name: "II Ciclo — Ensino Geral", kind: "general" },
    grades: [10, 11, 12].map((n) => ({ code: `${n}C`, name: `${n}ª Classe`, sequence: n })),
    subjects: [LP, MAT, FIS, QUI, BIO, ING, s("FIL", "Filosofia", "Fil"), INF, EMPR, EF],
    teachingLevel: "ii_ciclo",
  },
  tecnico: {
    code: "TEC",
    name: "Ensino Técnico-Profissional",
    sequence: 5,
    program: { code: "TEC", name: "Ensino Técnico-Profissional", kind: "technical" },
    grades: [10, 11, 12, 13].map((n) => ({
      code: `T${n}C`,
      name: `${n}ª Classe (Técnico)`,
      sequence: n,
    })),
    subjects: [LP, MAT, FIS, ING, INF, EMPR, EF],
    teachingLevel: "ii_ciclo",
    course: "tecnico",
  },
  superior: {
    code: "SUP",
    name: "Ensino Superior",
    sequence: 6,
    program: null,
    grades: [],
    subjects: [],
    teachingLevel: "superior",
  },
};

const SHIFTS: Record<
  InstitutionShift,
  { code: string; name: string; starts_at: string; ends_at: string }
> = {
  morning: { code: "MANHA", name: "Manhã", starts_at: "07:00", ends_at: "12:30" },
  afternoon: { code: "TARDE", name: "Tarde", starts_at: "13:00", ends_at: "18:30" },
  evening: { code: "NOITE", name: "Noite", starts_at: "18:30", ends_at: "22:30" },
};

export type InstitutionPlan = ReturnType<typeof buildInstitutionPlan>;

/**
 * O que a escola recebe ao nascer. `yearStart` é o ano civil em que o ano
 * lectivo começa (Setembro). Ensino superior sozinho: dois semestres; com
 * ensino geral: três trimestres (o calendário do MED).
 */
export function buildInstitutionPlan(profile: InstitutionProfile, yearStart: number) {
  const levels = INSTITUTION_LEVELS.filter((level) => profile.levels.includes(level)).map(
    (level) => LEVELS[level],
  );
  const onlyHigherEducation = levels.every((level) => level.code === "SUP");

  const subjects = new Map<string, Subject>();
  for (const level of levels)
    for (const subject of level.subjects) subjects.set(subject.code, subject);

  const y = yearStart;
  const terms = onlyHigherEducation
    ? [
        { name: "1º Semestre", sequence: 1, starts_on: `${y}-10-01`, ends_on: `${y + 1}-02-28` },
        {
          name: "2º Semestre",
          sequence: 2,
          starts_on: `${y + 1}-03-01`,
          ends_on: `${y + 1}-07-31`,
        },
      ]
    : [
        { name: "1º Trimestre", sequence: 1, starts_on: `${y}-09-01`, ends_on: `${y}-12-12` },
        {
          name: "2º Trimestre",
          sequence: 2,
          starts_on: `${y + 1}-01-05`,
          ends_on: `${y + 1}-03-27`,
        },
        {
          name: "3º Trimestre",
          sequence: 3,
          starts_on: `${y + 1}-04-06`,
          ends_on: `${y + 1}-07-17`,
        },
      ];

  return {
    academicLevels: levels.map(({ code, name, sequence }) => ({ code, name, sequence })),
    programs: levels.flatMap((level) =>
      level.program ? [{ ...level.program, levelCode: level.code }] : [],
    ),
    gradeLevels: levels.flatMap((level) =>
      level.program
        ? level.grades.map((grade) => ({ ...grade, programCode: level.program!.code }))
        : [],
    ),
    subjects: [...subjects.values()],
    terms,
    evaluationPeriods: (onlyHigherEducation ? 2 : 3) as 2 | 3,
    shifts: INSTITUTION_SHIFTS.filter((shift) => profile.shifts.includes(shift)).map(
      (shift) => SHIFTS[shift],
    ),
    rooms: Array.from({ length: profile.rooms }, (_, i) => ({
      code: `S${String(i + 1).padStart(2, "0")}`,
      name: `Sala ${i + 1}`,
    })),
    teachingLevels: [...new Set(levels.map((level) => level.teachingLevel))],
    courses: [...new Set(levels.flatMap((level) => (level.course ? [level.course] : [])))],
    isComplex: levels.length > 1,
    country: profile.country ?? "AO",
    hasHigherEducation: levels.some((level) => level.code === "SUP"),
  };
}
