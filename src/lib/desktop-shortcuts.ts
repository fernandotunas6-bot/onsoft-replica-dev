/**
 * Regras puras da app desktop (Tauri), separadas para teste: que links saem para o
 * browser do sistema e que teclas são atalhos.
 */

export type DesktopShortcut = "reload" | "back" | "forward" | "zoom-in" | "zoom-out" | "zoom-reset";

/**
 * Link que abre no browser do sistema: http(s) de outra origem, `mailto:` e `tel:`.
 *
 * Só a origem do portal fica dentro da janela: é a única com os comandos da app
 * (capability `school-portal`). As outras apps do ecossistema (DOC, PayFlow, ADMIN)
 * são subdomínios e abrem no browser, sem tirar a pessoa do SIGA.
 */
export function isExternalUrl(href: string, currentOrigin: string) {
  let url: URL;
  try {
    url = new URL(href, currentOrigin);
  } catch {
    return false;
  }
  if (url.protocol === "mailto:" || url.protocol === "tel:") return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.origin !== currentOrigin;
}

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

export function shortcutAction(event: KeyLike): DesktopShortcut | null {
  const mod = event.ctrlKey || event.metaKey;
  if (event.key === "F5" && !mod && !event.altKey) return "reload";
  if (mod && !event.altKey && event.key.toLowerCase() === "r") return "reload";
  if (event.altKey && !mod && event.key === "ArrowLeft") return "back";
  if (event.altKey && !mod && event.key === "ArrowRight") return "forward";
  if (mod && !event.altKey && (event.key === "=" || event.key === "+")) return "zoom-in";
  if (mod && !event.altKey && (event.key === "-" || event.key === "_")) return "zoom-out";
  if (mod && !event.altKey && event.key === "0") return "zoom-reset";
  return null;
}

const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export function nextZoom(current: number, action: "zoom-in" | "zoom-out" | "zoom-reset") {
  if (action === "zoom-reset") return 1;
  if (action === "zoom-in") return ZOOM_STEPS.find((step) => step > current + 0.001) ?? 2;
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001) ?? 0.67;
}

/** Zoom guardado: um degrau válido, ou 1. */
export function storedZoom(raw: string | null) {
  const value = Number(raw);
  return ZOOM_STEPS.includes(value) ? value : 1;
}
