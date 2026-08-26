import { invoke } from "@tauri-apps/api/core";

export interface HardwarePulseOptions {
  ipAddress: string;
  gate?: number;
  direction?: "entry" | "exit";
}

export interface ThermalPrintOptions {
  printerIp: string;
  receiptText: string;
}

export interface SystemInfoResult {
  os_type: string;
  arch: string;
  is_desktop_native: boolean;
}

/** Detecta se o SIGA está a ser executado dentro do Tauri 2 Desktop Nativo */
export function isTauriDesktop(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

/** dispara relé de catraca usando Rust nativo no Tauri 2 ou fallback HTTP Python */
export async function triggerTurnstileRelay(options: HardwarePulseOptions) {
  const ip = options.ipAddress || "127.0.0.1";
  const gate = options.gate ?? 1;
  const direction = options.direction ?? "entry";

  if (isTauriDesktop()) {
    try {
      const res = await invoke<{ success: boolean; message: string; bytes_sent: number }>(
        "pulse_turnstile_relay",
        {
          ipAddress: ip,
          gate,
          direction,
        },
      );
      return { source: "tauri_rust_native", ...res };
    } catch (err) {
      console.warn("Tauri Native call failed, attempting Python HTTP fallback", err);
    }
  }

  // Fallback para Daemon Python HTTP local
  const response = await fetch("http://localhost:8088/hardware/turnstile/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip_address: ip, gate, direction }),
  });
  const data = await response.json();
  return { source: "python_http_daemon", ...data.result };
}

/** Imprime recibo térmico via Rust nativo no Tauri 2 ou fallback HTTP Python */
export async function printThermalReceiptNative(options: ThermalPrintOptions) {
  if (isTauriDesktop()) {
    try {
      const res = await invoke<{ success: boolean; message: string; bytes_sent: number }>(
        "print_thermal_receipt_native",
        {
          printerIp: options.printerIp,
          text: options.receiptText,
        },
      );
      return { source: "tauri_rust_native", ...res };
    } catch (err) {
      console.warn("Tauri Native print failed, attempting Python HTTP fallback", err);
    }
  }

  const response = await fetch("http://localhost:8088/hardware/printer/thermal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      printer_ip: options.printerIp,
      receipt_no: "REC-NATIVE",
      amount: "0,00",
    }),
  });
  const data = await response.json();
  return { source: "python_http_daemon", ...data };
}

/** Obtém detalhes do sistema operativo nativo (Windows / macOS / Linux) */
export async function getNativeSystemInfo(): Promise<SystemInfoResult> {
  if (isTauriDesktop()) {
    try {
      return await invoke<SystemInfoResult>("get_system_info");
    } catch {
      // fallback
    }
  }
  return {
    os_type:
      typeof window !== "undefined" && navigator.userAgent.includes("Win") ? "windows" : "macos",
    arch: "x86_64",
    is_desktop_native: false,
  };
}

/** Minimiza a janela nativa do Windows/macOS */
export async function minimizeWindow() {
  if (isTauriDesktop()) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch (e) {
      console.warn("Failed to minimize window", e);
    }
  }
}

/** Alterna entre maximizado e tamanho normal da janela */
export async function toggleMaximizeWindow() {
  if (isTauriDesktop()) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      console.warn("Failed to toggle maximize window", e);
    }
  }
}

/** Fecha a janela nativa do aplicativo */
export async function closeWindow() {
  if (isTauriDesktop()) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch (e) {
      console.warn("Failed to close window", e);
    }
  }
}
