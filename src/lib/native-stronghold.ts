import { isTauri } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { Stronghold, type Client } from "@tauri-apps/plugin-stronghold";

const SIGA_STRONGHOLD_FILE = "siga-auth.hold";
const SIGA_STRONGHOLD_CLIENT = "siga-auth";

export interface NativeSecretStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Abre o cofre nativo do SIGA usando uma palavra-passe fornecida em runtime.
 *
 * A palavra-passe nunca deve ser hardcoded no bundle nem guardada em localStorage.
 * A política de desbloqueio (credencial do utilizador, keychain/biometria, etc.) deve
 * ser definida separadamente antes de ligar este store à sessão Supabase.
 */
export async function createNativeStrongholdStore(
  password: string,
): Promise<NativeSecretStore> {
  if (!isTauri()) {
    throw new Error("Stronghold só está disponível no runtime nativo do SIGA.");
  }

  if (!password.trim()) {
    throw new Error("É necessária uma palavra-passe não vazia para abrir o Stronghold.");
  }

  const vaultPath = await join(await appDataDir(), SIGA_STRONGHOLD_FILE);
  const stronghold = await Stronghold.load(vaultPath, password);

  let client: Client;
  try {
    client = await stronghold.loadClient(SIGA_STRONGHOLD_CLIENT);
  } catch {
    client = await stronghold.createClient(SIGA_STRONGHOLD_CLIENT);
  }

  const store = client.getStore();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return {
    async getItem(key: string): Promise<string | null> {
      const value = await store.get(key);
      return value ? decoder.decode(value) : null;
    },

    async setItem(key: string, value: string): Promise<void> {
      await store.insert(key, Array.from(encoder.encode(value)));
      await stronghold.save();
    },

    async removeItem(key: string): Promise<void> {
      await store.remove(key);
      await stronghold.save();
    },
  };
}
