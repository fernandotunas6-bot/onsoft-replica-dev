import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));

import {
  checkNativeUpdate,
  installNativeUpdate,
  installNativeUpdateWhenSafe,
} from "@/lib/native-updater";

describe("actualizações da app pelos comandos Rust", () => {
  beforeEach(() => invoke.mockReset());

  it("verificar usa check_app_update (sem permissões do plugin no portal)", async () => {
    invoke.mockResolvedValueOnce({
      configured: true,
      available: true,
      version: "1.0.1",
      notes: "Impressão no macOS",
    });
    await expect(checkNativeUpdate()).resolves.toEqual({
      configured: true,
      available: true,
      version: "1.0.1",
      body: "Impressão no macOS",
    });
    expect(invoke).toHaveBeenCalledWith("check_app_update");
  });

  it("sem chave configurada na app, não há versão nova", async () => {
    invoke.mockResolvedValueOnce({
      configured: false,
      available: false,
      version: null,
      notes: null,
    });
    const update = await checkNativeUpdate();
    expect(update).toMatchObject({ configured: false, available: false });
    expect(update.version).toBeUndefined();
  });

  it("instalar usa install_app_update", async () => {
    invoke.mockResolvedValueOnce(undefined);
    await expect(installNativeUpdate()).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith("install_app_update");
  });

  it("nunca instala com gravações por enviar", async () => {
    await expect(installNativeUpdateWhenSafe(2)).resolves.toEqual({
      installed: false,
      waiting: 2,
    });
    expect(invoke).not.toHaveBeenCalled();
    invoke.mockResolvedValueOnce(undefined);
    await expect(installNativeUpdateWhenSafe(0)).resolves.toEqual({ installed: true, waiting: 0 });
  });
});
