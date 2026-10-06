/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, native } = vi.hoisted(() => ({ invoke: vi.fn(), native: { value: true } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => native.value }));

import { deleteNativeSetting, loadNativeSetting, saveNativeSetting } from "@/lib/native-store";
import { createNativeStrongholdStore } from "@/lib/native-stronghold";

beforeEach(() => {
  invoke.mockReset();
  native.value = true;
  window.localStorage.clear();
});

describe("definições do posto (Store nativo)", () => {
  it("na app, lê do ficheiro nativo e actualiza a cópia síncrona", async () => {
    invoke.mockResolvedValueOnce({ turnstileIp: "192.168.1.9" });
    await expect(loadNativeSetting("siga-desktop-settings")).resolves.toEqual({
      turnstileIp: "192.168.1.9",
    });
    expect(invoke).toHaveBeenCalledWith("portal_store_get", { key: "siga-desktop-settings" });
    expect(JSON.parse(window.localStorage.getItem("siga-desktop-settings")!)).toEqual({
      turnstileIp: "192.168.1.9",
    });
  });

  it("migra uma vez as definições antigas do localStorage", async () => {
    window.localStorage.setItem("siga-desktop-settings", JSON.stringify({ printerIp: "10.0.0.5" }));
    invoke.mockResolvedValueOnce(null).mockResolvedValueOnce(undefined);
    await expect(loadNativeSetting("siga-desktop-settings")).resolves.toEqual({
      printerIp: "10.0.0.5",
    });
    expect(invoke).toHaveBeenLastCalledWith("portal_store_set", {
      key: "siga-desktop-settings",
      value: { printerIp: "10.0.0.5" },
    });
  });

  it("gravar escreve no ficheiro nativo e na cópia; apagar remove os dois", async () => {
    invoke.mockResolvedValue(undefined);
    await saveNativeSetting("posto", { a: 1 });
    expect(invoke).toHaveBeenCalledWith("portal_store_set", { key: "posto", value: { a: 1 } });
    expect(window.localStorage.getItem("posto")).toBe('{"a":1}');
    await deleteNativeSetting("posto");
    expect(invoke).toHaveBeenCalledWith("portal_store_delete", { key: "posto" });
    expect(window.localStorage.getItem("posto")).toBeNull();
  });

  it("um erro do ficheiro nativo não é escondido", async () => {
    invoke.mockRejectedValueOnce("Chave inválida.");
    await expect(saveNativeSetting("../x", 1)).rejects.toBe("Chave inválida.");
  });

  it("no navegador usa só o localStorage", async () => {
    native.value = false;
    await saveNativeSetting("posto", { b: 2 });
    await expect(loadNativeSetting("posto")).resolves.toEqual({ b: 2 });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("cofre nativo (Stronghold) pelos comandos do portal", () => {
  it("desbloqueia e usa só os comandos portal_vault_*", async () => {
    invoke.mockResolvedValue(undefined);
    const vault = await createNativeStrongholdStore("palavra-passe");
    expect(invoke).toHaveBeenCalledWith("portal_vault_unlock", { password: "palavra-passe" });

    invoke.mockResolvedValueOnce("token");
    await expect(vault.getItem("auth.session")).resolves.toBe("token");
    expect(invoke).toHaveBeenLastCalledWith("portal_vault_get", { key: "auth.session" });

    await vault.setItem("auth.session", "novo");
    expect(invoke).toHaveBeenLastCalledWith("portal_vault_set", {
      key: "auth.session",
      value: "novo",
    });
    await vault.removeItem("auth.session");
    expect(invoke).toHaveBeenLastCalledWith("portal_vault_remove", { key: "auth.session" });
    await vault.lock();
    expect(invoke).toHaveBeenLastCalledWith("portal_vault_lock");
    expect(
      invoke.mock.calls.every(([command]) => String(command).startsWith("portal_vault_")),
    ).toBe(true);
  });

  it("palavra-passe errada recusa a abertura", async () => {
    invoke.mockRejectedValueOnce("Palavra-passe do cofre incorrecta ou cofre danificado.");
    await expect(createNativeStrongholdStore("errada")).rejects.toMatch(/incorrecta/);
  });

  it("sem palavra-passe nem chega ao Rust", async () => {
    await expect(createNativeStrongholdStore("  ")).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
});
