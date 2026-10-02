import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Redefinir a senha de outro funcionário é tomar a conta dele. Exige 2FA na
 * sessão de quem o faz e avisa o titular por e-mail.
 */
describe("redefinição directa de senha", () => {
  const code = readFileSync(join(process.cwd(), "src/features/access/server.ts"), "utf8");
  const start = code.indexOf("export const resetStaffPasswordDirect");
  const body = code.slice(start, code.indexOf("export const", start + 10));

  it("exige aal2 antes de qualquer outra coisa", () => {
    const aal = body.indexOf("requireAal2(");
    expect(aal).toBeGreaterThan(-1);
    expect(aal).toBeLessThan(body.indexOf("updateUserById"));
    expect(aal).toBeLessThan(body.indexOf("requireAdminContext"));
  });

  it("avisa o funcionário quando a senha é de outra pessoa", () => {
    expect(body).toMatch(/notifyPasswordResetByAdmin\(admin, schoolId, data\.userId\)/);
    expect(body.indexOf("notifyPasswordResetByAdmin")).toBeGreaterThan(
      body.indexOf("updateUserById"),
    );
  });
});
