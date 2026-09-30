import { isTauri } from "@tauri-apps/api/core";

export interface NativeUpdateInfo {
  configured: boolean;
  available: boolean;
  currentVersion?: string;
  version?: string;
  date?: string;
  body?: string;
}

/**
 * O updater só existe nas versões publicadas com chave de assinatura: o Rust só regista
 * o plugin quando o `tauri.conf.json` traz `plugins.updater` (o workflow
 * `desktop-release.yml` acrescenta-o quando há `TAURI_UPDATER_PUBKEY`). Sem ele, o
 * `check()` falha com "plugin not found" — isso quer dizer "não configurado", não erro.
 *
 * Antes dependia de `VITE_SIGA_NATIVE_UPDATER_ENABLED`, uma variável da build web: como a
 * app abre o SIGA publicado, era o site que decidia, e a variável nunca foi definida.
 */
async function checkOrNull() {
  const { check } = await import("@tauri-apps/plugin-updater");
  try {
    return { configured: true, update: await check() };
  } catch (error) {
    if (/not found|not allowed|plugin/i.test(String(error))) {
      return { configured: false, update: null };
    }
    throw error;
  }
}

/** Consulta se há versão nova. Fora da app, ou sem updater configurado, não faz nada. */
export async function checkNativeUpdate(): Promise<NativeUpdateInfo> {
  if (!isTauri()) return { configured: false, available: false };

  const { configured, update } = await checkOrNull();
  if (!configured) return { configured: false, available: false };

  if (!update) {
    return { configured: true, available: false };
  }

  return {
    configured: true,
    available: true,
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date,
    body: update.body,
  };
}

/**
 * Faz download e instala a atualização encontrada.
 * No Windows, `downloadAndInstall()` encerra a aplicação ao lançar o instalador.
 * Em macOS/Linux, a execução continua e o SIGA relança explicitamente o app.
 */
export async function installNativeUpdate(): Promise<boolean> {
  if (!isTauri()) return false;

  const { update } = await checkOrNull();
  if (!update) return false;

  await update.downloadAndInstall();

  // No Windows o processo já é encerrado pelo updater antes deste ponto.
  // Nos restantes desktops, relançamos explicitamente a nova versão.
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();

  return true;
}
