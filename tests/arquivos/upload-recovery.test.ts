import { describe, expect, it } from "vitest";
import {
  prepareSchoolUpload,
  remainingSchoolUploads,
  isMatchingRegisteredUpload,
} from "@/features/arquivos/upload-recovery";

const draft = {
  id: "11111111-1111-4111-8111-111111111111",
  storagePath: "school/2026/10/secretaria/user/11111111-contract.pdf",
  schoolId: "school",
  ownerUserId: "user",
  area: "secretaria" as const,
  parentId: "pasta-original",
  classGroupId: null,
  relatedPersonId: "pessoa-1",
  relatedUserId: "user",
  visibility: "private" as const,
};

describe("retentativas de upload do Arquivo", () => {
  it("mantém UUID e caminho depois de uma falha parcial", () => {
    const registry = new WeakMap<object, ReturnType<typeof prepareSchoolUpload>>();
    const file = {};
    const original = prepareSchoolUpload(registry, file, draft);
    original.uploaded = true;
    const retry = prepareSchoolUpload(registry, file, {
      ...draft,
      id: "outro-id",
      storagePath: "outro-path",
    });
    expect(retry).toBe(original);
    expect(retry.uploaded).toBe(true);
    expect(retry.id).toBe(draft.id);
    expect(retry.storagePath).toBe(draft.storagePath);
  });

  it("não permite reaproveitar upload entre contas, pastas, finalidades ou visibilidades", () => {
    const registry = new WeakMap<object, ReturnType<typeof prepareSchoolUpload>>();
    const file = {};
    prepareSchoolUpload(registry, file, draft);
    for (const change of [
      { schoolId: "outra-escola" },
      { ownerUserId: "outra-conta" },
      { area: "pessoal" as const },
      { parentId: "pasta-diferente" },
      { classGroupId: "turma-diferente" },
      { relatedPersonId: "pessoa-diferente" },
      { relatedUserId: "outro-relacionado" },
      { visibility: "school" as const },
    ]) {
      expect(() => prepareSchoolUpload(registry, file, { ...draft, ...change })).toThrow(
        /destino ou contexto/,
      );
    }
  });

  it("preserva apenas os ficheiros ainda não concluídos", () => {
    const files = ["f1.pdf", "f2.pdf", "f3.pdf"];
    expect(remainingSchoolUploads(files, 0)).toEqual(files);
    expect(remainingSchoolUploads(files, 2)).toEqual(["f3.pdf"]);
    expect(remainingSchoolUploads(files, 3)).toEqual([]);
  });

  it("recusa contador de conclusão inconsistente", () => {
    for (const count of [-1, 4, 1.5, Number.NaN]) {
      expect(() => remainingSchoolUploads(["a", "b"], count)).toThrow(/inválido/);
    }
  });
});

describe("idempotência segura no registo de uploads", () => {
  const expected = {
    ...draft,
    name: "Contrato.pdf",
    mime: "application/pdf",
    sizeBytes: 2048,
    visibility: "private",
    parentId: null,
    classGroupId: null,
    relatedPersonId: null,
    relatedUserId: "user",
  };
  const saved = {
    id: expected.id,
    school_id: expected.schoolId,
    owner_user_id: expected.ownerUserId,
    name: expected.name,
    mime: expected.mime,
    size_bytes: expected.sizeBytes,
    area: expected.area,
    visibility: expected.visibility,
    storage_path: expected.storagePath,
    storage_backend: "sga",
    parent_id: null,
    class_group_id: null,
    related_person_id: null,
    related_user_id: "user",
  };

  it("aceita somente a mesma operação persistida", () => {
    expect(isMatchingRegisteredUpload(saved, expected)).toBe(true);
    expect(isMatchingRegisteredUpload(null, expected)).toBe(false);
  });

  it("rejeita colisão de ID, escola, dono, caminho e contexto", () => {
    for (const changed of [
      { school_id: "outra-escola" },
      { owner_user_id: "outra-conta" },
      { storage_path: "outra-localizacao" },
      { parent_id: "outra-pasta" },
      { related_person_id: "outra-pessoa" },
      { class_group_id: "outra-turma" },
      { visibility: "public" },
      { size_bytes: 1024 },
      { storage_backend: "local" },
    ]) {
      expect(isMatchingRegisteredUpload({ ...saved, ...changed }, expected)).toBe(false);
    }
  });
});
