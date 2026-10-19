/**
 * Estrutura da escola a partir do catálogo nacional (camada 2 → camada 3).
 *
 * Gera o mesmo `CurriculumPlan` que os modelos angolanos
 * (academic/curriculum-templates.ts), por isso é gravado pelo mesmo
 * `applyCurriculumPlan` — idempotente, não mexe no que a escola já tem.
 *
 * A escola escolhe as etapas e, onde as há, os cursos. Cada etapa vira um
 * nível; cada curso (ou a etapa inteira, quando não tem cursos) um programa;
 * cada classe/ano uma `grade_level`; o plano curricular, quando o catálogo o
 * tem, as disciplinas e o currículo. Etapa sem plano carregado (Moçambique)
 * cria níveis, classes e turmas, sem disciplinas — e o resumo diz isso.
 *
 * Só leva as disciplinas obrigatórias do plano; as de opção são escolha da
 * escola e acrescentam-se depois.
 */
import type { CurriculumPlan, TemplateSelection } from "@/features/academic/curriculum-templates";
import { globalCourse } from "./data/courses";
import { gradeLabel, stage as findStage, stagesFor, type EducationStage } from "./data/stages";
import { globalSubject, subjectDisplayName } from "./data/subjects";

export type CatalogPlanSelection = Omit<TemplateSelection, "courses"> & {
  country: string;
  /** Etapas escolhidas → cursos escolhidos (vazio numa etapa sem cursos). */
  stages: Record<string, string[]>;
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHIFT: Record<TemplateSelection["shifts"][number], { code: string; label: string }> = {
  morning: { code: "M", label: "Manhã" },
  afternoon: { code: "T", label: "Tarde" },
  evening: { code: "N", label: "Noite" },
};

const PROGRAM_KIND: Record<EducationStage["track"], CurriculumPlan["programs"][number]["kind"]> = {
  general: "general",
  technical: "technical",
  higher: "undergraduate",
};

/** Etapas que dão estrutura: as que têm classes/anos no catálogo. */
export function plannableStages(country: string) {
  return stagesFor(country).filter((s) => s.grades.length > 0);
}

/** «PT-SEC» + «SEC-CT» → «PT-SEC-CT». */
function programCode(st: EducationStage, course: string | null) {
  return course ? `${st.id}-${course.split("-").slice(1).join("-")}` : st.id;
}

/** Código da classe: «7ANO», «10CL», «INIC». */
function gradeCode(st: EducationStage, n: number) {
  if (n === 0) return "INIC";
  return st.gradeUnit === "ano" ? `${n}ANO` : `${n}CL`;
}

function shortGrade(st: EducationStage, n: number) {
  if (n === 0) return "Inic.";
  if (st.gradeUnit === "classe") return `${n}ª`;
  return st.country === "PT" ? `${n}.º` : `${n}º Ano`;
}

export function planFromCatalog(selection: CatalogPlanSelection): CurriculumPlan {
  const plan: CurriculumPlan = {
    levels: [],
    programs: [],
    grades: [],
    subjects: [],
    curriculum: [],
    classGroups: [],
    rooms: [],
  };
  const country = selection.country.toUpperCase();
  const shifts = selection.shifts.length ? selection.shifts : (["morning"] as const);
  const groups = Math.min(Math.max(Math.round(selection.groupsPerGrade), 1), LETTERS.length);
  const subjectCodes = new Set<string>();
  let maxGroupsPerShift = 0;

  const chosen = plannableStages(country).filter((s) => s.id in selection.stages);
  chosen.forEach((st, index) => {
    const courses = st.courses.length
      ? st.courses.filter((c) => selection.stages[st.id]?.includes(c))
      : [null];
    if (!courses.length) return;
    plan.levels.push({
      code: st.id,
      name: st.cycle ? `${st.name} — ${st.cycle}` : st.name,
      sequence: index + 1,
    });

    for (const course of courses) {
      const code = programCode(st, course);
      const courseName = course ? (globalCourse(course)?.name ?? course) : null;
      plan.programs.push({
        levelCode: st.id,
        code,
        name: courseName ?? (st.cycle ? `${st.name} — ${st.cycle}` : st.name),
        kind: PROGRAM_KIND[st.track],
        higherEducation: st.track === "higher",
      });
      maxGroupsPerShift += st.grades.length * groups;

      for (const n of st.grades) {
        const gCode = gradeCode(st, n);
        const shortCourse = course ? (globalCourse(course)?.short ?? course) : null;
        plan.grades.push({
          programCode: code,
          code: gCode,
          name: shortCourse ? `${gradeLabel(st, n)} · ${shortCourse}` : gradeLabel(st, n),
          sequence: Math.max(n, 1),
        });

        // Só as obrigatórias das entradas deste curso (ou da etapa) e classe.
        const codes = [
          ...new Set(
            st.curriculum
              .filter((e) => (e.course == null || e.course === course) && e.grades.includes(n))
              .flatMap((e) => e.core),
          ),
        ];
        for (const s of codes) {
          const def = globalSubject(s);
          if (!def || subjectCodes.has(s)) continue;
          subjectCodes.add(s);
          plan.subjects.push({ code: s, name: subjectDisplayName(def, country), short: def.short });
        }
        if (codes.length)
          plan.curriculum.push({ programCode: code, gradeCode: gCode, subjectCodes: codes });

        const coursePart = shortCourse ? ` ${shortCourse}` : "";
        // Prefixo do código da turma. Secundário: «CT10A-M». Superior: o código
        // todo do curso, porque o mesmo nome existe em graus diferentes
        // («LICGEST1A-M», «MESGEST1A-M»); sem cursos, o da etapa, para os anos
        // 1–4 não colidirem com o primário («ES1A-M»).
        const higher = st.track === "higher";
        const courseCodePart = course
          ? higher
            ? course.replace(/-/g, "")
            : course.split("-").slice(1).join("")
          : higher
            ? st.id.split("-").slice(1).join("")
            : "";
        for (const shift of shifts) {
          for (let g = 0; g < groups; g += 1) {
            const letter = LETTERS[g]!;
            plan.classGroups.push({
              programCode: code,
              gradeCode: gCode,
              // Aceite por class_groups_code_check (^[A-Z0-9_-]{2,30}$): «7A-M», «CT10A-M», «INICA-M».
              code: `${courseCodePart}${n === 0 ? "INIC" : n}${letter}-${SHIFT[shift].code}`,
              name: `${shortGrade(st, n)}${coursePart} ${letter} — ${SHIFT[shift].label}`,
              shift,
              capacity: selection.capacity,
            });
          }
        }
      }
    }
  });

  if (selection.createRooms && maxGroupsPerShift > 0) {
    for (let i = 1; i <= maxGroupsPerShift; i += 1) {
      plan.rooms.push({
        code: `S${String(i).padStart(2, "0")}`,
        name: `Sala ${i}`,
        type: "standard",
        capacity: selection.capacity,
      });
    }
  }
  return plan;
}

/** Etapas escolhidas sem plano curricular no catálogo (só estrutura, sem disciplinas). */
export function stagesWithoutPlan(selection: CatalogPlanSelection) {
  return Object.keys(selection.stages)
    .map((id) => findStage(id))
    .filter((s): s is EducationStage => Boolean(s) && s!.curriculum.length === 0);
}
