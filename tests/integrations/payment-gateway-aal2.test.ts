import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/integrations/server.ts", "utf8");
const handler = (name: string) => {
  const start = source.indexOf(`export const ${name}`);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("gateways de pagamento", () => {
  it("configurar exige 2FA e a troca de comerciante fica na auditoria", () => {
    const upsert = handler("upsertSchoolIntegration");
    expect(upsert).toContain(
      'requireAal2(context.claims ?? {}, "Configurar um gateway de pagamentos")',
    );
    expect(upsert).toContain('action: "integration.payment_merchant.changed"');
  });

  it("instalar (gera a chave que emite recibos) exige 2FA", () => {
    expect(handler("installSchoolIntegration")).toContain(
      'requireAal2(context.claims ?? {}, "Instalar um gateway de pagamentos")',
    );
  });
});
