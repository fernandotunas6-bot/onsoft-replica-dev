import { describe, it, expect } from "vitest";
import { cursosImporter } from "@/features/import/importers/cursos-importer";
import { classesImporter } from "@/features/import/importers/classes-importer";
import { disciplinasImporter } from "@/features/import/importers/disciplinas-importer";
import { salasImporter } from "@/features/import/importers/salas-importer";

describe("Pedagogical Importers (cursos, classes, disciplinas, salas)", () => {
  describe("cursosImporter", () => {
    it("valida campos obrigatórios e rejeita vazios", () => {
      const cache = { existingCourses: [] };
      const analysis = cursosImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Código ou sigla do curso é obrigatório.");
      expect(analysis.errors).toContain("Nome completo do curso é obrigatório.");
    });

    it("reconhece curso válido", () => {
      const cache = {
        existingCourses: [],
        academicLevels: [{ id: "al1", code: "SEC", name: "Ensino Secundário" }],
      };
      const analysis = cursosImporter.analyzeRow(
        { code: "CFB", name: "Ciências Físicas e Biológicas" },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
      expect(analysis.errors).toHaveLength(0);
    });

    it("detecta duplicado em cache", () => {
      const cache = {
        existingCourses: [{ id: "c1", code: "CFB", name: "Ciências Físicas e Biológicas" }],
        academicLevels: [{ id: "al1", code: "SEC", name: "Ensino Secundário" }],
      };
      const analysis = cursosImporter.analyzeRow({ code: "cfb", name: "Outro Nome" }, cache as any);
      expect(analysis.status).toBe("duplicate");
      expect(analysis.duplicate_of).toBe("c1");
    });

    it("detecta o mesmo curso com outro código, pelo nome ou pelo catálogo", () => {
      const cache = {
        existingCourses: [{ id: "c1", code: "CEJ", name: "Ciências Económicas e Jurídicas" }],
        academicLevels: [{ id: "al1", code: "SEC", name: "Ensino Secundário" }],
      };
      const sameName = cursosImporter.analyzeRow(
        { code: "CEJ2", name: "Ciencias Economicas e Juridicas" },
        cache as any,
      );
      expect(sameName.status).toBe("duplicate");
      expect(sameName.warnings[0]).toContain("o mesmo nome");
      const synonym = cursosImporter.analyzeRow(
        { code: "CEJ2", name: "Ciências Económico-Jurídicas" },
        cache as any,
      );
      expect(synonym.status).toBe("duplicate");
      expect(synonym.duplicate_of).toBe("c1");
      expect(synonym.warnings[0]).toContain("outra grafia");
    });

    it("um curso diferente não é duplicado", () => {
      const cache = {
        existingCourses: [{ id: "c1", code: "CEJ", name: "Ciências Económicas e Jurídicas" }],
        academicLevels: [{ id: "al1", code: "SEC", name: "Ensino Secundário" }],
      };
      const analysis = cursosImporter.analyzeRow(
        { code: "CFB", name: "Ciências Físicas e Biológicas" },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });

  describe("classesImporter", () => {
    it("valida campos obrigatórios", () => {
      const cache = { existingGrades: [] };
      const analysis = classesImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Código da classe é obrigatório.");
    });

    it("valida classe correta", () => {
      // Uma classe pertence a um curso (`grade_levels.program_id`); com um único curso
      // na escola não é preciso indicá-lo na folha.
      const cache = {
        existingGrades: [],
        programs: [{ id: "prog1", code: "CFB", name: "Ciências Físicas e Biológicas" }],
      };
      const analysis = classesImporter.analyzeRow(
        { code: "10-CFB", name: "10ª Classe CFB" },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });

    it("com vários cursos, exige a coluna Curso / Especialidade", () => {
      const cache = {
        existingGrades: [],
        programs: [
          { id: "prog1", code: "CFB", name: "Ciências Físicas e Biológicas" },
          { id: "prog2", code: "INFO", name: "Informática de Gestão" },
        ],
      };
      const analysis = classesImporter.analyzeRow(
        { code: "10-CFB", name: "10ª Classe CFB" },
        cache as any,
      );
      expect(analysis.status).toBe("error");
      expect(analysis.errors[0]).toMatch(/Curso \/ Especialidade/);
    });

    it("resolve o curso indicado pelo código", () => {
      const cache = {
        existingGrades: [],
        programs: [
          { id: "prog1", code: "CFB", name: "Ciências Físicas e Biológicas" },
          { id: "prog2", code: "INFO", name: "Informática de Gestão" },
        ],
      };
      const analysis = classesImporter.analyzeRow(
        { code: "10-INFO", name: "10ª Classe", course_code: "INFO" },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });

    it("a mesma classe pode existir em cursos diferentes", () => {
      const cache = {
        existingGrades: [{ id: "g1", code: "10", name: "10ª Classe", program_id: "prog1" }],
        programs: [
          { id: "prog1", code: "CFB", name: "Ciências Físicas e Biológicas" },
          { id: "prog2", code: "INFO", name: "Informática de Gestão" },
        ],
      };
      const analysis = classesImporter.analyzeRow(
        { code: "10", name: "10ª Classe", course_code: "INFO" },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });

  describe("disciplinasImporter", () => {
    it("valida campos obrigatórios", () => {
      const cache = { existingSubjects: [] };
      const analysis = disciplinasImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Código/sigla da disciplina é obrigatório.");
    });

    it("valida disciplina válida", () => {
      const cache = { existingSubjects: [] };
      const analysis = disciplinasImporter.analyzeRow(
        { code: "MAT", name: "Matemática", annual_hours: 132 },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });

    it("reconhece a disciplina existente pelo nome ou pela grafia do catálogo, não só pelo código", () => {
      const cache = {
        existingSubjects: [
          { id: "mat", code: "MAT", name: "Matemática" },
          { id: "ef", code: "EDF", name: "Educação Física" },
        ],
      };
      // Código diferente, mesmo nome: antes criava outra Matemática.
      const sameName = disciplinasImporter.analyzeRow(
        { code: "MATEM", name: "Matemática" },
        cache as any,
      );
      expect(sameName).toMatchObject({ status: "duplicate", duplicate_of: "mat" });
      expect(sameName.warnings[0]).toMatch(/o mesmo nome/);
      const otherSpelling = disciplinasImporter.analyzeRow(
        { code: "EFIS", name: "Ed. Física" },
        cache as any,
      );
      expect(otherSpelling).toMatchObject({ status: "duplicate", duplicate_of: "ef" });
      expect(otherSpelling.warnings[0]).toMatch(/outra grafia/);
      // Disciplina nova continua a entrar.
      expect(
        disciplinasImporter.analyzeRow({ code: "ROB", name: "Robótica" }, cache as any).status,
      ).toBe("valid");
    });

    it("avisa quando a carga horária parece semanal", () => {
      // `subjects.annual_hours` é anual. A folha pedia horas semanais até 2026-09-16, por
      // isso um 4 continua a chegar — e tem de ser assinalado, não convertido às cegas.
      const cache = { existingSubjects: [] };
      const analysis = disciplinasImporter.analyzeRow(
        { code: "MAT", name: "Matemática", workload_hours: 4 },
        cache as any,
      );
      expect(analysis.status).toBe("warning");
      expect(analysis.warnings[0]).toMatch(/parece semanal/);
    });
  });

  describe("salasImporter", () => {
    it("valida campos obrigatórios", () => {
      const cache = { existingRooms: [] };
      const analysis = salasImporter.analyzeRow({}, cache as any);
      expect(analysis.status).toBe("error");
      expect(analysis.errors).toContain("Código da sala é obrigatório.");
    });

    it("valida sala válida", () => {
      const cache = { existingRooms: [] };
      const analysis = salasImporter.analyzeRow(
        { code: "S-01", name: "Sala 01", capacity: 45 },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
    });
  });
});
