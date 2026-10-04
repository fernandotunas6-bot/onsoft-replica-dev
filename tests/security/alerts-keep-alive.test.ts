import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installKeepAlive, keepAlive } from "@/lib/execution-context";
import { reportSigaEvent } from "@/lib/ops-report";

/**
 * No Workers, um fetch que ninguém espera pode ser cancelado quando a resposta sai.
 * Os alertas (liquidação falhada, etc.) têm de ficar registados no waitUntil do pedido.
 */
describe("alertas não se perdem no fim do pedido", () => {
  afterEach(() => {
    installKeepAlive(() => undefined);
    delete process.env.SIGA_ALERT_WEBHOOK_URL;
    vi.unstubAllGlobals();
  });

  it("o envio do alerta é entregue ao waitUntil do pedido", async () => {
    process.env.SIGA_ALERT_WEBHOOK_URL = "https://hooks.example.test/x";
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const kept: Promise<unknown>[] = [];
    installKeepAlive((p) => kept.push(p));
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    reportSigaEvent("finance.settlement.failed", { school_id: "s1" });

    expect(kept).toHaveLength(1);
    await kept[0];
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sem contexto de pedido, keepAlive não falha", () => {
    installKeepAlive(() => {
      throw new Error("fora de um fetch");
    });
    expect(() => keepAlive(Promise.resolve())).not.toThrow();
  });

  it("o Worker instala o gancho com o ctx de cada pedido", () => {
    const server = readFileSync(join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toMatch(/installKeepAlive\(/);
    expect(server).toMatch(/requestContext\.run\(/);
  });
});
