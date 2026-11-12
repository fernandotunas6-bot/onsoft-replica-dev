import { describe, expect, it, vi } from "vitest";
import {
  requireSchoolWebStorage,
  schoolWebStorageReady,
} from "@/features/school-website/storage-guard";
describe("activação segura dos conteúdos escolares", () => {
  it("uma base sem a protecção aplicada nunca permite publicar", async () => {
    for (const response of [
      { data: false, error: null },
      { data: null, error: { message: "function not found" } },
      { data: "true", error: null },
    ]) {
      const db = { rpc: vi.fn(async () => response) };
      expect(await schoolWebStorageReady(db as never)).toBe(false);
      await expect(requireSchoolWebStorage(db as never)).rejects.toThrow(/protecção/);
    }
  });
  it("a sonda exige uma resposta booleana confirmada pelo servidor", async () => {
    const db = { rpc: vi.fn(async () => ({ data: true, error: null })) };
    await expect(requireSchoolWebStorage(db as never)).resolves.toBeUndefined();
    expect(db.rpc).toHaveBeenCalledWith("school_web_storage_ready");
  });
});
