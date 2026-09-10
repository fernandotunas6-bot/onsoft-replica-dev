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
      const cache = { existingCourses: [] };
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
      };
      const analysis = cursosImporter.analyzeRow({ code: "cfb", name: "Outro Nome" }, cache as any);
      expect(analysis.status).toBe("duplicate");
      expect(analysis.duplicate_of).toBe("c1");
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
      const cache = { existingGrades: [] };
      const analysis = classesImporter.analyzeRow(
        { code: "10-CFB", name: "10ª Classe CFB" },
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
        { code: "MAT", name: "Matemática", workload_hours: 4 },
        cache as any,
      );
      expect(analysis.status).toBe("valid");
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
