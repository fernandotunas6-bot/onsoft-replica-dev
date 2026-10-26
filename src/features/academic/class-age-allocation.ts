/**
 * Plano de organização de turmas por idade — SIMULAÇÃO SEM ESCRITAS.
 *
 * Regra configurável: dentro da mesma escola, ano, classe, curso e turno,
 * os mais novos vão primeiro para A, depois B, C ...; empates são estáveis.
 *
 * A autorização, as matrículas válidas, a lotação regulamentar e os alunos
 * protegidos são responsabilidade do servidor. Nunca usar este resultado
 * directamente para escrever em tabelas sem revalidar no servidor e na BD.
 */
export type ClassAllocationScope = {
  schoolId: string;
  academicYearId: string;
  gradeLevelId: string;
  programId: string | null;
  shift: string;
};

export type ClassAllocationStudent = ClassAllocationScope & {
  studentId: string;
  studentNumber: string;
  birthDate: string | null;
  currentClassGroupId?: string | null;
  /** Colocação manual protegida por decisão pedagógica/administrativa. */
  protectedPlacement?: boolean;
};

export type ClassAllocationGroup = ClassAllocationScope & {
  id: string;
  /** A, B, ... Z, AA, AB... (sem derivar a letra do nome livre da turma). */
  letter: string;
  capacity: number;
  /** Vagas usadas por matrículas fora da simulação. Calculadas no servidor. */
  reservedSeats: number;
  status: "draft" | "active" | "closed";
};

export type ClassAllocationExclusionReason =
  | "different_scope"
  | "invalid_birth_date"
  | "duplicate_student"
  | "protected_placement"
  | "already_assigned"
  | "no_capacity";

export type ClassAllocationResult = {
  assignments: Array<{
    studentId: string;
    studentNumber: string;
    classGroupId: string;
    letter: string;
  }>;
  excluded: Array<{ studentId: string; reason: ClassAllocationExclusionReason }>;
  warnings: string[];
  /**
   * Só é true na reorganização integral, sem alunos excluídos ou configuração
   * ambígua. É indicador de pré-visualização, NÃO autorização para publicar.
   */
  ageOrderComplete: boolean;
};

const sameScope = (left: ClassAllocationScope, right: ClassAllocationScope) =>
  left.schoolId === right.schoolId &&
  left.academicYearId === right.academicYearId &&
  left.gradeLevelId === right.gradeLevelId &&
  left.programId === right.programId &&
  left.shift === right.shift;

function validIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Ordenação alfabética inequívoca: Z precede AA, e 10.ª A não mistura cursos. */
function letterOrder(value: string): number | null {
  if (!/^[A-Z]+$/.test(value)) return null;
  let rank = 0;
  for (const char of value) rank = rank * 26 + char.charCodeAt(0) - 64;
  return Number.isSafeInteger(rank) ? rank : null;
}

export function planClassAllocationByAge(input: {
  scope: ClassAllocationScope;
  referenceDate: string;
  mode: "vacancies" | "reorganize";
  students: readonly ClassAllocationStudent[];
  groups: readonly ClassAllocationGroup[];
}): ClassAllocationResult {
  if (!validIsoDate(input.referenceDate)) throw new Error("Data de referência inválida.");

  const assignments: ClassAllocationResult["assignments"] = [];
  const excluded: ClassAllocationResult["excluded"] = [];
  const warnings: string[] = [];
  const relevant = input.groups.filter((group) => sameScope(group, input.scope));
  const groups = relevant
    .filter((group) => group.status !== "closed")
    .map((group) => ({ ...group, letter: group.letter.trim().toUpperCase() }))
    .sort((a, b) => (letterOrder(a.letter) ?? Infinity) - (letterOrder(b.letter) ?? Infinity));

  const letters = new Set<string>();
  const groupIds = new Set<string>();
  for (const group of groups) {
    if (
      letterOrder(group.letter) == null ||
      letters.has(group.letter) ||
      groupIds.has(group.id) ||
      !Number.isSafeInteger(group.capacity) ||
      group.capacity < 0 ||
      !Number.isSafeInteger(group.reservedSeats) ||
      group.reservedSeats < 0 ||
      group.reservedSeats > group.capacity
    ) {
      warnings.push("Turmas com letras repetidas, lotações ou reservas inválidas; corrija antes de organizar.");
      break;
    }
    letters.add(group.letter);
    groupIds.add(group.id);
  }
  if (!groups.length) warnings.push("Não há turmas válidas para esta classe, curso, turno e ano.");
  if (warnings.length) {
    return {
      assignments,
      excluded: input.students.map((student) => ({
        studentId: student.studentId,
        reason: "no_capacity",
      })),
      warnings,
      ageOrderComplete: false,
    };
  }

  const eligible: ClassAllocationStudent[] = [];
  const seen = new Set<string>();
  for (const student of input.students) {
    const exclude = (reason: ClassAllocationExclusionReason) =>
      excluded.push({ studentId: student.studentId, reason });
    if (!sameScope(student, input.scope)) {
      exclude("different_scope");
    } else if (seen.has(student.studentId)) {
      exclude("duplicate_student");
    } else {
      seen.add(student.studentId);
      if (student.protectedPlacement) exclude("protected_placement");
      else if (input.mode === "vacancies" && student.currentClassGroupId) {
        exclude("already_assigned");
      } else if (!validIsoDate(student.birthDate) || student.birthDate > input.referenceDate) {
        exclude("invalid_birth_date");
      } else eligible.push(student);
    }
  }

  // Data maior = nascimento mais recente = menor idade. Empate: ID escolar e UUID.
  eligible.sort(
    (a, b) =>
      b.birthDate!.localeCompare(a.birthDate!) ||
      a.studentNumber.localeCompare(b.studentNumber, "pt", { numeric: true }) ||
      a.studentId.localeCompare(b.studentId),
  );

  let index = 0;
  for (const group of groups) {
    const free = group.capacity - group.reservedSeats;
    for (let slot = 0; slot < free && index < eligible.length; slot += 1) {
      const student = eligible[index++]!;
      assignments.push({
        studentId: student.studentId,
        studentNumber: student.studentNumber,
        classGroupId: group.id,
        letter: group.letter,
      });
    }
  }
  for (; index < eligible.length; index += 1) {
    excluded.push({ studentId: eligible[index]!.studentId, reason: "no_capacity" });
  }

  if (excluded.some((item) => item.reason === "invalid_birth_date")) {
    warnings.push("Há alunos sem data de nascimento válida; exigir verificação documental.");
  }
  if (excluded.some((item) => item.reason === "protected_placement")) {
    warnings.push("Existem colocações manuais protegidas; validar o critério de idade com a Direcção.");
  }
  if (excluded.some((item) => item.reason === "no_capacity")) {
    warnings.push("A capacidade das turmas é insuficiente para os alunos elegíveis.");
  }
  if (excluded.some((item) => item.reason === "duplicate_student")) {
    warnings.push("Há IDs de alunos duplicados na simulação.");
  }
  if (input.mode === "vacancies" && excluded.some((item) => item.reason === "already_assigned")) {
    warnings.push("Preenchimento de vagas: a ordem global por idade requer rever as colocações existentes.");
  }
  return {
    assignments,
    excluded,
    warnings,
    ageOrderComplete: input.mode === "reorganize" && excluded.length === 0 && warnings.length === 0,
  };
}
