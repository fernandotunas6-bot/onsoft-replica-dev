import type { AcademicNavBranch } from "@/lib/academic-nav";
import { parseSubjectOfferingId, type ContextLookup } from "./context-resolver";

/**
 * Valida turmas e disciplinas contra a árvore académica autorizada, lida do
 * servidor para a escola activa. Um id que não está na árvore não existe para o
 * contexto, tal como já não cria destinos na árvore «Turmas e disciplinas».
 */
export function academicContextLookup(
  tree: readonly AcademicNavBranch[],
  schoolId: string | null,
): ContextLookup {
  const findClass = (id: string) => {
    for (const branch of tree) {
      const turma = branch.classes.find((item) => item.id === id);
      if (turma) return turma;
    }
    return null;
  };

  return (candidate) => {
    if (!schoolId) return null;
    if (candidate.type === "class") {
      const turma = findClass(candidate.id);
      return turma ? { type: "class", id: turma.id, label: turma.name, schoolId } : null;
    }
    if (candidate.type === "subject-offering") {
      const parsed = parseSubjectOfferingId(candidate.id);
      const turma = parsed ? findClass(parsed.classId) : null;
      const subject = turma?.subjects.find((item) => item.id === parsed?.subjectId);
      if (!turma || !subject) return null;
      return {
        type: "subject-offering",
        id: candidate.id,
        label: subject.name,
        schoolId,
        parent: { type: "class", id: turma.id },
      };
    }
    return null;
  };
}
