import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertUploadedSchoolFileMatches } from "@/features/arquivos/upload-verification";

describe("reconciliação do upload com o Storage real", () => {
  it("aceita apenas um objecto existente com tamanho igual ao declarado", () => {
    expect(() => assertUploadedSchoolFileMatches({ size: 2048 }, 2048)).not.toThrow();
  });

  it("recusa ficheiro inexistente e metadados ausentes", () => {
    for (const object of [null, {}, { size: null }, { size: Number.NaN }]) {
      expect(() => assertUploadedSchoolFileMatches(object, 2048)).toThrow(/armazenamento/);
    }
  });

  it("recusa tamanho diferente, zero ou não inteiro", () => {
    for (const size of [0, 1024, 2049, 2048.5]) {
      expect(() => assertUploadedSchoolFileMatches({ size }, 2048)).toThrow();
    }
  });

  it("o servidor verifica o blob e não o apaga em caso de falha de registo", () => {
    const source = readFileSync("src/features/arquivos/server.ts", "utf8");
    const begin = source.indexOf("export const registerSchoolFile =");
    const end = source.indexOf("export const createSchoolFolder =", begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const register = source.slice(begin, end);
    expect(register).toContain(".info(data.storagePath)");
    expect(register).toContain("assertUploadedSchoolFileMatches(object, data.sizeBytes)");
    expect(register).not.toContain(".remove([data.storagePath])");
  });
});
