/**
 * Dispositivo de confiança: depois do 2FA, quem marcar «Confiar neste
 * dispositivo» não volta a ser posto fora por inactividade durante 30 dias.
 *
 * Não salta o 2FA: a sessão continua a ser a mesma sessão aal2 do Supabase
 * (o refresh token preserva o nível), só deixa de ser terminada aos 30 minutos
 * sem actividade. Ao fim dos 30 dias a sessão termina e o código volta a ser
 * pedido. Terminar a sessão esquece a confiança.
 */
export const TRUSTED_DEVICE_DAYS = 30;
const TRUST_MS = TRUSTED_DEVICE_DAYS * 24 * 60 * 60_000;

/** Num computador partilhado, a sessão termina após 30 minutos sem actividade. */
export const SHARED_DEVICE_IDLE_MS = 30 * 60_000;

const trustKey = (userId: string) => `siga:trusted-device:${userId}`;

function read(userId: string): number | null {
  try {
    const value = Number(localStorage.getItem(trustKey(userId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function trustDevice(userId: string, now = Date.now()) {
  try {
    localStorage.setItem(trustKey(userId), String(now + TRUST_MS));
  } catch {
    // Sem armazenamento: fica como computador partilhado.
  }
}

export function forgetTrustedDevice(userId: string) {
  try {
    localStorage.removeItem(trustKey(userId));
  } catch {
    // ignore
  }
}

/** Esquece a confiança de todas as contas neste navegador (ao terminar sessão). */
export function forgetAllTrustedDevices() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith("siga:trusted-device:")) localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export type DeviceTrust = "trusted" | "expired" | "shared";

export function deviceTrust(userId: string, now = Date.now()): DeviceTrust {
  const until = read(userId);
  if (until === null) return "shared";
  return now < until ? "trusted" : "expired";
}
