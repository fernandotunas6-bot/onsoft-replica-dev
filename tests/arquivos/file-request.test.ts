import { describe, expect, it } from "vitest";
import { fileMatchesRequest, type SchoolFileRequest } from "@/features/arquivos/file-request";

const schoolFile = {
  isFolder: false,
  isSystem: false,
  storageBackend: "sga",
  area: "secretaria",
  visibility: "private",
  relatedPersonId: "11111111-1111-4111-8111-111111111111",
  classGroupId: "22222222-2222-4222-8222-222222222222",
  category: "contrato",
} as const;

const request = (purpose: SchoolFileRequest["purpose"]): SchoolFileRequest => ({ purpose });

describe("file picker por finalidade, inspirado no Moodle", () => {
  it("não selecciona pastas e conserva ficheiros locais apenas no uso geral", () => {
    const folder = { ...schoolFile, isFolder: true };
    const local = { ...schoolFile, storageBackend: "local" as const };
    expect(fileMatchesRequest(folder, request("general"))).toBe(false);
    expect(fileMatchesRequest(local, request("general"))).toBe(true);
    expect(fileMatchesRequest(local, request("message-attachment"))).toBe(false);
  });

  it("anexos de mensagens exigem ficheiros persistidos na escola", () => {
    expect(fileMatchesRequest(schoolFile, request("message-attachment"))).toBe(true);
  });

  it("documentos de alunos exigem pessoa exacta e pasta reservada", () => {
    const req: SchoolFileRequest = {
      purpose: "student-document",
      relatedPersonId: schoolFile.relatedPersonId,
    };
    const otherArea = { ...schoolFile, area: "escola" as const };
    const otherVisibility = { ...schoolFile, visibility: "school" as const };
    const otherPerson = { ...schoolFile, relatedPersonId: "outra-pessoa" };
    expect(fileMatchesRequest(schoolFile, req)).toBe(true);
    expect(fileMatchesRequest(schoolFile, request("student-document"))).toBe(false);
    expect(fileMatchesRequest(otherArea, req)).toBe(false);
    expect(fileMatchesRequest(otherVisibility, req)).toBe(false);
    expect(fileMatchesRequest(otherPerson, req)).toBe(false);
  });

  it("materiais respeitam a turma solicitada", () => {
    const req: SchoolFileRequest = {
      purpose: "class-material",
      classGroupId: schoolFile.classGroupId,
    };
    const material = { ...schoolFile, area: "escola" as const, visibility: "school" as const };
    const otherClass = { ...material, classGroupId: "outra-turma" };
    const unlinked = { ...material, classGroupId: null };
    const privateMaterial = { ...material, visibility: "private" as const };
    const systemMaterial = { ...material, isSystem: true };
    expect(fileMatchesRequest(material, req)).toBe(true);
    expect(fileMatchesRequest(unlinked, req)).toBe(true);
    expect(fileMatchesRequest(systemMaterial, req)).toBe(false);
    expect(fileMatchesRequest(material, request("class-material"))).toBe(false);
    expect(fileMatchesRequest(otherClass, req)).toBe(false);
    expect(fileMatchesRequest(privateMaterial, req)).toBe(false);
    expect(fileMatchesRequest(schoolFile, req)).toBe(false);
  });

  it("arquivos financeiros não aceitam documentos de outra categoria", () => {
    expect(fileMatchesRequest(schoolFile, request("finance-document"))).toBe(false);
    for (const category of ["fatura", "recibo", "talao"] as const) {
      const financeFile = { ...schoolFile, category };
      expect(fileMatchesRequest(financeFile, request("finance-document"))).toBe(true);
      expect(
        fileMatchesRequest({ ...financeFile, area: "escola" }, request("finance-document")),
      ).toBe(true);
      expect(
        fileMatchesRequest({ ...financeFile, area: "pessoal" }, request("finance-document")),
      ).toBe(false);
      expect(
        fileMatchesRequest({ ...financeFile, area: "publico" }, request("finance-document")),
      ).toBe(false);
    }
  });
});
