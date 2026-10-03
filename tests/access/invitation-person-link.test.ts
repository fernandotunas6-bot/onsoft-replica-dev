import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("aceitar convite: ligação à ficha da pessoa", () => {
  const source = readFileSync("src/features/access/server.ts", "utf8");
  const accept = source.slice(source.indexOf("export const acceptSchoolInvitation"));

  it("escapa os curingas do ILIKE e exige o e-mail exacto", () => {
    expect(accept).toContain("invitedEmail.replace(/[\\\\%_]/g, (c) => `\\\\${c}`)");
    expect(accept).toContain("=== invitedEmail");
  });

  it("só liga quando há uma única ficha sem conta, pelo id", () => {
    expect(accept).toContain("if (exact.length === 1)");
    expect(accept).toContain('.eq("id", String(exact[0].id))');
    expect(accept).not.toMatch(
      /\.update\(\{ user_id: userId \}\)\s*\.eq\("school_id", schoolId\)\s*\.ilike/,
    );
  });
});
