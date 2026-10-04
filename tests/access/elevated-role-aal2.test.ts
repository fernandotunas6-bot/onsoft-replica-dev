import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/features/access/server.ts", "utf8");
const requests = readFileSync("src/features/access/requests-server.ts", "utf8");
const handler = (source: string, name: string) => {
  const start = source.indexOf(`export const ${name}`);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("conceder Administrador ou Tesouraria exige 2FA", () => {
  it.each(["inviteSystemUser", "updateSystemAccountCargo", "createSchoolInvitation"])(
    "%s",
    (name) => {
      const body = handler(server, name);
      expect(body).toMatch(/cargoRequiresAdministrator\([^)]*\)\) \{\s*requireAal2\(/);
    },
  );

  it("aprovar um pedido de acesso com cargo elevado", () => {
    const body = handler(requests, "reviewAccessRequest");
    expect(body).toContain('if (data.role === "Administrador" || data.role === "Tesouraria")');
    expect(body.indexOf("requireAal2(")).toBeLessThan(body.indexOf("grantMembership("));
  });
});
