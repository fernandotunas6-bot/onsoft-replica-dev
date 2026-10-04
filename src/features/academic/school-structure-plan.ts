/**
 * Estrutura académica certa para o contexto da escola.
 *
 * O cliente diz no registo (ou em Definições → Pedagógico) que níveis lecciona
 * e, no II Ciclo, que cursos. Daqui sai o plano do que criar — no mesmo
 * formato e com os mesmos códigos dos «modelos de estrutura» (Pedagógica →
 * Estrutura → Modelo), para que registo, assistente e modelo nunca criem o
 * mesmo nível, curso ou classe duas vezes:
 *   EP (Primário) · ESG1 (I Ciclo) · ESG2-<área> (II Ciclo) · ETP (Técnico)
 *   · ES-<curso> (Superior) · INIC (Iniciação, só aqui).
 *
 * Antes, toda a escola nascia com «Ensino Geral · 10ª Classe · turma 10ª A»
 * (40 escolas na produção, 2026-10-03). Sem turmas nem salas: quantas turmas e
 * em que turno é decisão da escola (o modelo de estrutura cria-as se pedido).
 */
import type { AngolaCourseId, AngolaTeachingLevelId } from "@/lib/angola-academic";
import {
  EDUCATION_LEVELS,
  planCurriculum,
  type CurriculumPlan,
  type EducationLevelId,
} from "./curriculum-templates";

export type SchoolStructurePlan = CurriculumPlan;

/** Áreas do II Ciclo do registo → cursos do modelo (Letras = Ciências Humanas). */
const AREA_TO_TEMPLATE: Partial<Record<AngolaCourseId, string>> = {
  cfb: "CFB",
  cej: "CEJ",
  letras: "CH",
};

const levelDef = (id: EducationLevelId) => EDUCATION_LEVELS.find((level) => level.id === id)!;

/** Curso genérico de um nível (quando o registo não diz qual). */
function addGeneric(
  plan: CurriculumPlan,
  level: {
    code: string;
    name: string;
    sequence: number;
    kind: "general" | "technical" | "undergraduate";
  },
  program: { code: string; name: string; short: string },
  grades: Array<{ n: number; code: string; label: string }>,
) {
  if (!plan.levels.some((l) => l.code === level.code)) {
    plan.levels.push({ code: level.code, name: level.name, sequence: level.sequence });
  }
  plan.programs.push({
    levelCode: level.code,
    code: program.code,
    name: program.name,
    kind: level.kind,
    higherEducation: level.kind === "undergraduate",
  });
  for (const grade of grades) {
    plan.grades.push({
      programCode: program.code,
      code: grade.code,
      name: `${grade.label} · ${program.short}`,
      sequence: grade.n,
    });
  }
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

export function planSchoolStructure(
  teachingLevels: readonly AngolaTeachingLevelId[],
  courses: readonly AngolaCourseId[] = [],
): SchoolStructurePlan {
  const has = (id: AngolaTeachingLevelId) => teachingLevels.includes(id);
  const areas = courses
    .map((course) => AREA_TO_TEMPLATE[course])
    .filter((code): code is string => Boolean(code));

  const plan = planCurriculum({
    courses: {
      ...(has("primario") ? { primario: ["EP"] } : {}),
      ...(has("i_ciclo") ? { secundario_1: ["ESG1"] } : {}),
      ...(has("ii_ciclo") && areas.length ? { secundario_2: areas } : {}),
    },
    groupsPerGrade: 1,
    shifts: ["morning"],
    capacity: 35,
    createRooms: false,
  });
  plan.classGroups = [];
  plan.rooms = [];

  if (has("pre_escolar")) {
    addGeneric(
      plan,
      { code: "INIC", name: "Iniciação", sequence: 0, kind: "general" },
      { code: "INIC", name: "Iniciação", short: "INIC" },
      [{ n: 0, code: "INIC", label: "Iniciação" }],
    );
  }
  if (has("ii_ciclo")) {
    // Sem área indicada (nem técnico), um II Ciclo geral.
    if (!areas.length && !courses.includes("tecnico")) {
      const esg2 = levelDef("secundario_2");
      addGeneric(
        plan,
        esg2,
        { code: "ESG2-GERAL", name: "II Ciclo — Ensino Geral", short: "GERAL" },
        range(10, 12).map((n) => ({ n, code: `${n}CL`, label: esg2.gradeLabel(n) })),
      );
    }
    // Técnico-profissional indicado sem curso: um curso técnico genérico (10ª–13ª).
    if (courses.includes("tecnico")) {
      const etp = levelDef("tecnico");
      addGeneric(
        plan,
        etp,
        { code: "ETP-GERAL", name: "Técnico-Profissional", short: "ETP" },
        range(10, 13).map((n) => ({ n, code: `${n}CL`, label: etp.gradeLabel(n) })),
      );
    }
  }
  if (has("superior")) {
    // A Licenciatura de partida; os cursos reais criam-se em Ensino Superior
    // (ou no modelo de estrutura).
    const es = levelDef("superior");
    addGeneric(
      plan,
      es,
      { code: "ES-LIC", name: "Licenciatura", short: "LIC" },
      range(1, 5).map((n) => ({ n, code: `${n}ANO`, label: es.gradeLabel(n) })),
    );
  }

  plan.levels.sort((a, b) => a.sequence - b.sequence);
  return plan;
}
