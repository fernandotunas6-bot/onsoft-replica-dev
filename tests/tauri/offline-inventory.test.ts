import { describe, expect, it } from "vitest";
import {
  inventoryOfflineReadiness,
  verifyOfflineInventory,
} from "../../scripts/desktop/offline-inventory.mjs";

describe("inventário de autonomia local Tauri", () => {
  it("detecta a separação actual entre shell local e portal escolar remoto", () => {
    const result = inventoryOfflineReadiness();
    expect(result.schoolRuntime.remoteWindow).toBe(true);
    expect(result.schoolRuntime.localEntrypoints).toEqual(["main", "quick-pane"]);
    expect(result.schoolRuntime.schoolBundleEntry).toBe(false);
    expect(result.schoolRuntime.frontendDistribution).toBe("../desktop/dist");
    expect(result.schoolRuntime.allowedRemoteOrigins).toEqual(["https://portal-siga.com/*"]);
    expect(result.schoolRuntime.webServerPresetCloudflare).toBe(true);
    expect(verifyOfflineInventory(result)).toEqual([]);
  });

  it("conta rotas e funções de servidor existentes em vez de declarar suporte offline", () => {
    const result = inventoryOfflineReadiness();
    expect(result.counts.routeFiles).toBeGreaterThan(50);
    expect(result.counts.apiRoutes).toBeGreaterThan(20);
    expect(result.counts.filesDefiningServerFunctions).toBeGreaterThan(0);
    expect(result.counts.routeFiles).toBe(result.counts.apiRoutes + result.counts.otherRoutes);
    expect(result.candidatesForAudit.every((path) => path.startsWith("src/routes/"))).toBe(true);
  });

  it("recusa anunciar conversão escolar antes da validação", () => {
    const result = inventoryOfflineReadiness();
    expect(
      verifyOfflineInventory({
        ...result,
        schoolRuntime: { ...result.schoolRuntime, schoolBundleEntry: true },
      }),
    ).toContain(
      "Entrada de bundle escolar local detectada; rever paridade de autenticação, dados e capabilities.",
    );
  });
});
