import { invoke, isTauri } from "@tauri-apps/api/core";

export interface NativeSecretStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** Fecha o cofre: os segredos saem da memória até novo desbloqueio. */
  lock(): Promise<void>;
}

/**
 * Abre o cofre nativo do SIGA (Stronghold, cifrado com a palavra-passe indicada).
 *
 * O portal é remoto e não recebe o plugin Stronghold (aceita caminhos livres): os
 * comandos `portal_vault_*` gravam sempre no mesmo ficheiro da pasta de dados da app.
 * A primeira abertura cria o cofre com esta palavra-passe; as seguintes exigem a mesma.
 * Cada gravação cifra o ficheiro de novo (cerca de 1 s): guardar só o que precisa.
 *
 * A palavra-passe nunca deve ser hardcoded no bundle nem guardada em localStorage.
 */
export async function createNativeStrongholdStore(password: string): Promise<NativeSecretStore> {
  if (!isTauri()) {
    throw new Error("Stronghold só está disponível no runtime nativo do SIGA.");
  }

  if (!password.trim()) {
    throw new Error("É necessária uma palavra-passe não vazia para abrir o Stronghold.");
  }

  await invoke("portal_vault_unlock", { password });

  return {
    getItem: (key) => invoke<string | null>("portal_vault_get", { key }),
    setItem: (key, value) => invoke("portal_vault_set", { key, value }),
    removeItem: (key) => invoke("portal_vault_remove", { key }),
    lock: () => invoke("portal_vault_lock"),
  };
}
