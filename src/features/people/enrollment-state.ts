/**
 * enrollment-state.ts
 *
 * Motor de domínio canónico para a pergunta «esta pessoa é aluno, e está
 * matriculada?».
 *
 * O SIGA Plus guarda a identidade e a matrícula em camadas distintas, e é essa
 * separação que torna a pergunta ambígua quando cada ecrã a responde à sua
 * maneira:
 *
 *   people        → identidade única da pessoa (nome, BI, contacto)
 *   person_roles  → vínculos institucionais declarados
 *   students      → a pessoa recebeu número de aluno nesta escola
 *   enrollments   → o aluno matriculou-se num ano lectivo e numa turma
 *
 * Uma pessoa pode existir sem nunca ser aluno (encarregado, funcionário,
 * contacto). Um aluno pode existir sem matrícula activa (admitido e ainda não
 * matriculado, transferido, concluído, anulado). São situações diferentes, com
 * consequências diferentes — sobretudo financeiras, porque a cobrança de
 * propinas depende da matrícula, não da identidade.
 *
 * Este módulo é a única fonte de verdade dessa derivação. `academic-status.ts`
 * continua responsável pelo estado académico detalhado do aluno; aqui responde-se
 * apenas, e sem ambiguidade, em que camada a pessoa se encontra.
 */

/** Camada em que a pessoa se encontra. Mutuamente exclusivas e ordenadas. */
export type PersonEnrollmentState = "pessoa" | "aluno_sem_matricula" | "aluno_matriculado";

/**
 * Porque é que um aluno não tem matrícula activa. Distinguir isto evita o erro
 * de tratar quem nunca se matriculou como quem já saiu da escola.
 */
export type PersonUnenrolledReason = "nunca_matriculado" | "matricula_encerrada";

export type PersonEnrollmentStatus = {
  state: PersonEnrollmentState;
  /** Presente apenas quando `state` é `aluno_sem_matricula`. */
  reason?: PersonUnenrolledReason;
};

export const PERSON_ENROLLMENT_STATE_LABELS: Record<PersonEnrollmentState, string> = {
  pessoa: "Pessoa",
  aluno_sem_matricula: "Aluno sem matrícula",
  aluno_matriculado: "Aluno matriculado",
};

export const PERSON_UNENROLLED_REASON_LABELS: Record<PersonUnenrolledReason, string> = {
  nunca_matriculado: "Admitido, ainda sem matrícula",
  matricula_encerrada: "Matrícula encerrada",
};

/**
 * Deriva a camada da pessoa a partir dos factos guardados.
 *
 * `hasLiveStudentRecord` tem de excluir registos de aluno eliminados
 * (`students.deleted_at`): um registo apagado não torna a pessoa aluna.
 */
export function derivePersonEnrollmentStatus(input: {
  hasLiveStudentRecord: boolean;
  totalEnrollments: number;
  hasActiveEnrollment: boolean;
}): PersonEnrollmentStatus {
  if (!input.hasLiveStudentRecord) return { state: "pessoa" };
  if (input.hasActiveEnrollment) return { state: "aluno_matriculado" };
  return {
    state: "aluno_sem_matricula",
    reason: input.totalEnrollments > 0 ? "matricula_encerrada" : "nunca_matriculado",
  };
}

/** Etiqueta curta para apresentar ao utilizador, com o motivo quando existe. */
export function personEnrollmentLabel(status: PersonEnrollmentStatus): string {
  const base = PERSON_ENROLLMENT_STATE_LABELS[status.state];
  if (status.state === "aluno_sem_matricula" && status.reason) {
    return `${base} · ${PERSON_UNENROLLED_REASON_LABELS[status.reason]}`;
  }
  return base;
}

/**
 * A cobrança de propinas pende da matrícula, não da identidade: sem matrícula
 * activa não há contrato financeiro do ano corrente para facturar.
 *
 * Não confundir com «não tem dívida»: um aluno com matrícula encerrada pode
 * manter facturas abertas de anos anteriores, que continuam a ser devidas e
 * visíveis no seu histórico financeiro.
 */
export function canBillTuition(status: PersonEnrollmentStatus): boolean {
  return status.state === "aluno_matriculado";
}
