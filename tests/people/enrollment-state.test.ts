import { describe, expect, it } from "vitest";
import {
  canBillTuition,
  derivePersonEnrollmentStatus,
  personEnrollmentLabel,
  PERSON_ENROLLMENT_STATE_LABELS,
} from "@/features/people/enrollment-state";

/**
 * O motor canónico que separa identidade de matrícula.
 *
 * O que estes testes protegem é a distinção que antes cada ecrã inferia à sua
 * maneira: quem nunca é aluno, quem é aluno e ainda não se matriculou, e quem
 * é aluno e já saiu. Tratar os dois últimos como o mesmo caso é o erro que
 * levava a apresentar um aluno transferido como candidato à primeira matrícula.
 */

describe("derivePersonEnrollmentStatus", () => {
  it("uma pessoa sem registo de aluno é apenas pessoa", () => {
    const status = derivePersonEnrollmentStatus({
      hasLiveStudentRecord: false,
      totalEnrollments: 0,
      hasActiveEnrollment: false,
    });
    expect(status).toEqual({ state: "pessoa" });
  });

  it("um registo de aluno eliminado não torna a pessoa aluna", () => {
    // O chamador é responsável por excluir students.deleted_at; este teste fixa
    // a consequência — sem registo vivo, a pessoa não é aluna, mesmo que o
    // histórico de matrículas ainda exista na base.
    const status = derivePersonEnrollmentStatus({
      hasLiveStudentRecord: false,
      totalEnrollments: 3,
      hasActiveEnrollment: false,
    });
    expect(status.state).toBe("pessoa");
    expect(status.reason).toBeUndefined();
  });

  it("um aluno com matrícula activa está matriculado", () => {
    const status = derivePersonEnrollmentStatus({
      hasLiveStudentRecord: true,
      totalEnrollments: 2,
      hasActiveEnrollment: true,
    });
    expect(status).toEqual({ state: "aluno_matriculado" });
  });

  it("um aluno que nunca se matriculou distingue-se de um que já saiu", () => {
    const novo = derivePersonEnrollmentStatus({
      hasLiveStudentRecord: true,
      totalEnrollments: 0,
      hasActiveEnrollment: false,
    });
    const antigo = derivePersonEnrollmentStatus({
      hasLiveStudentRecord: true,
      totalEnrollments: 4,
      hasActiveEnrollment: false,
    });

    expect(novo).toEqual({ state: "aluno_sem_matricula", reason: "nunca_matriculado" });
    expect(antigo).toEqual({ state: "aluno_sem_matricula", reason: "matricula_encerrada" });
    expect(novo.reason).not.toBe(antigo.reason);
  });

  it("a matrícula activa tem precedência sobre o histórico", () => {
    // Um aluno que saiu e voltou a matricular-se está matriculado, sem motivo
    // de não-matrícula pendurado no estado.
    const status = derivePersonEnrollmentStatus({
      hasLiveStudentRecord: true,
      totalEnrollments: 5,
      hasActiveEnrollment: true,
    });
    expect(status.state).toBe("aluno_matriculado");
    expect(status.reason).toBeUndefined();
  });
});

describe("personEnrollmentLabel", () => {
  it("acrescenta o motivo apenas quando o aluno não tem matrícula", () => {
    expect(personEnrollmentLabel({ state: "pessoa" })).toBe("Pessoa");
    expect(personEnrollmentLabel({ state: "aluno_matriculado" })).toBe("Aluno matriculado");
    expect(
      personEnrollmentLabel({ state: "aluno_sem_matricula", reason: "matricula_encerrada" }),
    ).toBe("Aluno sem matrícula · Matrícula encerrada");
    expect(
      personEnrollmentLabel({ state: "aluno_sem_matricula", reason: "nunca_matriculado" }),
    ).toBe("Aluno sem matrícula · Admitido, ainda sem matrícula");
  });

  it("não deixa nenhum estado sem etiqueta", () => {
    for (const state of Object.keys(PERSON_ENROLLMENT_STATE_LABELS)) {
      expect(PERSON_ENROLLMENT_STATE_LABELS[state as never]).toBeTruthy();
    }
  });
});

describe("canBillTuition", () => {
  it("só a matrícula activa autoriza cobrança de propina do ano corrente", () => {
    expect(canBillTuition({ state: "aluno_matriculado" })).toBe(true);
    expect(canBillTuition({ state: "pessoa" })).toBe(false);
    expect(canBillTuition({ state: "aluno_sem_matricula", reason: "nunca_matriculado" })).toBe(
      false,
    );
    expect(canBillTuition({ state: "aluno_sem_matricula", reason: "matricula_encerrada" })).toBe(
      false,
    );
  });
});
