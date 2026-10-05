import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("domínio próprio da escola", () => {
  const source = readFileSync("src/features/saas/school-domain-ops.ts", "utf8");
  const request = source.slice(
    source.indexOf("export async function requestCustomDomainVerification"),
    source.indexOf("export async function saveEmailForwardingRoute"),
  );

  it("recusa domínios da plataforma e já pedidos por outra escola", () => {
    expect(request).toContain("if (isPlatformOwnedHostname(hostname))");
    expect(request).toContain('.neq("tenant_id", input.tenantId)');
    expect(request).toContain("Este domínio já foi pedido por outra escola.");
  });

  it("repetir o pedido do domínio activo não o desliga", () => {
    expect(request).toContain('existing.hostname === hostname && existing.status === "active"');
  });

  it("um erro ao gravar a troca de domínio é mostrado", () => {
    expect(request).toContain("if (updateError)");
  });
});
