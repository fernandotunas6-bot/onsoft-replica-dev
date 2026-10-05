import { isTauri } from "@tauri-apps/api/core";

export interface NativeUpdateInfo {
  configured: boolean;
  available: boolean;
  version?: string;
  body?: string;
}

type AppUpdate = {
  configured: boolean;
  available: boolean;
  version?: string | null;
  notes?: string | null;
};

/**
 * Procura uma versão nova da app desktop (comando Rust `check_app_update`).
 *
 * O portal não recebe as permissões do plugin updater: verificar e instalar são dois
 * comandos da app. Sem chave pública configurada na versão instalada, o Rust responde
 * `configured: false` sem ir à rede; fora da app não faz nada.
 */
export async function checkNativeUpdate(): Promise<NativeUpdateInfo> {
  if (!isTauri()) return { configured: false, available: false };
  const { invoke } = await import("@tauri-apps/api/core");
  const update = await invoke<AppUpdate>("check_app_update");
  return {
    configured: update.configured,
    available: update.available,
    version: update.version ?? undefined,
    body: update.notes ?? undefined,
  };
}

/**
 * Descarrega, verifica a assinatura, instala e reinicia (comando `install_app_update`).
 * No Windows o instalador fecha a app; nos outros sistemas o Rust reinicia-a.
 */
export async function installNativeUpdate(): Promise<boolean> {
  if (!isTauri()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("install_app_update");
  return true;
}

/**
 * Nunca actualizar a meio de uma escrita: com gravações por enviar, recusa e diz
 * quantas são; senão instala.
 */
export async function installNativeUpdateWhenSafe(
  pendingWrites: number,
): Promise<{ installed: boolean; waiting: number }> {
  if (pendingWrites > 0) return { installed: false, waiting: pendingWrites };
  return { installed: await installNativeUpdate(), waiting: 0 };
}
