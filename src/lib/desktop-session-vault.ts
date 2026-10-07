import { isTauri } from "@tauri-apps/api/core";
import { createNativeStrongholdStore, type NativeSecretStore } from "@/lib/native-stronghold";

/**
 * Sessão do Supabase na app desktop, guardada no cofre nativo (Stronghold) em vez do
 * localStorage do WebView, que fica em texto simples no disco.
 *
 * O cliente Supabase usa `desktopSessionStorage()` como `auth.storage`. Cada leitura ou
 * escrita espera que o posto desbloqueie o cofre com o PIN (`DesktopVaultGate`): até
 * lá, o arranque da autenticação fica à espera, em vez de concluir que não há sessão.
 */

let resolveVault: (store: NativeSecretStore) => void = () => undefined;
let vaultReady = new Promise<NativeSecretStore>((resolve) => {
  resolveVault = resolve;
});
let unlocked = false;

/** Chaves de sessão que o supabase-js grava (sessão e verificador PKCE do Google). */
export function isSupabaseAuthKey(key: string) {
  return /^sb-[a-z0-9]+-auth-token(-code-verifier)?$/.test(key);
}

export function isDesktopSessionRuntime() {
  return typeof window !== "undefined" && isTauri();
}

export function desktopSessionStorage() {
  return {
    getItem: async (key: string) => (await vaultReady).getItem(key),
    setItem: async (key: string, value: string) => (await vaultReady).setItem(key, value),
    removeItem: async (key: string) => (await vaultReady).removeItem(key),
  };
}

/** O cofre do posto, quando desbloqueado (a fila de envio sem rede também o usa). */
export function desktopVault(): Promise<NativeSecretStore> {
  return vaultReady;
}

export function isDesktopSessionUnlocked() {
  return unlocked;
}

/**
 * Abre o cofre com o PIN e liberta a autenticação. Uma sessão deixada no localStorage
 * por versões anteriores passa para o cofre e sai do localStorage.
 */
export async function unlockDesktopSession(pin: string): Promise<void> {
  const store = await createNativeStrongholdStore(pin);
  await moveLegacySession(store);
  unlocked = true;
  resolveVault(store);
}

async function moveLegacySession(store: NativeSecretStore) {
  let keys: string[] = [];
  try {
    keys = Object.keys(window.localStorage).filter(isSupabaseAuthKey);
  } catch {
    return;
  }
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value && (await store.getItem(key)) === null) await store.setItem(key, value);
    window.localStorage.removeItem(key);
  }
}

/** Só para testes: volta ao estado inicial (cofre por desbloquear). */
export function resetDesktopSessionForTests() {
  unlocked = false;
  vaultReady = new Promise<NativeSecretStore>((resolve) => {
    resolveVault = resolve;
  });
}
