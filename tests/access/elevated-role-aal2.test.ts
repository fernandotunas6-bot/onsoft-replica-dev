import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/features/access/server.ts", "utf8");
const requests = readFileSync("src/features/access/requests-server.ts", "utf8");
const institutionalLink = readFileSync("src/features/access/institutional-link.ts", "utf8");
const handler = (source: string, name: string) => {
  const start = source.indexOf(`export const ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("Administrador sem 2FA obrigatório, Tesouraria protegida", () => {
  it("limita o AAL2 na atribuição ao conjunto de códigos de Tesouraria", () => {
    expect(server).toContain(
      'const TREASURY_ROLE_CODES = new Set(mapAppRoleToSgaCodes("Tesouraria"))',
    );
    expect(server).toContain("export function cargoRequiresMfaForAssignment(");
    expect(server).toContain("return TREASURY_ROLE_CODES.has(");
  });

  it.each(["inviteSystemUser", "updateSystemAccountCargo", "createSchoolInvitation"])(
    "%s mantém autorização de Administrador e exige AAL2 apenas para Tesouraria",
    (name) => {
      const body = handler(server, name);
      expect(body).toContain("!isAdministrator");
      expect(body).toMatch(/if \(cargoRequiresMfaForAssignment\(data\.(cargo|roleCode)\)\) \{\s*requireAal2\(/);
      expect(body).not.toMatch(/if \(cargoRequiresAdministrator\(data\.(cargo|roleCode)\)\) \{\s*requireAal2\(/);
      expect(body).toContain("requireRecentVerification(");
    },
  );

  it("reconfirma a identidade antes de alterar o cargo sem exigir um autenticador", () => {
    const body = handler(server, "updateSystemAccountCargo");
    expect(body.indexOf("requireRecentVerification(")).toBeLessThan(
      body.indexOf("loadAdminClient("),
    );
  });

  it("aprova pedidos de acesso somente com papel admissível; Tesouraria ainda exige AAL2", () => {
    const body = handler(requests, "reviewAccessRequest");
    expect(institutionalLink).toContain('Nunca inclui "Administrador"');
    expect(body).toContain("canGrantRole(");
    expect(body).toContain('if (data.role === "Tesouraria")');
    expect(body).not.toContain('data.role === "Administrador" || data.role === "Tesouraria"');
    expect(body.indexOf("requireAal2(")).toBeLessThan(body.indexOf("grantMembership("));
  });
});
