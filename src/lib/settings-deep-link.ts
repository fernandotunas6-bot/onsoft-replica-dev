const SETTINGS_OPEN_KEY = "siga:open-settings";
export const OPEN_SETTINGS_EVENT = "siga:open-settings-panel";

export function requestSettingsOpen(panelId?: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SETTINGS_OPEN_KEY, panelId ?? "");
}

/**
 * Abre o painel de Definições por cima do ecrã actual. Devolve `true` quando
 * o `AppShell` o abriu (cancela o evento); `false` sem AppShell ou sem acesso.
 */
export function openSettingsPanel(panelId?: string): boolean {
  if (typeof window === "undefined") return false;
  const event = new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { panelId }, cancelable: true });
  return !window.dispatchEvent(event);
}

export function consumeSettingsOpen() {
  if (typeof sessionStorage === "undefined") return undefined;
  const raw = sessionStorage.getItem(SETTINGS_OPEN_KEY);
  if (raw === null) return undefined;
  sessionStorage.removeItem(SETTINGS_OPEN_KEY);
  return raw || undefined;
}
