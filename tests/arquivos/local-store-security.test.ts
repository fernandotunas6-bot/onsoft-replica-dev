import { describe, expect, it } from "vitest";
import { isLocalFileOwnedByViewer } from "@/features/arquivos/local-store";

const owner = { schoolId: "escola-a", ownerUserId: "utilizador-a" };
const file = { ...owner };

describe("isolamento do armazenamento local IndexedDB", () => {
  it("permite apenas o próprio dono dentro da escola activa", () => {
    expect(isLocalFileOwnedByViewer(file, owner)).toBe(true);
    expect(isLocalFileOwnedByViewer(file, { ...owner, schoolId: "escola-b" })).toBe(false);
    expect(isLocalFileOwnedByViewer(file, { ...owner, ownerUserId: "utilizador-b" })).toBe(false);
  });

  it("falha com sessão sem escola ou utilizador", () => {
    expect(isLocalFileOwnedByViewer(file, { schoolId: null, ownerUserId: "utilizador-a" })).toBe(
      false,
    );
    expect(isLocalFileOwnedByViewer(file, { schoolId: "escola-a", ownerUserId: "" })).toBe(false);
  });

  it("não concede acesso pela área pública ou partilhada", () => {
    for (const area of ["pessoal", "escola", "secretaria", "publico"] as const) {
      const record = { ...file, area };
      expect(
        isLocalFileOwnedByViewer(record, { schoolId: "escola-a", ownerUserId: "utilizador-b" }),
      ).toBe(false);
    }
  });
});
