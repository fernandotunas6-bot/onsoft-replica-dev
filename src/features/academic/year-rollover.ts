/**
 * Preparar o próximo ano lectivo: para onde vai cada aluno de uma turma.
 *
 * O resultado final já é gravado no histórico (`recordClassFinalResults`), mas a
 * renovação fazia-se aluno a aluno. Estas regras decidem, sem tocar na base, a
 * turma de destino de cada aluno e o motivo de quem fica de fora; o servidor só
 * executa o plano que a secretaria confirmou.
 */

export type RolloverGroup = {
  id: string;
  name: string;
  shift?: string | null;
  academicYearId: string;
  gradeLevelId: string | null;
  capacity?: number | null;
  /** Matrículas correntes (pendentes ou activas) na turma. */
  enrolledCount?: number;
};

export type RolloverGradeLevel = {
  id: string;
  programId: string | null;
  sequence: number | null;
  name?: string;
};

export type FinalOutcome = "pass" | "fail" | null;

export type RolloverStudent = {
  studentId: string;
  name: string;
  /** Número visível do aluno, quando está disponível. */
  studentNumber?: string;
  studentStatus: string | null;
  /** Texto gravado no histórico («Transitou», «Não transitou», «Incompleto»…). */
  outcome: string | null;
  /** Turma do aluno no ano de destino, se já tiver matrícula corrente nele. */
  targetYearClassGroupId: string | null;
};

export type RolloverLine = {
  studentId: string;
  name: string;
  studentNumber?: string;
  outcome: FinalOutcome;
  action: "enroll" | "already" | "skip";
  targetClassGroupId: string | null;
  reason: string;
};

/** «Transitou» → pass; «Não transitou»/«Reprovado» → fail; o resto não decide. */
export function finalOutcome(text: string | null | undefined): FinalOutcome {
  const value = (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!value) return null;
  if (/\bnao\b|reprov|retid/.test(value)) return "fail";
  if (/transit|aprov|promov/.test(value)) return "pass";
  return null;
}

/** Estados que não renovam sozinhos: a secretaria decide caso a caso. */
const LEAVING: Record<string, string> = {
  graduated: "concluiu o curso",
  transferred: "foi transferido",
  inactive: "desistiu",
  withdrawn: "desistiu",
  cancelled: "tem a matrícula anulada",
  suspended: "está suspenso",
  locked: "tem a matrícula trancada",
};

/**
 * Classe seguinte (mesmo curso, sequência imediatamente acima) e se a classe da
 * turma é a última do curso. Sem curso ou sem sequência não se adivinha.
 */
export function nextGradeLevel(
  levels: readonly RolloverGradeLevel[],
  currentId: string | null,
): { next: RolloverGradeLevel | null; isLast: boolean; known: boolean } {
  const current = levels.find((level) => level.id === currentId);
  if (!current || current.sequence == null || !current.programId) {
    return { next: null, isLast: false, known: false };
  }
  const later = levels
    .filter(
      (level) =>
        level.programId === current.programId &&
        level.sequence != null &&
        level.sequence > current.sequence!,
    )
    .sort((a, b) => a.sequence! - b.sequence!);
  return { next: later[0] ?? null, isLast: later.length === 0, known: true };
}

/**
 * Turma sugerida no ano de destino para uma classe: a do mesmo nome (a 7.ª A
 * segue para a 8.ª A), senão a do mesmo turno, senão a primeira.
 */
export function suggestTargetGroup(
  source: RolloverGroup,
  candidates: readonly RolloverGroup[],
  gradeLevelId: string | null,
): RolloverGroup | null {
  if (!gradeLevelId) return null;
  const sameGrade = candidates.filter((group) => group.gradeLevelId === gradeLevelId);
  const letter = (name: string) => name.trim().split(/\s+/).at(-1)?.toUpperCase() ?? "";
  return (
    sameGrade.find((group) => letter(group.name) === letter(source.name)) ??
    sameGrade.find((group) => (group.shift ?? "") === (source.shift ?? "")) ??
    sameGrade[0] ??
    null
  );
}

export function planRenewal(input: {
  students: readonly RolloverStudent[];
  passTarget: RolloverGroup | null;
  repeatTarget: RolloverGroup | null;
  isLastGrade: boolean;
}): RolloverLine[] {
  const free = new Map<string, number>();
  for (const group of [input.passTarget, input.repeatTarget]) {
    if (!group || free.has(group.id)) continue;
    free.set(
      group.id,
      group.capacity && group.capacity > 0
        ? group.capacity - (group.enrolledCount ?? 0)
        : Number.POSITIVE_INFINITY,
    );
  }

  return [...input.students]
    .sort((a, b) => a.name.localeCompare(b.name, "pt"))
    .map((student): RolloverLine => {
      const outcome = finalOutcome(student.outcome);
      const line = (
        action: RolloverLine["action"],
        reason: string,
        targetClassGroupId: string | null = null,
      ): RolloverLine => ({
        studentId: student.studentId,
        name: student.name,
        ...(student.studentNumber ? { studentNumber: student.studentNumber } : {}),
        outcome,
        action,
        targetClassGroupId,
        reason,
      });

      const leaving = LEAVING[student.studentStatus ?? ""];
      if (leaving) return line("skip", `O aluno ${leaving}.`);
      if (!outcome) return line("skip", "Sem resultado final registado no histórico.");

      const target = outcome === "pass" ? input.passTarget : input.repeatTarget;
      if (outcome === "pass" && input.isLastGrade) {
        return line("skip", "Fim de ciclo: concluiu a última classe do curso.");
      }
      if (student.targetYearClassGroupId) {
        return student.targetYearClassGroupId === target?.id
          ? line("already", "Já está matriculado nesta turma.", target.id)
          : line("skip", "Já tem matrícula noutra turma do novo ano; não é mudado.");
      }
      if (!target) {
        return line(
          "skip",
          outcome === "pass"
            ? "Falta escolher a turma da classe seguinte."
            : "Não transitou: falta escolher a turma para repetir a classe.",
        );
      }
      const left = free.get(target.id) ?? 0;
      if (left <= 0) return line("skip", `A turma ${target.name} não tem vagas.`);
      free.set(target.id, left - 1);
      return line(
        "enroll",
        outcome === "pass" ? "Transitou." : "Não transitou: repete a classe.",
        target.id,
      );
    });
}

/** O ano seguinte provável: o primeiro cujo nome vem depois do ano da turma. */
export function nextYearGuess(
  years: readonly { id: string; name: string }[],
  currentName: string,
): string {
  const later = years
    .filter((year) => year.name.localeCompare(currentName, "pt", { numeric: true }) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pt", { numeric: true }));
  return later[0]?.id ?? "";
}
