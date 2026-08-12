import { describe, expect, it } from "vitest";
import {
  getPrintTemplateInputSchema,
  officialDeclarationBody,
  printTemplateKeySchema,
  resetPrintTemplateInputSchema,
  savePrintTemplateInputSchema,
  setActivePrintTemplateInputSchema,
} from "@/features/documents/schemas";

describe("printTemplateKeySchema", () => {
  it("aceita chaves do catálogo", () => {
    expect(printTemplateKeySchema.parse("boletim-escolar")).toBe("boletim-escolar");
    expect(printTemplateKeySchema.parse("service-document")).toBe("service-document");
  });

  it("rejeita chaves inválidas", () => {
    expect(() => printTemplateKeySchema.parse("Modelo Inválido")).toThrow();
    expect(() => printTemplateKeySchema.parse("")).toThrow();
  });
});

describe("print template input schemas", () => {
  it("valida get/save/reset/active", () => {
    expect(getPrintTemplateInputSchema.parse({ key: "pauta-disciplinar" })).toEqual({
      key: "pauta-disciplinar",
    });
    expect(
      savePrintTemplateInputSchema.parse({
        key: "pauta-disciplinar",
        source: "<section>{{school.name}}</section>".padEnd(20, " "),
      }).key,
    ).toBe("pauta-disciplinar");
    expect(setActivePrintTemplateInputSchema.parse({ key: "issue" }).key).toBe("issue");
    expect(resetPrintTemplateInputSchema.parse({ key: "issue" }).key).toBe("issue");
  });
});

describe("officialDeclarationBody", () => {
  it("inclui turma quando o aluno já está colocado", () => {
    const text = officialDeclarationBody({
      schoolName: "Escola SIGA",
      studentName: "Ana Domingos",
      registrationNumber: "CAND-20260811-111111",
      className: "7ª A",
      academicYear: "2026/2027",
    });
    expect(text).toContain("Ana Domingos");
    expect(text).toContain("turma 7ª A");
    expect(text).toContain("2026/2027");
  });

  it("omite a turma quando ainda não há matrícula", () => {
    const text = officialDeclarationBody({
      schoolName: "Escola SIGA",
      studentName: "Noé Mateus",
      registrationNumber: "EST-1",
      academicYear: "2026/2027",
    });
    expect(text).not.toContain("turma");
  });
});
