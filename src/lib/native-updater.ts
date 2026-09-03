import { isTauri } from "@tauri-apps/api/core";

export interface NativeUpdateInfo {
  configured: boolean;
  available: boolean;
  currentVersion?: string;
  version?: string;
  date?: string;
  body?: string;
}

function isNativeUpdaterEnabled(): boolean {
  return import.meta.env["VITE_SIGA_NATIVE_UPDATER_ENABLED"] === "true";
}

/**
 * Consulta atualizações apenas quando o updater nativo foi explicitamente ativado.
 *
 * A ativação exige também `plugins.updater.pubkey`, `plugins.updater.endpoints`
 * e artefactos assinados no pipeline de release. Enquanto essa infraestrutura
 * não estiver configurada, esta função não faz chamadas de rede nem falha o app.
 */
export async function checkNativeUpdate(): Promise<NativeUpdateInfo> {
  if (!isTauri() || !isNativeUpdaterEnabled()) {
    return { configured: false, available: false };
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();

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
 * No Windows o instalador encerra a aplicação; em macOS/Linux relança após instalar.
 */
export async function installNativeUpdate(): Promise<boolean> {
  if (!isTauri() || !isNativeUpdaterEnabled()) return false;

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return false;

  await update.downloadAndInstall();

  const platform = (await import("@tauri-apps/plugin-os").catch(() => null)) as
    | { platform?: () => string }
    | null;

  // O updater do Windows encerra o app após lançar o instalador.
  // Nos demais desktops, relançamos explicitamente quando possível.
  if (platform?.platform?.() !== "windows") {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  }

  return true;
}
