import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Preparar, editar, gravar e reverter uma importação alteram dados. Antes, o
 * controlo destas funções era o de leitura: uma conta com "Leitura" no módulo
 * Importação conseguia gravar ou reverter uma importação inteira.
 */
describe("importação: permissão de escrita nas operações que alteram dados", () => {
  const source = readFileSync("src/features/import/server.ts", "utf8");

  it("o controlo do trabalho exige escrita por omissão", () => {
    expect(source).toMatch(/mode: "read" \| "write" = "write"/);
  });

  it("só a listagem de linhas pede leitura", () => {
    const readCalls = [...source.matchAll(/loadJobWithModuleGate\([^)]*"read"\)/g)];
    expect(readCalls).toHaveLength(1);
    const listStart = source.indexOf("export const listStagingRows");
    const nextFn = source.indexOf("export const", listStart + 10);
    expect(readCalls[0]!.index).toBeGreaterThan(listStart);
    expect(readCalls[0]!.index).toBeLessThan(nextFn);
  });
});
