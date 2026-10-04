import { describe, expect, it, vi } from "vitest";
import { findGatePassCard } from "@/features/catracas/gate-pass-validation";

/**
 * O número do cartão e o "código de barras" estão impressos em texto no cartão.
 * O leitor físico só aceita o QR secreto e a tag RFID; a portaria com sessão
 * continua a poder escrever o número.
 */
function db() {
  const filters: string[] = [];
  const q: Record<string, unknown> = {};
  q["select"] = () => q;
  q["eq"] = () => q;
  q["or"] = (f: string) => {
    filters.push(f);
    return q;
  };
  q["maybeSingle"] = async () => ({ data: null, error: null });
  return { client: { from: () => q } as never, filters };
}

describe("o que abre a catraca", () => {
  it("leitor físico: só qr_secret e rfid_tag", async () => {
    const { client, filters } = db();
    await findGatePassCard(client, "s1", ["CARD-2026-000000000001"]);
    expect(filters[0]).toBe(
      "qr_secret.eq.CARD-2026-000000000001,rfid_tag.eq.CARD-2026-000000000001",
    );
    expect(filters[0]).not.toMatch(/card_number|barcode/);
  });

  it("portaria com sessão: também o número e o código impressos", async () => {
    const { client, filters } = db();
    await findGatePassCard(client, "s1", ["X1"], "staff");
    expect(filters[0]).toMatch(/card_number\.eq\.X1/);
    expect(filters[0]).toMatch(/barcode\.eq\.X1/);
  });
});

describe("limites do leitor físico", () => {
  it("chave errada repetida do mesmo IP é travada; leitura válida tem limite por dispositivo", async () => {
    vi.resetModules();
    const consume = vi.fn(async () => false);
    vi.doMock("@/lib/shared-rate-limit", () => ({ consumeRateLimit: consume }));
    vi.doMock("@/integrations/supabase/sga-admin", () => ({
      loadSgaAdminClient: async () => ({}),
    }));
    vi.doMock("@/features/catracas/gate-pass-validation", () => ({
      resolveGatePassDeviceByApiKey: async (_db: unknown, key: string) =>
        key === "KEY-BOA" ? { schoolId: "s1", deviceId: "d1", deviceName: "Portaria" } : null,
      evaluateGatePassAccess: async () => ({ granted: true }),
    }));
    const { runDeviceGatePassWebhook } = await import("@/features/catracas/device-webhook-handler");

    const bad = await runDeviceGatePassWebhook(
      { apiKey: "KEY-MA", token: "abc", direction: "entry" },
      "9.9.9.9",
    );
    expect(bad).toMatchObject({ granted: false, rateLimited: true });
    expect(consume).toHaveBeenLastCalledWith(["catraca_badkey:9.9.9.9"], expect.anything());

    const good = await runDeviceGatePassWebhook(
      { apiKey: "KEY-BOA", token: "abc", direction: "entry" },
      "9.9.9.9",
    );
    expect(good).toMatchObject({ granted: false, rateLimited: true });
    expect(consume).toHaveBeenLastCalledWith(["catraca_scan:d1"], expect.anything());
    vi.doUnmock("@/lib/shared-rate-limit");
    vi.doUnmock("@/integrations/supabase/sga-admin");
    vi.doUnmock("@/features/catracas/gate-pass-validation");
  });
});
