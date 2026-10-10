import { sqlApplyHint } from "@/lib/sql-doc-hint";

type DatabaseError = {
  code?: string | undefined;
  message?: string | undefined;
};

const publicMessages: Record<string, string> = {
  "23503": "O registo depende de dados que não existem ou já foram removidos.",
  "23505": "Já existe um registo com estes dados.",
  "23514": "Um ou mais valores não respeitam as regras do sistema.",
  "42501": "Não tem permissão para realizar esta operação.",
  "42P01": `Tabela em falta no SGA. ${sqlApplyHint("premium")}`,
  PGRST116: "O registo solicitado não foi encontrado.",
};

/**
 * Regras da base com mensagem própria: dizem o que corrigir, sem revelar a
 * estrutura. A chave é o nome da restrição, que vem na mensagem do Postgres.
 */
const constraintMessages: Record<string, string> = {
  people_school_email_uidx: "Já existe uma pessoa com este e-mail nesta escola.",
  people_school_national_id_uidx: "Já existe uma pessoa com este BI nesta escola.",
  people_one_active_login_per_school: "Esta conta já está ligada a outra pessoa nesta escola.",
  people_phone_check:
    "Telefone inválido. Use só dígitos, espaços ou hífen (ex.: +244 923 000 000).",
  people_email_check: "E-mail inválido.",
  people_full_name_check: "O nome deve ter entre 2 e 200 caracteres.",
  people_date_of_birth_check: "A data de nascimento não pode ser no futuro.",
  people_national_id_check: "O BI deve ter entre 3 e 40 caracteres.",
  students_school_id_person_id_key: "Esta pessoa já está registada como aluno.",
  students_school_id_student_number_key: "Já existe um aluno com este número.",
  teachers_school_id_person_id_key: "Esta pessoa já está registada como professor.",
  teachers_one_login_per_school: "Esta conta já está ligada a outro professor nesta escola.",
  enrollments_one_current_per_year_uidx: "O aluno já tem uma matrícula activa neste ano lectivo.",
  class_groups_school_id_academic_year_id_code_key:
    "Já existe uma turma com este código neste ano.",
  class_groups_code_check:
    "O código da turma usa só maiúsculas, dígitos, hífen ou sublinhado (2 a 30).",
  class_groups_capacity_check: "A lotação da turma deve ser entre 1 e 500.",
  subjects_school_id_code_key: "Já existe uma disciplina com este código.",
  subjects_code_check:
    "O código da disciplina usa só maiúsculas, dígitos, hífen ou sublinhado (2 a 20).",
  academic_years_school_id_name_key: "Já existe um ano lectivo com este nome.",
  academic_years_check: "O fim do ano lectivo tem de ser depois do início.",
  terms_check: "O fim do período tem de ser depois do início.",
  terms_school_id_academic_year_id_sequence_key: "Este período já existe neste ano lectivo.",
  rooms_school_code_key: "Já existe uma sala com este código.",
  student_guardians_one_primary_uidx: "O aluno já tem um encarregado principal.",
  student_guardians_check1: "O aluno não pode ser o seu próprio encarregado.",
};

/**
 * Mensagens de regras de negócio levantadas pela própria base (RAISE nos gatilhos e
 * funções), escritas para o utilizador: passam tal como estão. Sem esta lista, a da
 * lotação chegava ao ecrã como «Um ou mais valores não respeitam as regras».
 */
const businessMessages = new Set([
  "A turma atingiu a capacidade configurada.",
  "A turma nova tem de ser da mesma escola e do mesmo ano lectivo da matrícula.",
  "Turma ativa inválida para esta escola.",
  "Identidade da matrícula é imutável.",
  // register_student / enroll_student
  "Estudante, ano letivo ou data de matrícula inválida.",
  "Pessoa ou data de admissão inválida.",
  "Encarregado inválido para esta escola.",
]);

function constraintMessage(message: string | undefined): string | null {
  const name = /constraint "([a-z0-9_]+)"/i.exec(message ?? "")?.[1];
  return (name && constraintMessages[name]) || null;
}

/** Tabela ainda por criar nesta base (migração por aplicar): quem lê trata-a como vazia. */
export function isMissingTable(error: DatabaseError | null | undefined): boolean {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /schema cache|does not exist|relation .* does not exist/i.test(error.message ?? "")),
  );
}

/**
 * A base recusou por falta de 2FA (`private.is_aal2`) ou de permissão: as funções
 * SECURITY DEFINER levantam 42501 «Sem autorização…». Uma só regra para o
 * servidor traduzir a recusa em «active o 2FA» (havia seis cópias, com
 * expressões diferentes).
 */
export function isRpcAuthDenied(error: DatabaseError | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42501" ||
    /is_aal2|autoriza[çc][ãa]o|permission denied/i.test(error.message ?? "")
  );
}

/** Prevent database structure and raw SQL details from reaching browser clients. */
export function publicDatabaseError(error: DatabaseError, fallback: string): Error {
  // A mensagem devolvida ao browser é deliberadamente vaga; sem este registo
  // no servidor um 23502/23503 fica invisível para quem depura.
  if (typeof window === "undefined") {
    console.error("[db] %s %s", error.code ?? "(sem código)", error.message ?? fallback);
  }
  const missingTable =
    error.code === "42P01" ||
    /schema cache|does not exist|relation .* does not exist/i.test(String(error.message ?? ""));
  if (missingTable) {
    return new Error(publicMessages["42P01"] ?? fallback);
  }
  const raised = String(error.message ?? "").trim();
  if (businessMessages.has(raised)) return new Error(raised);
  if (error.code === "23505" || error.code === "23514") {
    const specific = constraintMessage(error.message);
    if (specific) return new Error(specific);
  }
  return new Error((error.code && publicMessages[error.code]) || fallback);
}
