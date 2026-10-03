/**
 * Estrutura académica certa para o contexto da escola.
 *
 * O cliente diz no registo (ou em Definições → Pedagógico) que níveis lecciona
 * e, no II Ciclo, que cursos. Daqui sai o plano do que criar: níveis
 * (academic_levels), cursos (programs), classes (grade_levels) e disciplinas.
 *
 * Antes, toda a escola nascia com «Ensino Geral · 10ª Classe · turma 10ª A»
 * (40 escolas na produção, 2026-10-03), fosse uma escola primária, um
 * complexo do Iniciação ao II Ciclo ou um instituto técnico.
 *
 * Função pura: os códigos são estáveis para que repetir «Preparar estrutura»
 * só acrescente o que falta, nunca duplique nem apague.
 */
import {
  angolaCoreSubjects,
  angolaSecondaryCourses,
  type AngolaCourseId,
  type AngolaTeachingLevelId,
} from "@/lib/angola-academic";

export type PlannedLevel = { code: string; name: string; sequence: number };
export type PlannedProgram = {
  code: string;
  name: string;
  kind: "general" | "technical" | "undergraduate";
  levelCode: string;
};
export type PlannedGrade = { code: string; name: string; sequence: number; programCode: string };
export type PlannedSubject = { code: string; name: string; short_name: string };

export type SchoolStructurePlan = {
  levels: PlannedLevel[];
  programs: PlannedProgram[];
  grades: PlannedGrade[];
  subjects: PlannedSubject[];
};

// Códigos alinhados com os que já existem na produção («primary», «cycle_i»).
const LEVELS: Record<AngolaTeachingLevelId, PlannedLevel> = {
  pre_escolar: { code: "pre_school", name: "Iniciação", sequence: 1 },
  primario: { code: "primary", name: "Ensino Primário", sequence: 2 },
  i_ciclo: { code: "cycle_i", name: "I Ciclo do Ensino Secundário", sequence: 3 },
  ii_ciclo: { code: "cycle_ii", name: "II Ciclo do Ensino Secundário", sequence: 4 },
  superior: { code: "higher", name: "Ensino Superior", sequence: 5 },
};

const LEVEL_ORDER: AngolaTeachingLevelId[] = [
  "pre_escolar",
  "primario",
  "i_ciclo",
  "ii_ciclo",
  "superior",
];

const SHORT_NAMES: Record<string, string> = {
  LP: "Port",
  MAT: "Mat",
  EF: "EF",
  EM: "EMC",
  CN: "CN",
  HIST: "Hist",
  GEO: "Geo",
  ING: "Ing",
  FIS: "Fís",
  QUI: "Quím",
  BIO: "Bio",
  FIL: "Fil",
};

function classesFor(prefix: string, from: number, to: number, programCode: string) {
  const grades: PlannedGrade[] = [];
  for (let n = from; n <= to; n += 1) {
    grades.push({
      code: `${n}${prefix}`,
      name: `${n}ª Classe`,
      sequence: n,
      programCode,
    });
  }
  return grades;
}

export function planSchoolStructure(
  teachingLevels: readonly AngolaTeachingLevelId[],
  courses: readonly AngolaCourseId[] = [],
): SchoolStructurePlan {
  const selected = LEVEL_ORDER.filter((id) => teachingLevels.includes(id));
  const levels: PlannedLevel[] = [];
  const programs: PlannedProgram[] = [];
  const grades: PlannedGrade[] = [];

  for (const id of selected) {
    const level = LEVELS[id];
    levels.push(level);

    if (id === "pre_escolar") {
      programs.push({ code: "PRE", name: "Iniciação", kind: "general", levelCode: level.code });
      grades.push({ code: "INIC", name: "Iniciação", sequence: 0, programCode: "PRE" });
    } else if (id === "primario") {
      programs.push({
        code: "PRIM",
        name: "Ensino Primário",
        kind: "general",
        levelCode: level.code,
      });
      grades.push(...classesFor("PRIM", 1, 6, "PRIM"));
    } else if (id === "i_ciclo") {
      programs.push({ code: "ICICLO", name: "I Ciclo", kind: "general", levelCode: level.code });
      grades.push(...classesFor("ICICLO", 7, 9, "ICICLO"));
    } else if (id === "ii_ciclo") {
      // Cada curso tem as suas classes: «10ª Classe · CFB» e «10ª Classe · CEJ»
      // são turmas e pautas diferentes. Sem cursos indicados, um II Ciclo geral.
      const chosen = angolaSecondaryCourses.filter((course) => courses.includes(course.id));
      const list = chosen.length
        ? chosen
        : [{ id: "geral", label: "Ensino Geral", short: "Geral" } as const];
      for (const course of list) {
        const programCode = `IICICLO-${course.short.toUpperCase()}`;
        const technical = course.id === "tecnico";
        programs.push({
          code: programCode,
          name: course.label,
          kind: technical ? "technical" : "general",
          levelCode: level.code,
        });
        // O técnico-profissional vai até à 13ª classe.
        for (const grade of classesFor(programCode, 10, technical ? 13 : 12, programCode)) {
          grades.push({ ...grade, name: `${grade.name} · ${course.short}` });
        }
      }
    } else if (id === "superior") {
      programs.push({
        code: "LIC",
        name: "Licenciatura",
        kind: "undergraduate",
        levelCode: level.code,
      });
      for (let year = 1; year <= 5; year += 1) {
        grades.push({
          code: `${year}ANO-LIC`,
          name: `${year}º Ano`,
          sequence: year,
          programCode: "LIC",
        });
      }
    }
  }

  // Disciplinas do tronco comum dos níveis escolhidos (o superior não tem
  // tronco comum: as cadeiras são de cada curso e entram depois).
  const subjects = angolaCoreSubjects
    .filter((subject) => subject.levels.some((level) => selected.includes(level)))
    .map((subject) => ({
      code: subject.code,
      name: subject.name,
      short_name: SHORT_NAMES[subject.code] ?? subject.code,
    }));

  return { levels, programs, grades, subjects };
}
