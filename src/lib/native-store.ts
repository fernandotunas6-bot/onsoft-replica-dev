import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Definições guardadas nesta máquina (IPs de catracas e impressoras, preferências do
 * posto). Na app desktop, a fonte é o ficheiro nativo da app (plugin Store, comandos
 * `portal_store_*`), que sobrevive a limpezas do WebView; o localStorage fica como
 * cópia para leituras síncronas (ex.: `loadDesktopHardwarePrefs`). No navegador, só
 * localStorage.
 *
 * Chaves: letras, números e `-_.:`, até 128 caracteres. Valores JSON até 64 KiB.
 */
export async function loadNativeSetting<T>(key: string): Promise<T | null> {
  if (!isTauri()) return readLocal<T>(key);
  const stored = await invoke<T | null>("portal_store_get", { key });
  if (stored !== null) {
    writeLocal(key, stored);
    return stored;
  }
  // Definições gravadas antes de existir o ficheiro nativo: migrar uma vez.
  const legacy = readLocal<T>(key);
  if (legacy !== null) await invoke("portal_store_set", { key, value: legacy });
  return legacy;
}

export async function saveNativeSetting<T>(key: string, value: T): Promise<void> {
  if (isTauri()) await invoke("portal_store_set", { key, value });
  writeLocal(key, value);
}

export async function deleteNativeSetting(key: string): Promise<void> {
  if (isTauri()) await invoke("portal_store_delete", { key });
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Sem armazenamento local: nada a remover.
  }
}

function readLocal<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento indisponível (privado/bloqueado): fica só no ficheiro nativo.
  }
}
