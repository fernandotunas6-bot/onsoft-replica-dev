import { describe, it, expect } from "vitest";
import { IMPORTER_REGISTRY, getImporter } from "@/features/import/engine/registry";
import { importModuleOptions, IMPLEMENTED_IMPORT_MODULES } from "@/features/import/schemas";
import { inscricoesImporter } from "@/features/import/importers/inscricoes-importer";
import { avaliacoesImporter } from "@/features/import/importers/avaliacoes-importer";
import { historicoAcademicoImporter } from "@/features/import/importers/historico-academico-importer";
import { historicoFinanceiroImporter } from "@/features/import/importers/historico-financeiro-importer";

describe("All 22 Importers Completeness & Coverage", () => {
  it("contém exatamente todos os 22 módulos registados no IMPORTER_REGISTRY", () => {
    expect(importModuleOptions).toHaveLength(22);
    expect(IMPLEMENTED_IMPORT_MODULES).toHaveLength(22);

    for (const mod of importModuleOptions) {
      const importer = getImporter(mod);
      expect(importer).toBeDefined();
      expect(importer.module).toBe(mod);
      expect(typeof importer.loadRefCache).toBe("function");
      expect(typeof importer.analyzeRow).toBe("function");
      expect(typeof importer.commitRow).toBe("function");
    }
  });

  describe("inscricoesImporter", () => {
    it("exige nome do candidato", () => {
      const cache = { existingApplicantNumbers: new Set() };
      const res = inscricoesImporter.analyzeRow({}, cache as any);
      expect(res.status).toBe("error");
      expect(res.errors).toContain("Nome completo do candidato é obrigatório.");
    });

    it("valida candidato correcto", () => {
      const cache = { existingApplicantNumbers: new Set(), formId: "form-1" };
      const res = inscricoesImporter.analyzeRow(
        { full_name: "Benedito Calei", application_number: "CAND-001" },
        cache as any,
      );
      expect(res.status).toBe("valid");
    });

    // `enrollment_applications.form_id` é NOT NULL: sem formulário de matrícula a
    // base recusava todas as candidaturas importadas.
    it("sem formulário de matrícula a linha fica em erro, com a explicação", () => {
      const cache = { existingApplicantNumbers: new Set(), formId: null };
      const res = inscricoesImporter.analyzeRow(
        { full_name: "Benedito Calei", application_number: "CAND-001" },
        cache as any,
      );
      expect(res.status).toBe("error");
      expect(res.errors.join(" ")).toContain("formulário de matrícula");
    });
  });

  describe("avaliacoesImporter", () => {
    // Uma avaliação pertence ao diário (`gradebooks`) de uma turma+disciplina+período.
    // Até 2026-09-16 o importador usava `gradebooks[0]` — um diário qualquer da escola.
    const cacheComDiario = {
      subjects: [{ id: "sub1", code: "MAT", name: "Matemática" }],
      classGroupRefs: [{ id: "g1", code: "10A", name: "10ª Classe A" }],
      classSubjects: [{ id: "cs1", class_group_id: "g1", subject_id: "sub1", teacher_id: null }],
      terms: [{ id: "t1", sequence: 1 }],
      gradebooks: [{ id: "gb1", class_subject_id: "cs1", term_id: "t1" }],
      existingItemCodes: new Set<string>(),
    };

    it("valida obrigatoriedade de nome e código", () => {
      const res = avaliacoesImporter.analyzeRow({}, cacheComDiario as any);
      expect(res.status).toBe("error");
      expect(res.errors).toContain("Designação ou nome da avaliação é obrigatório.");
      expect(res.errors).toContain(
        "Código ou sigla da avaliação é obrigatório (ex: MAC, NPP, NPT, P1).",
      );
    });

    it("valida avaliação correcta", () => {
      const res = avaliacoesImporter.analyzeRow(
        {
          assessment_name: "Prova do 1º Trimestre",
          code: "P1",
          max_score: 20,
          class_group: "10A",
          subject: "MAT",
          term: "1º Trimestre",
        },
        cacheComDiario as any,
      );
      expect(res.status).toBe("valid");
    });

    it("recusa quando o diário da turma/disciplina/período não existe", () => {
      const res = avaliacoesImporter.analyzeRow(
        {
          assessment_name: "Prova do 3º Trimestre",
          code: "P3",
          max_score: 20,
          class_group: "10A",
          subject: "MAT",
          term: "3º Trimestre",
        },
        cacheComDiario as any,
      );
      expect(res.status).toBe("error");
      expect(res.errors[0]).toMatch(/3º período não está configurado/);
    });

    it("recusa um código que viola o CHECK da base", () => {
      const res = avaliacoesImporter.analyzeRow(
        {
          assessment_name: "Prova",
          code: "P 1!",
          max_score: 20,
          class_group: "10A",
          subject: "MAT",
          term: "1º Trimestre",
        },
        cacheComDiario as any,
      );
      expect(res.status).toBe("error");
      expect(res.errors[0]).toMatch(/inválido/);
    });
  });

  describe("historicoAcademicoImporter", () => {
    it("valida dados escolares históricos", () => {
      const cache = {
        students: [
          {
            id: "s1",
            student_number: "PROC-1",
            national_id: "0012LA",
            status: "active",
            person_id: "p1",
          },
        ],
        existingKeys: new Map(),
      };
      const res = historicoAcademicoImporter.analyzeRow(
        { student_identifier: "PROC-1", academic_year: "2023/2024", grade_level: "8ª Classe" },
        cache as any,
      );
      expect(res.status).toBe("valid");
    });

    it("avisa quando o histórico já existe (idempotência)", () => {
      const cache = {
        students: [
          {
            id: "s1",
            student_number: "PROC-1",
            national_id: "0012LA",
            status: "active",
            person_id: "p1",
          },
        ],
        existingKeys: new Map([["s1::2023/2024::8ª Classe", "8ª Classe"]]),
      };
      // A mesma classe escrita de outra forma também é o mesmo histórico.
      for (const grade of ["8ª Classe", "8a classe", "oitava classe"]) {
        const res = historicoAcademicoImporter.analyzeRow(
          { student_identifier: "PROC-1", academic_year: "2023/2024", grade_level: grade },
          cache as any,
        );
        expect(res.status, grade).toBe("warning");
        expect(res.warnings[0]).toMatch(/já existe/i);
      }
      const other = historicoAcademicoImporter.analyzeRow(
        { student_identifier: "PROC-1", academic_year: "2023/2024", grade_level: "8º Ano" },
        cache as any,
      );
      expect(other.status).toBe("valid");
    });
  });

  describe("historicoFinanceiroImporter", () => {
    it("valida valor financeiro e aluno", () => {
      const cache = {
        students: [
          {
            id: "s1",
            student_number: "PROC-1",
            national_id: "0012LA",
            status: "active",
            person_id: "p1",
          },
        ],
        academicYears: [
          { id: "ay1", name: "2023/2024", starts_on: "2023-09-01", ends_on: "2024-07-15" },
        ],
        enrollments: [{ id: "e1", student_id: "s1", academic_year_id: "ay1", status: "completed" }],
        feePlans: [{ id: "fp1", academic_year_id: "ay1", status: "active" }],
        feeItems: [
          { id: "fi1", fee_plan_id: "fp1", kind: "tuition", name: "Propina", is_active: true },
        ],
        existingInvoiceNumbers: new Set(),
      };
      const res = historicoFinanceiroImporter.analyzeRow(
        {
          student_identifier: "PROC-1",
          academic_year: "2023/2024",
          total_billed: 45000,
          total_paid: 45000,
        },
        cache as any,
      );
      expect(res.status).toBe("valid");
    });
  });
});
