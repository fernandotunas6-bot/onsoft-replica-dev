import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  enrollmentEndReason,
  enrollmentStatusForStudentStatus,
} from "@/features/students/enrollment-sync";

/** Auditoria 13, A4: o estado do aluno e a matrícula corrente andam juntos. */
describe("estado do aluno → matrícula corrente", () => {
  it("transferido, concluído e inactivo fecham a matrícula", () => {
    expect(enrollmentStatusForStudentStatus("transferred")).toBe("transferred");
    expect(enrollmentStatusForStudentStatus("graduated")).toBe("completed");
    expect(enrollmentStatusForStudentStatus("inactive")).toBe("cancelled");
    expect(enrollmentStatusForStudentStatus("cancelled")).toBe("cancelled");
  });

  it("estados temporários ou activos não mexem na matrícula", () => {
    for (const status of ["active", "suspended", "locked", "applicant"]) {
      expect(enrollmentStatusForStudentStatus(status)).toBeNull();
    }
  });

  it("o motivo respeita os 3–300 caracteres de end_reason", () => {
    expect(enrollmentEndReason("transferred", undefined)).toBe("Aluno transferido");
    expect(enrollmentEndReason("cancelled", " ok ")).toBe("Aluno inactivo");
    expect(enrollmentEndReason("completed", "Concluiu a 12ª classe")).toBe("Concluiu a 12ª classe");
    expect(enrollmentEndReason("cancelled", "x".repeat(400))).toHaveLength(300);
  });
});

describe("as funções de alunos aplicam a regra", () => {
  const source = readFileSync("src/features/students/server.ts", "utf8");
  const body = (name: string) => {
    const start = source.indexOf(`export const ${name}`);
    return source.slice(start, source.indexOf("export const", start + 1));
  };

  it("mudar o estado (um e em lote) fecha a matrícula corrente", () => {
    for (const name of ["changeStudentStatus", "batchUpdateStudentStatus"]) {
      expect(body(name)).toContain("closeCurrentEnrollmentsForStatus(db");
    }
  });

  it("anular a última matrícula corrente deixa o aluno inactivo, com histórico", () => {
    const cancel = body("cancelEnrollment");
    expect(cancel).toContain("hasCurrentEnrollment(db");
    expect(cancel).toContain('status: "inactive"');
    expect(cancel).toContain('.eq("status", "active")');
    expect(cancel).toContain("recordStudentStatusHistory(db");
  });
});
