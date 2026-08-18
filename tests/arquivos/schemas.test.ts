import { describe, expect, it } from "vitest";
import {
  FILE_MAX_BYTES,
  archiveFinanceDocumentInputSchema,
  createSchoolFolderInputSchema,
  linkSchoolFileToClassInputSchema,
  listArquivosInputSchema,
  listArquivosStudentsInputSchema,
  moveSchoolFilesInputSchema,
  registerSchoolFileInputSchema,
  renameSchoolFileInputSchema,
  setSchoolFileVisibilityInputSchema,
} from "@/features/arquivos/schemas";
import {
  generateDocumentCode,
  isDocumentCode,
  normalizeDocumentCode,
  stableDocumentCode,
} from "@/features/arquivos/document-code";
import {
  canReadFileArea,
  canWriteFileArea,
  fileNeedsOrganization,
  fileVisibilityMeta,
  formatFileActivityLine,
  isAllowedSchoolFile,
  kindFromFile,
  myFileAccess,
  suggestFileArea,
  suggestFileCategory,
  visibleAreasForRole,
} from "@/features/arquivos/kinds";
import { initialsFromName } from "@/features/arquivos/FileKindIcon";
import { schoolFileShareText } from "@/features/arquivos/share-text";
import { isImageFileKind } from "@/features/arquivos/resolve-file";

describe("arquivos schemas", () => {
  it("accepts empty list input with a small page size", () => {
    expect(listArquivosInputSchema.parse({}).limit).toBe(48);
  });

  it("accepts class filter and rename/link payloads", () => {
    const classId = "22222222-2222-4222-8222-222222222222";
    expect(listArquivosInputSchema.parse({ classGroupId: classId }).classGroupId).toBe(classId);
    expect(
      renameSchoolFileInputSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        name: "pauta-turma.pdf",
      }).name,
    ).toBe("pauta-turma.pdf");
    expect(
      linkSchoolFileToClassInputSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        classGroupId: classId,
      }).classGroupId,
    ).toBe(classId);
    expect(
      linkSchoolFileToClassInputSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        classGroupId: null,
      }).classGroupId,
    ).toBeNull();
    expect(
      setSchoolFileVisibilityInputSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        visibility: "school",
      }).visibility,
    ).toBe("school");
    const userId = "33333333-3333-4333-8333-333333333333";
    expect(
      registerSchoolFileInputSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        name: "bi.pdf",
        mime: "application/pdf",
        sizeBytes: 1200,
        area: "secretaria",
        visibility: "private",
        storagePath: "school/x/bi.pdf",
        storageBackend: "sga",
        title: "Cópia do BI",
        category: "bilhete",
        relatedUserId: userId,
      }).relatedUserId,
    ).toBe(userId);
    expect(
      listArquivosInputSchema.parse({ category: "bilhete", relatedUserId: userId }).category,
    ).toBe("bilhete");
    const personId = "44444444-4444-4444-8444-444444444444";
    expect(
      listArquivosInputSchema.parse({ relatedPersonId: personId, category: "foto" })
        .relatedPersonId,
    ).toBe(personId);
    expect(listArquivosStudentsInputSchema.parse({ query: "Ana", limit: 10 }).limit).toBe(10);
    expect(listArquivosInputSchema.parse({ parentId: null }).parentId).toBeNull();
    expect(
      createSchoolFolderInputSchema.parse({
        id: "55555555-5555-4555-8555-555555555555",
        name: "Documentos 2026",
        area: "secretaria",
      }).name,
    ).toBe("Documentos 2026");
    expect(
      moveSchoolFilesInputSchema.parse({
        ids: ["55555555-5555-4555-8555-555555555555"],
        parentId: null,
      }).parentId,
    ).toBeNull();
    expect(
      archiveFinanceDocumentInputSchema.parse({
        category: "recibo",
        title: "Recibo mensalidade",
        description: "Recibo de pagamento da mensalidade escolar do aluno.",
        documentCode: "REC-260812-K4M2",
      }).category,
    ).toBe("recibo");
    expect(listArquivosInputSchema.parse({ category: "talao" }).category).toBe("talao");
  });

  it("builds searchable document codes", () => {
    const code = generateDocumentCode("recibo", new Date("2026-08-12T12:00:00Z"));
    expect(isDocumentCode(code)).toBe(true);
    expect(code.startsWith("REC-260812-")).toBe(true);
    const stable = stableDocumentCode(
      "talao",
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      new Date("2026-08-12T12:00:00Z"),
    );
    expect(isDocumentCode(stable)).toBe(true);
    expect(stable).toBe(
      stableDocumentCode(
        "talao",
        "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        new Date("2026-01-01T00:00:00Z"),
      ),
    );
    expect(normalizeDocumentCode(" rec-260812-k4m2 ")).toBe("REC-260812-K4M2");
  });

  it("rejects files over 8 MB and unknown types", () => {
    expect(
      isAllowedSchoolFile({ name: "a.pdf", type: "application/pdf", size: FILE_MAX_BYTES }).ok,
    ).toBe(true);
    expect(
      isAllowedSchoolFile({ name: "a.pdf", type: "application/pdf", size: FILE_MAX_BYTES + 1 }).ok,
    ).toBe(false);
    expect(
      isAllowedSchoolFile({ name: "a.exe", type: "application/x-msdownload", size: 10 }).ok,
    ).toBe(false);
    expect(
      kindFromFile(
        "pauta.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("excel");
    expect(kindFromFile("logo.svg", "image/svg+xml")).toBe("svg");
    expect(kindFromFile("foto.webp", "image/webp")).toBe("webp");
    expect(kindFromFile("aula.pptx", "")).toBe("powerpoint");
    expect(kindFromFile("lista.csv", "text/csv")).toBe("csv");
    expect(isAllowedSchoolFile({ name: "icon.svg", type: "image/svg+xml", size: 1200 }).ok).toBe(
      true,
    );
  });

  it("flags incomplete media without description", () => {
    expect(
      fileNeedsOrganization({
        title: "Foto",
        description: "curta",
        category: "foto",
      }),
    ).toBe(true);
    expect(
      fileNeedsOrganization({
        title: "BI do aluno",
        description: "Cópia digital do bilhete de identidade do aluno.",
        category: "bilhete",
      }),
    ).toBe(false);
    expect(suggestFileCategory({ name: "pauta-10a.xlsx", kind: "excel" })).toBe("pauta");
    expect(suggestFileArea("foto", ["secretaria", "escola", "pessoal"])).toBe("secretaria");
  });

  it("treats raster images as cover previews", () => {
    expect(isImageFileKind("png")).toBe(true);
    expect(isImageFileKind("jpeg")).toBe(true);
    expect(isImageFileKind("webp")).toBe(true);
    expect(isImageFileKind("gif")).toBe(true);
    expect(isImageFileKind("svg")).toBe(false);
    expect(isImageFileKind("pdf")).toBe(false);
    expect(isImageFileKind("excel")).toBe(false);
  });

  it("requires a client id when registering metadata", () => {
    const parsed = registerSchoolFileInputSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "boletim.pdf",
      mime: "application/pdf",
      sizeBytes: 1200,
      area: "secretaria",
      visibility: "private",
      storagePath: "school/2026/08/secretaria/u/id-boletim.pdf",
      storageBackend: "sga",
      classGroupId: "22222222-2222-4222-8222-222222222222",
    });
    expect(parsed.area).toBe("secretaria");
    expect(parsed.classGroupId).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("reserves secretaria and lets staff keep a personal area", () => {
    expect(canReadFileArea("Professor", "secretaria")).toBe(false);
    expect(canWriteFileArea("Secretaria", "secretaria")).toBe(true);
    expect(canWriteFileArea("Professor", "pessoal")).toBe(true);
    expect(canWriteFileArea("Tesouraria", "escola")).toBe(false);
    expect(visibleAreasForRole("Professor")).toEqual(["escola", "pessoal", "publico"]);
    expect(visibleAreasForRole("Secretaria")).toContain("secretaria");
  });

  it("builds a share reference without blobs", () => {
    expect(schoolFileShareText({ name: "ficha.pdf" }, "10.ª A")).toBe(
      "[Arquivo SIGA] ficha.pdf · turma 10.ª A",
    );
  });

  it("resolves my access level and activity labels", () => {
    expect(
      myFileAccess(
        { ownerUserId: "11111111-1111-4111-8111-111111111111", area: "escola" },
        "11111111-1111-4111-8111-111111111111",
        "Professor",
      ),
    ).toBe("owner");
    expect(
      myFileAccess(
        { ownerUserId: "11111111-1111-4111-8111-111111111199", area: "escola" },
        "11111111-1111-4111-8111-111111111111",
        "Professor",
      ),
    ).toBe("view");
    expect(fileVisibilityMeta.school.label).toBe("Escola");
    expect(
      formatFileActivityLine({
        action: "renamed",
        actorName: "Ana",
        at: new Date().toISOString(),
      }),
    ).toContain("Ana renomeou");
    expect(initialsFromName("Ana Silva Costa")).toBe("AS");
  });
});
