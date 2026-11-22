import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * PayFlow desactivado (decisão do proprietário, 15/11/2026; análise 22, P1-2).
 *
 * Uma só chave estática servia de prova de pagamento, de sincronização e de entrada de
 * administrador em todas as escolas. Enquanto não houver chaves separadas e liquidação
 * assinada, o PayFlow fica desligado: estes testes impedem que volte a ligar-se sem querer.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("interruptor do PayFlow", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("está desligado por omissão, no servidor e na interface", async () => {
    vi.stubEnv("PAYFLOW_ENABLED", "");
    vi.stubEnv("VITE_PAYFLOW_ENABLED", "");
    const { isPayflowServerEnabled, isPayflowUiEnabled, assertPayflowEnabled } =
      await import("@/lib/payflow-switch");
    expect(isPayflowServerEnabled()).toBe(false);
    expect(isPayflowUiEnabled()).toBe(false);
    expect(() => assertPayflowEnabled()).toThrow(/PayFlow está desactivado/);
  });

  it("só liga com true ou 1, nunca com outro valor", async () => {
    const { isPayflowServerEnabled } = await import("@/lib/payflow-switch");
    for (const value of ["true", "TRUE", " 1 "]) {
      expect(isPayflowServerEnabled({ PAYFLOW_ENABLED: value })).toBe(true);
    }
    for (const value of ["", "0", "false", "yes", "on", undefined]) {
      expect(isPayflowServerEnabled({ PAYFLOW_ENABLED: value })).toBe(false);
    }
  });

  it("a liquidação PayFlow → SIGA recusa antes do limite e da chave", async () => {
    vi.stubEnv("PAYFLOW_ENABLED", "");
    const source = read("src/routes/api/finance/payflow.settlement.tsx");
    const gate = source.indexOf("isPayflowServerEnabled()");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(source.indexOf("consumeRateLimit("));
    expect(gate).toBeLessThan(source.indexOf("payflowSettlementAuthorized("));

    const { Route } = await import("@/routes/api/finance/payflow.settlement");
    const post = (
      Route.options as unknown as {
        server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } };
      }
    ).server.handlers.POST;
    const response = await post({
      request: new Request("https://portal-siga.com/api/finance/payflow/settlement", {
        method: "POST",
        headers: { authorization: `Bearer ${"k".repeat(32)}` },
        body: "{}",
      }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("as funções de servidor do PayFlow recusam com a mensagem própria", () => {
    const finance = read("src/features/finance/server.ts");
    for (const name of [
      "createPayflowAdminLaunch",
      "syncStudentToPayflow",
      "syncSchoolBankToPayflow",
    ]) {
      const start = finance.indexOf(`export const ${name} = createServerFn(`);
      expect(start, name).toBeGreaterThan(-1);
      const next = finance.indexOf("export const", start + 10);
      expect(finance.slice(start, next), name).toContain("assertPayflowEnabled();");
    }
    expect(read("src/features/finance/payflow-sync-execute.ts")).toMatch(
      /executePayflowStudentSync[\s\S]*?\{\n\s+assertPayflowEnabled\(\);/,
    );
    // Assinaturas: sem PayFlow, a escola paga por transferência e envia o comprovativo.
    expect(read("src/features/saas/subscription-server.ts")).toContain(
      "if (!isPayflowServerEnabled() || apiKey.length < 24 || !url) {",
    );
  });

  it("os botões do PayFlow não aparecem com o interruptor desligado", () => {
    for (const file of [
      "PayflowAdminLaunchButton.tsx",
      "PayflowStudentSyncButton.tsx",
      "PayflowBankSyncButton.tsx",
    ]) {
      expect(read(`src/features/finance/components/${file}`), file).toContain(
        "if (!isPayflowUiEnabled()) return null;",
      );
    }
    // O PayflowPayerLink esconde-se porque getPayflowUrl devolve null.
    expect(read("src/lib/ecosystem-urls.ts")).toContain("if (!isPayflowUiEnabled()) return null;");
  });

  it("a publicação só liga o PayFlow com a variável do repositório", async () => {
    const { applyPayflowProductionBindings } =
      await import("../../scripts/siga/payflow-bindings.mjs");
    const base = { name: "siga-plus-payflow", vars: { PAYFLOW_ENABLED: "true", OTHER: "x" } };
    const off = applyPayflowProductionBindings(base, { migrationsDir: "drizzle", env: {} });
    expect(off.vars).toEqual({ OTHER: "x" });
    const on = applyPayflowProductionBindings(base, {
      migrationsDir: "drizzle",
      env: { PAYFLOW_ENABLED: "true" },
    });
    expect(on.vars).toMatchObject({ PAYFLOW_ENABLED: "true", OTHER: "x" });

    const { OPTIONAL_WORKER_VARS } = await import("../../scripts/worker-secrets.mjs");
    expect(OPTIONAL_WORKER_VARS).toContain("PAYFLOW_ENABLED");

    const workflow = read(".github/workflows/deploy-production.yml");
    for (const name of ["PAYFLOW_ENABLED", "VITE_PAYFLOW_ENABLED", "NEXT_PUBLIC_PAYFLOW_ENABLED"]) {
      expect(workflow).toContain(`${name}: \${{ vars.PAYFLOW_ENABLED }}`);
    }
  });
});
