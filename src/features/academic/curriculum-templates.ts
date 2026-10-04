/**
 * Modelos de estrutura académica por nível de ensino — Angola.
 *
 * Uma escola nova tinha de criar à mão níveis, cursos, classes, disciplinas,
 * turmas e salas; o «Preparar estrutura» só criava uma 10ª classe genérica.
 * Aqui a escola escolhe o que lecciona e recebe a árvore completa, com os
 * nomes usados no sistema de educação angolano (Lei n.º 17/16, alterada pela
 * Lei n.º 32/20):
 *
 *   - Ensino Primário: 1ª à 6ª classe;
 *   - Ensino Secundário Geral, I Ciclo: 7ª à 9ª classe;
 *   - Ensino Secundário Geral, II Ciclo: 10ª à 12ª classe, por área;
 *   - Ensino Técnico-Profissional (formação média técnica): 10ª à 13ª classe;
 *   - Ensino Superior: licenciaturas por anos (1º Ano…), semestrais.
 *
 * As disciplinas seguem os planos curriculares publicados pelo INIDE/MED para
 * cada nível, na forma mais comum. São um ponto de partida: a escola retira ou
 * acrescenta depois em Pedagógica → Disciplinas / Currículo. A carga horária
 * não é preenchida — varia por plano e a escola indica a sua.
 *
 * Este ficheiro é só dados e o plano do que criar (testável sem base); a
 * escrita está em curriculum-templates-server.ts.
 */

export type EducationLevelId =
  "primario" | "secundario_1" | "secundario_2" | "tecnico" | "superior";

export type SubjectDef = { code: string; name: string; short: string };

export type CourseDef = {
  code: string;
  name: string;
  /** Classes (ou anos, no superior) em que o curso existe. */
  grades: number[];
  /** Disciplinas por classe; `*` aplica a todas as classes do curso. */
  subjects: Partial<Record<number | "*", string[]>>;
};

export type LevelDef = {
  id: EducationLevelId;
  label: string;
  /** Código/nome do nível em `academic_levels`. */
  code: string;
  name: string;
  sequence: number;
  kind: "general" | "technical" | "undergraduate";
  /** Rótulo das classes: «10ª Classe» ou «1º Ano». */
  gradeLabel: (n: number) => string;
  /** Cursos oferecidos; a escola escolhe quais (ex.: áreas do II Ciclo). */
  courses: CourseDef[];
  /** Salas especializadas que o nível costuma ter. */
  specialRooms: Array<{ code: string; name: string; type: string }>;
  hint: string;
};

const classe = (n: number) => `${n}ª Classe`;
const ano = (n: number) => `${n}º Ano`;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Catálogo único de disciplinas: o mesmo código em todos os níveis. */
export const SUBJECTS: Record<string, SubjectDef> = Object.fromEntries(
  (
    [
      ["LP", "Língua Portuguesa", "L. Portuguesa"],
      ["MAT", "Matemática", "Matemática"],
      ["EM", "Estudo do Meio", "Est. do Meio"],
      ["CN", "Ciências da Natureza", "C. Natureza"],
      ["HIST", "História", "História"],
      ["GEO", "Geografia", "Geografia"],
      ["EMC", "Educação Moral e Cívica", "E. Moral e Cívica"],
      ["EMP", "Educação Manual e Plástica", "E. Manual e Plástica"],
      ["EMUS", "Educação Musical", "E. Musical"],
      ["EF", "Educação Física", "E. Física"],
      ["LE", "Língua Estrangeira (Inglês)", "Inglês"],
      ["BIO", "Biologia", "Biologia"],
      ["FIS", "Física", "Física"],
      ["QUI", "Química", "Química"],
      ["EVP", "Educação Visual e Plástica", "E. Visual e Plástica"],
      ["EL", "Educação Laboral", "E. Laboral"],
      ["GEOL", "Geologia", "Geologia"],
      ["INF", "Informática", "Informática"],
      ["FIL", "Filosofia", "Filosofia"],
      ["EMPR", "Empreendedorismo", "Empreendedorismo"],
      ["IECO", "Introdução à Economia", "Int. Economia"],
      ["IDIR", "Introdução ao Direito", "Int. Direito"],
      ["SOC", "Sociologia", "Sociologia"],
      ["LIT", "Literatura", "Literatura"],
      ["FAI", "Formação de Atitudes Integradoras", "F. Atitudes Integradoras"],
      ["TLP", "Técnicas de Linguagens de Programação", "TLP"],
      ["SEAC", "Sistemas de Exploração e Arquitectura de Computadores", "SEAC"],
      ["TIC", "Tecnologias de Informação e Comunicação", "TIC"],
      ["TREI", "Técnicas de Reparação de Equipamentos Informáticos", "TREI"],
      ["OGE", "Organização e Gestão de Empresas", "OGE"],
      ["PT", "Projecto Tecnológico", "Proj. Tecnológico"],
      ["CONT", "Contabilidade Geral", "Contabilidade"],
      ["CANA", "Contabilidade Analítica", "Cont. Analítica"],
      ["ECO", "Economia", "Economia"],
      ["DCOM", "Direito Comercial", "Dir. Comercial"],
      ["CFIN", "Cálculo Financeiro", "Cálc. Financeiro"],
      ["ELEC", "Electrotecnia", "Electrotecnia"],
      ["ELN", "Electrónica", "Electrónica"],
      ["DT", "Desenho Técnico", "Desenho Técnico"],
      ["TPO", "Tecnologia e Práticas Oficinais", "Práticas Oficinais"],
      ["MSE", "Máquinas e Sistemas Eléctricos", "Máq. Eléctricas"],
      ["TCC", "Tecnologia da Construção Civil", "Tec. Construção"],
      ["MCON", "Materiais de Construção", "Mat. Construção"],
      ["TOP", "Topografia", "Topografia"],
      ["TMEC", "Tecnologia Mecânica", "Tec. Mecânica"],
      ["MAPL", "Mecânica Aplicada", "Mec. Aplicada"],
    ] as const
  ).map(([code, name, short]) => [code, { code, name, short }]),
);

const TECH_COMMON = ["LP", "LE", "FAI", "EF", "MAT", "FIS", "EMPR"];

export const EDUCATION_LEVELS: LevelDef[] = [
  {
    id: "primario",
    label: "Ensino Primário (1ª–6ª)",
    code: "EP",
    name: "Ensino Primário",
    sequence: 1,
    kind: "general",
    gradeLabel: classe,
    hint: "Monodocência: um professor por turma na maioria das disciplinas.",
    courses: [
      {
        code: "EP",
        name: "Ensino Primário",
        grades: range(1, 6),
        subjects: {
          "*": ["LP", "MAT", "EMC", "EMP", "EMUS", "EF"],
          1: ["EM"],
          2: ["EM"],
          3: ["EM"],
          4: ["EM"],
          5: ["CN", "HIST", "GEO"],
          6: ["CN", "HIST", "GEO"],
        },
      },
    ],
    specialRooms: [],
  },
  {
    id: "secundario_1",
    label: "I Ciclo do Secundário (7ª–9ª)",
    code: "ESG1",
    name: "Ensino Secundário Geral — I Ciclo",
    sequence: 2,
    kind: "general",
    gradeLabel: classe,
    hint: "Um professor por disciplina.",
    courses: [
      {
        code: "ESG1",
        name: "I Ciclo do Ensino Secundário Geral",
        grades: range(7, 9),
        subjects: {
          "*": ["LP", "LE", "MAT", "BIO", "FIS", "QUI", "GEO", "HIST", "EF", "EMC", "EVP", "EL"],
        },
      },
    ],
    specialRooms: [{ code: "LAB-CIE", name: "Laboratório de Ciências", type: "biology_lab" }],
  },
  {
    id: "secundario_2",
    label: "II Ciclo do Secundário (10ª–12ª)",
    code: "ESG2",
    name: "Ensino Secundário Geral — II Ciclo",
    sequence: 3,
    kind: "general",
    gradeLabel: classe,
    hint: "Por área de formação; escolha as que a escola oferece.",
    courses: [
      {
        code: "CFB",
        name: "Ciências Físicas e Biológicas",
        grades: range(10, 12),
        subjects: {
          "*": ["LP", "LE", "MAT", "FIS", "QUI", "BIO", "FIL", "INF", "EF", "EMPR"],
          11: ["GEOL"],
          12: ["GEOL"],
        },
      },
      {
        code: "CEJ",
        name: "Ciências Económicas e Jurídicas",
        grades: range(10, 12),
        subjects: {
          "*": ["LP", "LE", "MAT", "IECO", "IDIR", "GEO", "HIST", "FIL", "INF", "EF", "EMPR"],
        },
      },
      {
        code: "CH",
        name: "Ciências Humanas",
        grades: range(10, 12),
        subjects: {
          "*": ["LP", "LE", "MAT", "HIST", "GEO", "FIL", "SOC", "LIT", "INF", "EF", "EMPR"],
        },
      },
    ],
    specialRooms: [
      { code: "LAB-CIE", name: "Laboratório de Ciências", type: "biology_lab" },
      { code: "LAB-INF", name: "Laboratório de Informática", type: "computer_lab" },
    ],
  },
  {
    id: "tecnico",
    label: "Técnico-Profissional (10ª–13ª)",
    code: "ETP",
    name: "Ensino Técnico-Profissional",
    sequence: 4,
    kind: "technical",
    gradeLabel: classe,
    hint: "Formação média técnica em 4 anos; escolha os cursos.",
    courses: [
      {
        code: "INF",
        name: "Técnico de Informática",
        grades: range(10, 13),
        subjects: { "*": [...TECH_COMMON, "TLP", "SEAC", "TIC", "TREI", "OGE"], 13: ["PT"] },
      },
      {
        code: "CG",
        name: "Contabilidade e Gestão",
        grades: range(10, 13),
        subjects: {
          "*": [...TECH_COMMON, "CONT", "ECO", "DCOM", "CFIN", "OGE", "INF"],
          12: ["CANA"],
          13: ["CANA", "PT"],
        },
      },
      {
        code: "EE",
        name: "Electricidade e Electrónica",
        grades: range(10, 13),
        subjects: { "*": [...TECH_COMMON, "QUI", "ELEC", "ELN", "DT", "TPO", "MSE"], 13: ["PT"] },
      },
      {
        code: "CC",
        name: "Construção Civil",
        grades: range(10, 13),
        subjects: { "*": [...TECH_COMMON, "QUI", "DT", "TCC", "MCON", "TOP", "TPO"], 13: ["PT"] },
      },
      {
        code: "MEC",
        name: "Mecânica",
        grades: range(10, 13),
        subjects: { "*": [...TECH_COMMON, "QUI", "DT", "TMEC", "MAPL", "ELEC", "TPO"], 13: ["PT"] },
      },
    ],
    specialRooms: [
      { code: "LAB-INF", name: "Laboratório de Informática", type: "computer_lab" },
      { code: "OFICINA", name: "Oficina", type: "workshop" },
    ],
  },
  {
    id: "superior",
    label: "Ensino Superior (licenciaturas)",
    code: "ES",
    name: "Ensino Superior",
    sequence: 5,
    kind: "undergraduate",
    gradeLabel: ano,
    hint: "Cursos por anos e semestres. As unidades curriculares variam por curso: acrescente-as depois.",
    courses: [
      { code: "DIR", name: "Direito", grades: range(1, 5), subjects: {} },
      { code: "ECO", name: "Economia", grades: range(1, 4), subjects: {} },
      { code: "GEST", name: "Gestão de Empresas", grades: range(1, 4), subjects: {} },
      { code: "CAUD", name: "Contabilidade e Auditoria", grades: range(1, 4), subjects: {} },
      { code: "EINF", name: "Engenharia Informática", grades: range(1, 5), subjects: {} },
      { code: "ENF", name: "Enfermagem", grades: range(1, 4), subjects: {} },
      { code: "PSI", name: "Psicologia", grades: range(1, 4), subjects: {} },
      { code: "ARQ", name: "Arquitectura e Urbanismo", grades: range(1, 5), subjects: {} },
    ],
    specialRooms: [{ code: "AUD", name: "Auditório", type: "auditorium" }],
  },
];

export type TemplateSelection = {
  /** Cursos escolhidos por nível. Nível sem cursos escolhidos fica de fora. */
  courses: Partial<Record<EducationLevelId, string[]>>;
  /** Turmas por classe (A, B, C…). */
  groupsPerGrade: number;
  shifts: Array<"morning" | "afternoon" | "evening">;
  capacity: number;
  createRooms: boolean;
};

const SHIFT: Record<TemplateSelection["shifts"][number], { code: string; label: string }> = {
  morning: { code: "M", label: "Manhã" },
  afternoon: { code: "T", label: "Tarde" },
  evening: { code: "N", label: "Noite" },
};

export type CurriculumPlan = {
  levels: Array<{ code: string; name: string; sequence: number }>;
  programs: Array<{
    levelCode: string;
    code: string;
    name: string;
    kind: LevelDef["kind"];
    higherEducation: boolean;
  }>;
  grades: Array<{ programCode: string; code: string; name: string; sequence: number }>;
  subjects: SubjectDef[];
  /** Disciplina por classe de curso — vira `curricula` + `curriculum_subjects`. */
  curriculum: Array<{ programCode: string; gradeCode: string; subjectCodes: string[] }>;
  classGroups: Array<{
    programCode: string;
    gradeCode: string;
    code: string;
    name: string;
    shift: TemplateSelection["shifts"][number];
    capacity: number;
  }>;
  rooms: Array<{ code: string; name: string; type: string; capacity: number | null }>;
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Código de classe numa só forma: 10ª Classe → "10CL", 1º Ano → "1ANO". */
export function gradeCode(level: LevelDef, n: number) {
  return level.kind === "undergraduate" ? `${n}ANO` : `${n}CL`;
}

/**
 * O que criar para a selecção feita. Não olha para a base: o servidor ignora o
 * que já existe (mesmo código), por isso aplicar duas vezes não duplica nada.
 */
export function planCurriculum(selection: TemplateSelection): CurriculumPlan {
  const plan: CurriculumPlan = {
    levels: [],
    programs: [],
    grades: [],
    subjects: [],
    curriculum: [],
    classGroups: [],
    rooms: [],
  };
  const subjectCodes = new Set<string>();
  const roomCodes = new Set<string>();
  const shifts = selection.shifts.length ? selection.shifts : (["morning"] as const);
  const groups = Math.min(Math.max(Math.round(selection.groupsPerGrade), 1), LETTERS.length);
  // Programas de níveis diferentes podem partilhar um código curto (ex.: ECO no
  // técnico e no superior): o código do programa leva o do nível à frente.
  const multiCourse = (level: LevelDef) => level.courses.length > 1;

  let maxGroupsPerShift = 0;
  for (const level of EDUCATION_LEVELS) {
    const chosen = level.courses.filter((c) => selection.courses[level.id]?.includes(c.code));
    if (!chosen.length) continue;
    plan.levels.push({ code: level.code, name: level.name, sequence: level.sequence });
    for (const room of level.specialRooms) {
      if (selection.createRooms && !roomCodes.has(room.code)) {
        roomCodes.add(room.code);
        plan.rooms.push({ ...room, capacity: null });
      }
    }

    for (const course of chosen) {
      const programCode = multiCourse(level) ? `${level.code}-${course.code}` : level.code;
      plan.programs.push({
        levelCode: level.code,
        code: programCode,
        name: course.name,
        kind: level.kind,
        higherEducation: level.kind === "undergraduate",
      });
      const perShiftForCourse = course.grades.length * groups;
      maxGroupsPerShift += perShiftForCourse;

      for (const n of course.grades) {
        const code = gradeCode(level, n);
        plan.grades.push({ programCode, code, name: level.gradeLabel(n), sequence: n });
        const codes = [...(course.subjects["*"] ?? []), ...(course.subjects[n] ?? [])];
        const unique = [...new Set(codes)];
        for (const s of unique) {
          if (!subjectCodes.has(s) && SUBJECTS[s]) {
            subjectCodes.add(s);
            plan.subjects.push(SUBJECTS[s]!);
          }
        }
        if (unique.length)
          plan.curriculum.push({ programCode, gradeCode: code, subjectCodes: unique });

        // «10ª A — Manhã»; com várias áreas/cursos o nome leva o curso: «10ª CFB A».
        const ordinal = level.kind === "undergraduate" ? `${n}º Ano` : `${n}ª`;
        const coursePart = multiCourse(level) ? ` ${course.code}` : "";
        for (const shift of shifts) {
          for (let g = 0; g < groups; g += 1) {
            const letter = LETTERS[g]!;
            // Código aceite por `class_groups_code_check` (^[A-Z0-9_-]{2,30}$):
            // «10A-M», «CFB10A-M», «DIR1A-M».
            const groupCode = `${multiCourse(level) ? course.code : ""}${n}${letter}-${
              SHIFT[shift].code
            }`;
            plan.classGroups.push({
              programCode,
              gradeCode: code,
              code: groupCode,
              name: `${ordinal}${coursePart} ${letter} — ${SHIFT[shift].label}`,
              shift,
              capacity: selection.capacity,
            });
          }
        }
      }
    }
  }

  // Salas de aula: as turmas do mesmo turno precisam de uma sala cada; turnos
  // diferentes partilham as mesmas salas.
  if (selection.createRooms && maxGroupsPerShift > 0) {
    for (let i = 1; i <= maxGroupsPerShift; i += 1) {
      const code = `S${String(i).padStart(2, "0")}`;
      if (roomCodes.has(code)) continue;
      roomCodes.add(code);
      plan.rooms.unshift({
        code,
        name: `Sala ${i}`,
        type: "standard",
        capacity: selection.capacity,
      });
    }
    plan.rooms.sort((a, b) => a.code.localeCompare(b.code, "pt", { numeric: true }));
  }

  return plan;
}

/** Resumo em números para mostrar antes de aplicar. */
export function summarizePlan(plan: CurriculumPlan) {
  return {
    niveis: plan.levels.length,
    cursos: plan.programs.length,
    classes: plan.grades.length,
    disciplinas: plan.subjects.length,
    turmas: plan.classGroups.length,
    salas: plan.rooms.length,
  };
}
