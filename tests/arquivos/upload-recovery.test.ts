import { describe, expect, it } from "vitest";
import {
  prepareSchoolUpload,
  remainingSchoolUploads,
} from "@/features/arquivos/upload-recovery";

const draft = {
  id: "11111111-1111-4111-8111-111111111111",
  storagePath: "school/2026/10/secretaria/user/11111111-contract.pdf",
  schoolId: "school",
  ownerUserId: "user",
  area: "secretaria" as const,
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

  it("não permite reaproveitar upload entre escolas, contas ou áreas", () => {
    const registry = new WeakMap<object, ReturnType<typeof prepareSchoolUpload>>();
    const file = {};
    prepareSchoolUpload(registry, file, draft);
    for (const change of [
      { schoolId: "outra-escola" },
      { ownerUserId: "outra-conta" },
      { area: "pessoal" as const },
    ]) {
      expect(() => prepareSchoolUpload(registry, file, { ...draft, ...change })).toThrow(
        /tentativa pendente/,
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
