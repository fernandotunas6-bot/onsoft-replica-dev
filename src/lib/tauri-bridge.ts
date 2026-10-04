import { invoke, isTauri } from "@tauri-apps/api/core";

const PYTHON_BRIDGE_BASE = "http://127.0.0.1:8088";

/** O WebView HTTPS usa IPC; só o navegador de desenvolvimento faz HTTP directo. */
async function requestHardwareBridge(path: string, options: RequestInit): Promise<Response> {
  if (isTauriDesktop()) {
    const result = await invoke<{ status: number; body: string }>("hardware_bridge_request", {
      path,
      method: options.method ?? "GET",
      body: typeof options.body === "string" ? options.body : null,
    });
    return new Response(result.body, {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return fetch(`${PYTHON_BRIDGE_BASE}${path}`, options);
}

export interface HardwarePulseOptions {
  ipAddress: string;
  gate?: number;
  direction?: "entry" | "exit";
  /** Id da allowlist local (ex.: serial:/dev/ttyUSB0); se enviado, o daemon exige autorização. */
  deviceId?: string;
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

export interface LocalHardwareDevice {
  id: string;
  kind: string;
  path: string;
  label: string;
  vendor_id?: string | null;
  product_id?: string | null;
  platform?: string;
}

export interface LocalHardwareDiscoverResult {
  ok: boolean;
  platform?: string;
  machine?: string;
  privacy?: {
    scope: string;
    scans_home: boolean;
    scans_browser: boolean;
    leaves_host: boolean;
  };
  devices: LocalHardwareDevice[];
  counts?: { serial_usb: number; cups_printer: number };
  error?: string;
}

export interface LocalHardwareAllowlist {
  ok?: boolean;
  devices: LocalHardwareDevice[];
  updated_at?: string | null;
  error?: string;
}

/** Detecta se o SIGA está a ser executado dentro do Tauri 2 Desktop Nativo */
export function isTauriDesktop(): boolean {
  return isTauri();
}

/** dispara relé de catraca usando Rust nativo no Tauri 2 ou fallback HTTP Python */
export async function triggerTurnstileRelay(options: HardwarePulseOptions) {
  const ip = options.ipAddress || "127.0.0.1";
  const gate = options.gate ?? 1;
  const direction = options.direction ?? "entry";

  if (!Number.isInteger(gate) || gate < 1 || gate > 255 || !["entry", "exit"].includes(direction)) {
    throw new Error("Catraca ou direcção inválida.");
  }
  // Um deviceId local exige a allowlist do daemon; nunca contornar essa autorização.
  if (isTauriDesktop() && !options.deviceId) {
    const res = await invoke<{ success: boolean; message: string; bytes_sent: number }>(
      "pulse_turnstile_relay",
      { ipAddress: ip, gate, direction },
    );
    if (!res.success) throw new Error(res.message);
    return { source: "tauri_rust_native", ...res };
  }

  // Fallback para Daemon Python HTTP local (só 127.0.0.1)
  const response = await requestHardwareBridge("/hardware/turnstile/open", {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ip_address: ip,
      gate,
      direction,
      ...(options.deviceId ? { device_id: options.deviceId } : {}),
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `Bridge HTTP ${response.status}`);
  }
  if (data.result?.status !== "success") {
    throw new Error(
      data.result?.error ||
        data.result?.note ||
        data.result?.message ||
        "Nenhum pulso físico confirmado pelo daemon.",
    );
  }
  return { source: "python_http_daemon", ...data.result };
}

/** Imprime recibo térmico via Rust nativo no Tauri 2 ou fallback HTTP Python */
export async function printThermalReceiptNative(options: ThermalPrintOptions) {
  if (!options.receiptText.trim() || new TextEncoder().encode(options.receiptText).length > 65536) {
    throw new Error("Texto de impressão vazio ou demasiado longo.");
  }
  if (isTauriDesktop()) {
    const res = await invoke<{ success: boolean; message: string; bytes_sent: number }>(
      "print_thermal_receipt_native",
      { printerIp: options.printerIp, text: options.receiptText },
    );
    if (!res.success) throw new Error(res.message);
    return { source: "tauri_rust_native", ...res };
  }

  const response = await requestHardwareBridge("/hardware/printer/thermal", {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      printer_ip: options.printerIp,
      receipt_text: options.receiptText,
    }),
  });
  const data = await response.json();
  if (!response.ok || data.printer_result?.status !== "success") {
    throw new Error(
      data.error ||
        data.printer_result?.error ||
        data.printer_result?.note ||
        "A impressão física não foi confirmada pelo daemon.",
    );
  }
  return {
    source: "python_http_daemon",
    ...data,
    message: "Dados de impressão enviados à impressora.",
  };
}

/** Descobre USB-série + impressoras CUPS via daemon Python local (sem sair do host). */
export async function discoverLocalHardwareDevices(): Promise<LocalHardwareDiscoverResult> {
  try {
    const response = await requestHardwareBridge("/hardware/discover", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return {
        ok: false,
        devices: [],
        error: `Daemon inacessível (HTTP ${response.status}). Corra: python3 python/hardware_bridge/siga_hardware_bridge.py`,
      };
    }
    return (await response.json()) as LocalHardwareDiscoverResult;
  } catch {
    return {
      ok: false,
      devices: [],
      error:
        "Daemon Python offline em 127.0.0.1:8088. Arranque o bridge localmente — a lista não é enviada para a cloud.",
    };
  }
}

/** Lê a allowlist local do daemon (ficheiro JSON no PC, nunca na cloud). */
export async function getLocalHardwareAllowlist(): Promise<LocalHardwareAllowlist> {
  try {
    const response = await requestHardwareBridge("/hardware/allowlist", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { devices: [], error: `HTTP ${response.status}` };
    }
    return (await response.json()) as LocalHardwareAllowlist;
  } catch {
    return { devices: [], error: "Daemon Python offline" };
  }
}

/** Guarda a allowlist no disco local do daemon. */
export async function saveLocalHardwareAllowlist(
  devices: LocalHardwareDevice[],
): Promise<LocalHardwareAllowlist> {
  const response = await requestHardwareBridge("/hardware/allowlist", {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      devices: devices.map((d) => ({
        id: d.id,
        kind: d.kind,
        path: d.path,
        label: d.label,
      })),
    }),
  });
  const data = (await response.json()) as LocalHardwareAllowlist;
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

export interface LocalHardwareBridgeConfig {
  ok?: boolean;
  siga_app_url?: string;
  device_api_key?: string;
  turnstile_ip?: string;
  default_direction?: "entry" | "exit";
  error?: string;
}

/** Lê URL SIGA + API key do dispositivo guardados no daemon local. */
export async function getLocalHardwareBridgeConfig(): Promise<LocalHardwareBridgeConfig> {
  try {
    const response = await requestHardwareBridge("/hardware/bridge-config", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }
    return (await response.json()) as LocalHardwareBridgeConfig;
  } catch {
    return { error: "Daemon Python offline" };
  }
}

/** Guarda ligação SIGA ↔ daemon para webhooks físicos locais. */
export async function saveLocalHardwareBridgeConfig(
  config: Pick<LocalHardwareBridgeConfig, "siga_app_url" | "device_api_key" | "turnstile_ip">,
): Promise<LocalHardwareBridgeConfig> {
  const response = await requestHardwareBridge("/hardware/bridge-config", {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = (await response.json()) as LocalHardwareBridgeConfig;
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

export type HardwareBridgeHealth = {
  online: boolean;
  service?: string;
  bind?: string;
  local_discovery?: string;
  error?: string;
};

/** Estado do daemon Python em 127.0.0.1:8088 (nunca sai do host). */
export async function checkPythonHardwareBridgeHealth(): Promise<HardwareBridgeHealth> {
  try {
    const response = await requestHardwareBridge("/health", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      return { online: false, error: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as {
      service?: string;
      bind?: string;
      hardware?: { local_discovery?: string };
    };
    if (data.service !== "SIGA Python Hardware Bridge") {
      return { online: false, error: "O serviço local não é o daemon SIGA esperado." };
    }
    return {
      online: true,
      ...(data.service !== undefined ? { service: data.service } : {}),
      ...(data.bind !== undefined ? { bind: data.bind } : {}),
      ...(data.hardware?.local_discovery !== undefined
        ? { local_discovery: data.hardware.local_discovery }
        : {}),
    };
  } catch (err) {
    return {
      online: false,
      error: err instanceof Error ? err.message : "Daemon offline",
    };
  }
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
      typeof navigator === "undefined"
        ? "web"
        : /Win/i.test(navigator.userAgent)
          ? "windows"
          : /Mac/i.test(navigator.userAgent)
            ? "macos"
            : /Linux/i.test(navigator.userAgent)
              ? "linux"
              : "web",
    arch: "unknown",
    is_desktop_native: false,
  };
}
