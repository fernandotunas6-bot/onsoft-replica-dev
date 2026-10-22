import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next-path";

describe("safeNextPath", () => {
  it("aceita caminhos do próprio SIGA", () => {
    expect(safeNextPath("/configuracoes/inicio")).toBe("/configuracoes/inicio");
    expect(safeNextPath("/alunos?x=1")).toBe("/alunos?x=1");
    expect(safeNextPath("/")).toBe("/");
  });

  it("recusa outros domínios e rotas de autenticação", () => {
    for (const raw of [
      null,
      "",
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "configuracoes",
      "/auth/magic-link",
    ]) {
      expect(safeNextPath(raw)).toBe("/");
    }
  });
});
