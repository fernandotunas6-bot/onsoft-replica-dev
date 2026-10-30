import type { AcademicNavBranch } from "@/lib/academic-nav";
import { parseSubjectOfferingId, type ContextLookup } from "./context-resolver";

/**
 * Lookup do resolvedor a partir das turmas e disciplinas que o servidor devolveu
 * à conta na escola activa (`useAcademicNavTree`). Uma turma ou disciplina que
 * não esteja lá — de outra escola, de outro professor, ou ainda a carregar — é
 * recusada, e o menu fica no nível acima. Os rótulos vêm destes dados, nunca da URL.
 */
export function academicContextLookup(
  tree: readonly AcademicNavBranch[],
  schoolId: string | null,
): ContextLookup {
  const classes = new Map(
    tree.flatMap((branch) => branch.classes).map((turma) => [turma.id, turma] as const),
  );
  return (candidate) => {
    if (!schoolId) return null;
    if (candidate.type === "class") {
      const turma = classes.get(candidate.id);
      return turma ? { type: "class", id: turma.id, label: turma.name, schoolId } : null;
    }
    if (candidate.type === "subject-offering") {
      const parsed = parseSubjectOfferingId(candidate.id);
      if (!parsed) return null;
      const turma = classes.get(parsed.classId);
      const subject = turma?.subjects.find((item) => item.id === parsed.subjectId);
      if (!turma || !subject) return null;
      return {
        type: "subject-offering",
        id: candidate.id,
        label: subject.name,
        schoolId,
        parent: { type: "class", id: turma.id },
        ...(subject.teacherId ? { relations: { teacher: subject.teacherId } } : {}),
      };
    }
    return null;
  };
}
