import { isTauri } from "@tauri-apps/api/core";

/**
 * Utilitários para integração do SIGA com o ambiente Desktop (Tauri v2).
 */

export interface HardwareCommandResult {
  success: boolean;
  message: string;
  bytes_sent: number;
}

export interface SystemInfo {
  os_type: string;
  arch: string;
  is_desktop_native: boolean;
}

/**
 * Verifica se o SIGA está a ser executado dentro do runtime nativo do Tauri.
 */
export function isTauriDesktop(): boolean {
  return isTauri();
}

/**
 * Abre links externos no navegador padrão do sistema operativo (macOS / Windows).
 */
export async function openExternalLink(url: string): Promise<void> {
  const target = new URL(url);
  if (
    !["https:", "http:", "mailto:", "tel:"].includes(target.protocol) ||
    target.username ||
    target.password
  ) {
    throw new Error("Ligação externa não permitida.");
  }
  if (isTauriDesktop()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external_url", { url: target.href });
    return;
  }

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Envia uma notificação nativa apenas quando o SIGA está no runtime Tauri.
 * A permissão é solicitada somente quando esta função é chamada explicitamente.
 */
export async function notifyNative(title: string, body?: string): Promise<boolean> {
  if (!isTauriDesktop()) return false;

  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");

    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      permissionGranted = (await requestPermission()) === "granted";
    }

    if (!permissionGranted) return false;

    sendNotification({ title, body });
    return true;
  } catch (e) {
    console.warn("Erro ao enviar notificação nativa do SIGA", e);
    return false;
  }
}

/**
 * Aciona o relé da catraca via TCP Socket diretamente pelo Rust nativo (Desktop).
 */
export async function pulseTurnstileRelay(
  ipAddress: string,
  gate: number,
  direction: "entry" | "exit",
): Promise<HardwareCommandResult> {
  if (isTauriDesktop()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<HardwareCommandResult>("pulse_turnstile_relay", {
        ipAddress,
        gate,
        direction,
      });
    } catch (e) {
      console.warn("Erro ao invocar comando nativo pulse_turnstile_relay", e);
      return { success: false, message: String(e), bytes_sent: 0 };
    }
  }
  return {
    success: false,
    message:
      "O comando de catraca exige o SIGA Desktop ou o daemon local. Nenhum pulso foi enviado.",
    bytes_sent: 0,
  };
}

/**
 * Envia comando ESC/POS de impressão térmica via TCP Socket diretamente em Rust nativo (Desktop).
 */
export async function printThermalReceiptNative(
  printerIp: string,
  text: string,
): Promise<HardwareCommandResult> {
  if (isTauriDesktop()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<HardwareCommandResult>("print_thermal_receipt_native", {
        printerIp,
        text,
      });
    } catch (e) {
      console.warn("Erro ao invocar comando nativo print_thermal_receipt_native", e);
      return { success: false, message: String(e), bytes_sent: 0 };
    }
  }
  return {
    success: false,
    message:
      "A impressão térmica exige o SIGA Desktop ou o daemon local. Nenhum recibo foi enviado.",
    bytes_sent: 0,
  };
}

/**
 * Obtém informações nativas sobre o sistema operativo e arquitetura.
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  if (isTauriDesktop()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<SystemInfo>("get_system_info");
    } catch (e) {
      console.warn("Erro ao invocar get_system_info", e);
    }
  }
  return {
    os_type: typeof navigator !== "undefined" ? navigator.platform : "web",
    arch: "unknown",
    is_desktop_native: false,
  };
}
