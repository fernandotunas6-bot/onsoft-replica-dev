import { describe, expect, it } from "vitest";
import { buildSchoolAlert } from "@/features/dashboard/alerts";

describe("avisos da escola", () => {
  it("não cria aviso sem quantidade", () => {
    expect(buildSchoolAlert("documentos", 0)).toBeNull();
    expect(buildSchoolAlert("faturas", -1)).toBeNull();
  });

  it("usa o singular e o plural em português", () => {
    expect(buildSchoolAlert("matricula", 1)?.title).toBe("1 aluno à espera de turma");
    expect(buildSchoolAlert("matricula", 3)?.title).toBe("3 alunos à espera de turma");
    expect(buildSchoolAlert("candidaturas", 2)?.settingsPanel).toBe("matricula");
    expect(buildSchoolAlert("documentos", 1)?.href).toBe("/documentos");
    expect(buildSchoolAlert("faturas", 4)?.href).toBe("/faturas");
  });
});
