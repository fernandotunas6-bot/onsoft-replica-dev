// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, vault } = vi.hoisted(() => ({
  invoke: vi.fn(),
  vault: { exists: false, data: new Map<string, string>() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));

import {
  desktopSessionStorage,
  isSupabaseAuthKey,
  resetDesktopSessionForTests,
  unlockDesktopSession,
} from "@/lib/desktop-session-vault";
import { DesktopVaultGate } from "@/components/layout/DesktopVaultGate";

const SESSION_KEY = "sb-xodgfmxiaunpamctfeea-auth-token";

beforeEach(() => {
  resetDesktopSessionForTests();
  window.localStorage.clear();
  vault.exists = false;
  vault.data.clear();
  invoke.mockReset();
  invoke.mockImplementation(async (command: string, args?: Record<string, string>) => {
    switch (command) {
      case "portal_vault_exists":
        return vault.exists;
      case "portal_vault_unlock":
        if (args?.password !== "123456") throw "PIN incorrecto ou cofre danificado.";
        vault.exists = true;
        return undefined;
      case "portal_vault_get":
        return vault.data.get(args!.key!) ?? null;
      case "portal_vault_set":
        vault.data.set(args!.key!, args!.value!);
        return undefined;
      case "portal_vault_remove":
        vault.data.delete(args!.key!);
        return undefined;
      case "portal_vault_reset":
        vault.exists = false;
        vault.data.clear();
        return undefined;
      default:
        throw new Error(`comando inesperado: ${command}`);
    }
  });
});
afterEach(cleanup);

describe("sessão do Supabase no cofre do posto", () => {
  it("reconhece só as chaves de sessão do supabase-js", () => {
    expect(isSupabaseAuthKey(SESSION_KEY)).toBe(true);
    expect(isSupabaseAuthKey(`${SESSION_KEY}-code-verifier`)).toBe(true);
    expect(isSupabaseAuthKey("siga-desktop-settings")).toBe(false);
    expect(isSupabaseAuthKey("sb-x-auth-token-outra")).toBe(false);
  });

  it("a leitura da sessão espera pelo PIN em vez de responder «sem sessão»", async () => {
    vault.data.set(SESSION_KEY, '{"access_token":"a"}');
    const storage = desktopSessionStorage();
    let read: string | null | undefined;
    void storage.getItem(SESSION_KEY).then((value) => (read = value));
    await Promise.resolve();
    expect(read).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();

    await unlockDesktopSession("123456");
    await waitFor(() => expect(read).toBe('{"access_token":"a"}'));
  });

  it("a sessão antiga do localStorage passa para o cofre e sai do disco em texto simples", async () => {
    window.localStorage.setItem(SESSION_KEY, '{"access_token":"antigo"}');
    window.localStorage.setItem("siga-desktop-settings", "{}");
    await unlockDesktopSession("123456");
    expect(vault.data.get(SESSION_KEY)).toBe('{"access_token":"antigo"}');
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem("siga-desktop-settings")).toBe("{}");
  });

  it("não substitui uma sessão que já está no cofre", async () => {
    vault.data.set(SESSION_KEY, "cofre");
    window.localStorage.setItem(SESSION_KEY, "antigo");
    await unlockDesktopSession("123456");
    expect(vault.data.get(SESSION_KEY)).toBe("cofre");
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("gravar e terminar sessão passam pelo cofre", async () => {
    await unlockDesktopSession("123456");
    const storage = desktopSessionStorage();
    await storage.setItem(SESSION_KEY, "novo");
    expect(vault.data.get(SESSION_KEY)).toBe("novo");
    await storage.removeItem(SESSION_KEY);
    expect(vault.data.has(SESSION_KEY)).toBe(false);
  });
});

describe("ecrã do PIN", () => {
  const pinInput = () => screen.getByLabelText("PIN");

  it("primeira vez: cria o PIN, exige a confirmação igual e fecha", async () => {
    render(<DesktopVaultGate />);
    await screen.findByText("Criar o PIN deste computador");

    fireEvent.change(pinInput(), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("Repetir o PIN"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar PIN" }));
    expect((await screen.findByRole("alert")).textContent).toContain("não coincidem");
    expect(invoke).not.toHaveBeenCalledWith("portal_vault_unlock", expect.anything());

    fireEvent.change(pinInput(), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("Repetir o PIN"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar PIN" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("PIN curto nem chega ao Rust; PIN errado mostra o erro", async () => {
    vault.exists = true;
    render(<DesktopVaultGate />);
    await screen.findByText("PIN deste computador");

    fireEvent.change(pinInput(), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect((await screen.findByRole("alert")).textContent).toContain("pelo menos 6");

    fireEvent.change(pinInput(), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("PIN incorrecto"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("«Esqueci o PIN» apaga o cofre e volta à criação", async () => {
    vault.exists = true;
    vault.data.set(SESSION_KEY, "sessao");
    render(<DesktopVaultGate />);
    fireEvent.click(await screen.findByRole("button", { name: "Esqueci o PIN" }));
    fireEvent.click(screen.getByRole("button", { name: "Apagar e criar PIN novo" }));
    await screen.findByText("Criar o PIN deste computador");
    expect(invoke).toHaveBeenCalledWith("portal_vault_reset");
    expect(vault.data.size).toBe(0);
  });
});
