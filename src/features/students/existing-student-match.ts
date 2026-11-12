/**
 * «Nova matrícula» de quem já é aluno da escola.
 *
 * A folha só verificava duplicados no fim dos cinco passos, e a resposta era
 * «cancele e use a ficha em Pessoas» — sem caminho para matricular essa pessoa.
 * Esta regra corre enquanto se escreve, sobre a lista de alunos que a página já
 * tem, para oferecer o aluno existente antes de se criar outro.
 */
export type ExistingStudentOption = {
  id: string;
  full_name: string;
  registration_number?: string | null;
  national_id?: string | null;
  phone?: string | null;
  student_status?: string | null;
  class_name?: string | null;
  grade_name?: string | null;
  academic_year?: string | null;
};

export type ExistingStudentMatch = {
  student: ExistingStudentOption;
  reason: "bi" | "telefone" | "nome";
};

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const identity = (value: string | null | undefined) =>
  (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Os 9 dígitos do número angolano, com ou sem o indicativo +244. */
const phoneKey = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "").slice(-9);

const rank: Record<ExistingStudentMatch["reason"], number> = { bi: 0, telefone: 1, nome: 2 };

export function matchExistingStudents(
  students: readonly ExistingStudentOption[],
  typed: { name?: string; nationalId?: string; phone?: string },
  limit = 5,
): ExistingStudentMatch[] {
  const bi = identity(typed.nationalId);
  const phone = phoneKey(typed.phone);
  // Duas palavras no mínimo: «Ana» sozinha apanhava meia escola.
  const words = fold(typed.name ?? "")
    .split(" ")
    .filter((word) => word.length >= 2);

  const matches: ExistingStudentMatch[] = [];
  for (const student of students) {
    if (bi.length >= 6 && identity(student.national_id) === bi) {
      matches.push({ student, reason: "bi" });
      continue;
    }
    if (phone.length === 9 && phoneKey(student.phone) === phone) {
      matches.push({ student, reason: "telefone" });
      continue;
    }
    if (words.length >= 2) {
      const own = fold(student.full_name).split(" ");
      if (words.every((word) => own.some((part) => part.startsWith(word)))) {
        matches.push({ student, reason: "nome" });
      }
    }
  }
  return matches
    .sort(
      (a, b) =>
        rank[a.reason] - rank[b.reason] ||
        a.student.full_name.localeCompare(b.student.full_name, "pt"),
    )
    .slice(0, limit);
}
