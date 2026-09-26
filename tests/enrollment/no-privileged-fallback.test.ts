import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Quando register_student / enroll_student recusam (sem 2FA ou sem permissão),
 * o servidor recusa também. Antes repetia a escrita com a chave de serviço,
 * contornando a recusa, o encarregado e o controlo de capacidade da turma.
 */
describe("matrícula não contorna a recusa da base", () => {
  for (const file of ["src/features/enrollment/server.ts", "src/features/people/server.ts"]) {
    const source = readFileSync(file, "utf8");

    it(`${file}: não grava alunos nem matrículas directamente`, () => {
      expect(source).not.toMatch(/\.from\("students"\)\s*\.insert/);
      expect(source).not.toMatch(/\.from\("enrollments"\)\s*\.insert/);
    });

    it(`${file}: números de processo vêm da sequência da base`, () => {
      expect(source).not.toMatch(/Math\.random/);
    });
  }
});
