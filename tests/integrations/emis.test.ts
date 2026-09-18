import { describe, expect, it } from "vitest";
import { normalizeEmisGradeLevel, buildEmisExportPayload } from "@/features/integrations/emis";

describe("Integração EMIS", () => {
  describe("normalizeEmisGradeLevel", () => {
    it("mapeia classes corretamente a partir de strings difusas", () => {
      expect(normalizeEmisGradeLevel("1ª classe")).toBe("1ª Classe");
      expect(normalizeEmisGradeLevel("10a Classe")).toBe("10ª Classe");
      expect(normalizeEmisGradeLevel("décima segunda")).toBe("12ª Classe");
      expect(normalizeEmisGradeLevel("Iniciação A")).toBe("Iniciação");
      expect(normalizeEmisGradeLevel("")).toBe("Desconhecido");
      expect(normalizeEmisGradeLevel("Universidade")).toBe("Outro");
    });
  });

  describe("buildEmisExportPayload", () => {
    it("transforma uma lista de alunos num payload EMIS-ready", () => {
      const payload = buildEmisExportPayload("school-123", [
        {
          id: "student-1",
          registration_number: "2026-0001",
          full_name: "João Silva",
          sex: "male",
          date_of_birth: "2010-05-10",
          academic_year: "2026",
          class_name: "Turma A",
          grade_name: "7ª Classe",
          student_status: "active",
          primary_guardian_name: "Maria Silva",
          document_number: "000000000LA000",
          payment_status: "paid",
        },
      ]);

      expect(payload).toHaveLength(1);
      expect(payload[0].gender).toBe("M");
      expect(payload[0].emis_grade).toBe("7ª Classe");
      expect(payload[0].emis_school_id).toBe("school-123");
      expect(payload[0].national_id).toBe("000000000LA000");
    });
  });
});
