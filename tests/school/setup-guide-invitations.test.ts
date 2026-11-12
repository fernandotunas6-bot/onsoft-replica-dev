import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `school_invitations` não tem SELECT para `authenticated` na produção (guarda o hash do
// token): pela sessão, a contagem do guia dava sempre «permission denied» e mostrava 0
// convites pendentes. O guia conta-os com o cliente privilegiado, filtrado pela escola.
describe("guia de arranque: convites pendentes", () => {
  const source = readFileSync("src/features/school/setup-guide-server.ts", "utf8");
  const snapshot = JSON.parse(readFileSync("supabase/PRODUCTION_SNAPSHOT.json", "utf8")) as {
    tabelas: Array<{ tabela: string; auth_select: boolean }>;
  };

  it("conta school_invitations com o cliente que recebe, nunca com a sessão", () => {
    expect(source).toMatch(/invitationsDb\s*\.from\("school_invitations"\)/);
    expect(source).not.toMatch(/\bdb\s*\.from\("school_invitations"\)/);
  });

  it("passa o cliente privilegiado e filtra pela escola da membership", () => {
    expect(source).toMatch(/loadSetupCounts\([\s\S]*?membership\.schoolId,[\s\S]*?admin,\s*\)/);
    expect(source).toMatch(/from\("school_invitations"\)[\s\S]{0,80}\.eq\("school_id", schoolId\)/);
  });

  it("enquanto a produção não der SELECT à sessão, esta regra mantém-se", () => {
    const table = snapshot.tabelas.find((t) => t.tabela === "school_invitations");
    expect(table?.auth_select).toBe(false);
  });
});
