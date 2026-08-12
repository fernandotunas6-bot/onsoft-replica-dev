const SETTINGS_OPEN_KEY = "siga:open-settings";
export const OPEN_SETTINGS_EVENT = "siga:open-settings-panel";

export function requestSettingsOpen(panelId?: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SETTINGS_OPEN_KEY, panelId ?? "");
}

export function openSettingsPanel(panelId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { panelId } }));
}

export function consumeSettingsOpen() {
  if (typeof sessionStorage === "undefined") return undefined;
  const raw = sessionStorage.getItem(SETTINGS_OPEN_KEY);
  if (raw === null) return undefined;
  sessionStorage.removeItem(SETTINGS_OPEN_KEY);
  return raw || undefined;
}
