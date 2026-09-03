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
  if (isTauriDesktop()) {
    try {
      const opener: any = await import(/* @vite-ignore */ "@tauri-apps/plugin-opener" as any).catch(() => null);
      if (opener?.open) {
        await opener.open(url);
        return;
      }
    } catch (e) {
      console.warn(
        "Falha ao abrir link via plugin nativo do Tauri, a usar fallback window.open",
        e,
      );
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
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
    success: true,
    message: `Modo Web: Simulação de pulso de ${direction.toUpperCase()} na catraca ${gate} (${ipAddress}).`,
    bytes_sent: 5,
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
    success: true,
    message: `Modo Web: Simulação de recibo térmico impresso em ${printerIp}.`,
    bytes_sent: text.length,
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
