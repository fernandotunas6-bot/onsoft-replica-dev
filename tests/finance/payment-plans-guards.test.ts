import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Planos de pagamento (src/features/finance/server.ts):
 * - cancelar só mexe em planos ainda por liquidar — a liquidação (webhook ou confirmação
 *   manual) pode acontecer entre a leitura do estado e a escrita;
 * - o talão arquivado leva a referência gerada, não só a escrita à mão.
 */
const source = readFileSync(resolve(__dirname, "../../src/features/finance/server.ts"), "utf8");

function handler(name: string) {
  const start = source.indexOf(`export const ${name} = createServerFn`);
  expect(start, name).toBeGreaterThan(-1);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("planos de pagamento", () => {
  it("cancelPaymentPlan só actualiza planos pending_gateway/scheduled", () => {
    const body = handler("cancelPaymentPlan");
    const update = body.slice(body.indexOf(".update("));
    expect(update).toMatch(/\.in\("status", CANCELLABLE_PLAN_STATUSES\)/);
    expect(source).toMatch(/const CANCELLABLE_PLAN_STATUSES = \["pending_gateway", "scheduled"\]/);
  });

  it("o talão de createPaymentPlan usa a referência final (gerada ou escrita)", () => {
    const body = handler("createPaymentPlan");
    const archive = body.slice(body.indexOf("archiveFinanceQuietly("));
    expect(archive).toMatch(/Referência \$\{reference \?\? "—"\}/);
    expect(archive).toMatch(/sourceLabel: reference \?\? plan\.id/);
    expect(archive).not.toMatch(/data\.reference/);
  });
});
