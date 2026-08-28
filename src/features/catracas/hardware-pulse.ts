/**
 * Resolução local do alvo de pulso de catraca (sem rede).
 * Preferência: IP do dispositivo SGA → definições desktop → simulação localhost.
 */

export type TurnstileDeviceLite = {
  id: string;
  ip_address?: string | null;
  name?: string | null;
};

export type DesktopHardwarePrefs = {
  turnstileIp?: string;
};

export const DESKTOP_SETTINGS_STORAGE_KEY = "siga-desktop-settings";

export function loadDesktopHardwarePrefs(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null,
): DesktopHardwarePrefs {
  if (!storage) return {};
  try {
    const raw = storage.getItem(DESKTOP_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DesktopHardwarePrefs;
    const turnstileIp =
      typeof parsed.turnstileIp === "string" ? parsed.turnstileIp.trim() : undefined;
    return turnstileIp ? { turnstileIp } : {};
  } catch {
    return {};
  }
}

/** Escolhe IP TCP para o relé: dispositivo com IP, senão preferência desktop, senão loopback. */
export function resolveTurnstilePulseIp(options: {
  devices?: TurnstileDeviceLite[] | undefined;
  preferredDeviceId?: string | null | undefined;
  desktopPrefs?: DesktopHardwarePrefs | undefined;
}): { ipAddress: string; source: "device" | "desktop" | "loopback"; deviceId?: string } {
  const devices = options.devices ?? [];
  const preferred = options.preferredDeviceId
    ? devices.find((d) => d.id === options.preferredDeviceId)
    : undefined;
  const withIp = (d: TurnstileDeviceLite | undefined) =>
    d?.ip_address && String(d.ip_address).trim() ? String(d.ip_address).trim() : null;

  const fromPreferred = withIp(preferred);
  if (fromPreferred && preferred) {
    return { ipAddress: fromPreferred, source: "device", deviceId: preferred.id };
  }

  const firstWithIp = devices.find((d) => withIp(d));
  const fromFirst = withIp(firstWithIp);
  if (fromFirst && firstWithIp) {
    return { ipAddress: fromFirst, source: "device", deviceId: firstWithIp.id };
  }

  const desktopIp = options.desktopPrefs?.turnstileIp?.trim();
  if (desktopIp) {
    return { ipAddress: desktopIp, source: "desktop" };
  }

  return { ipAddress: "127.0.0.1", source: "loopback" };
}
