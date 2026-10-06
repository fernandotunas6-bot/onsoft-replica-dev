/**
 * Dispositivo reconhecido: depois de uma verificação 2FA (chave de acesso ou
 * código), este navegador fica reconhecido durante 30 dias e a sessão deixa de
 * terminar por inactividade. Não há caixa para marcar: é o comportamento normal.
 *
 * Não salta o 2FA. A sessão continua a ser a mesma sessão aal2 do Supabase (o
 * refresh token preserva o nível); só deixa de ser terminada aos 30 minutos.
 * As acções críticas pedem à parte uma confirmação recente (`lib/step-up.ts`).
 *
 * Volta a pedir a verificação quando há sinal de que pode não ser a mesma
 * pessoa no mesmo dispositivo:
 *  - passaram 30 dias desde a última verificação;
 *  - o navegador ou o sistema operativo deixaram de ser os mesmos;
 *  - a pessoa terminou a sessão (esquece o reconhecimento);
 *  - a senha mudou ou «terminar em todos os dispositivos» (o Supabase revoga
 *    o refresh token e a sessão cai sozinha).
 */
export const TRUSTED_DEVICE_DAYS = 30;
const TRUST_MS = TRUSTED_DEVICE_DAYS * 24 * 60 * 60_000;

/** Sem reconhecimento (conta sem 2FA), a sessão termina após 30 minutos sem actividade. */
export const SHARED_DEVICE_IDLE_MS = 30 * 60_000;

const trustKey = (userId: string) => `siga:trusted-device:${userId}`;

/**
 * Impressão grosseira do dispositivo: família do navegador e sistema. Não usa
 * a versão (as actualizações do navegador não devem pedir 2FA) nem o fuso
 * horário (viajar não é sinal de ataque).
 */
export function deviceFingerprint(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
): string {
  const os = /iPhone|iPad/i.test(userAgent)
    ? "ios"
    : /Android/i.test(userAgent)
      ? "android"
      : /Mac OS X/i.test(userAgent)
        ? "mac"
        : /Windows/i.test(userAgent)
          ? "windows"
          : /Linux|CrOS/i.test(userAgent)
            ? "linux"
            : "other";
  const browser = /Edg\//.test(userAgent)
    ? "edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "opera"
      : /Firefox\//.test(userAgent)
        ? "firefox"
        : /Chrome\/|CriOS\//.test(userAgent)
          ? "chrome"
          : /Safari\//.test(userAgent)
            ? "safari"
            : "other";
  return `${os}:${browser}`;
}

type TrustRecord = { until: number; fp: string };

function read(userId: string): TrustRecord | null {
  try {
    const raw = localStorage.getItem(trustKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TrustRecord>;
    const until = Number(parsed.until);
    if (!Number.isFinite(until) || until <= 0 || typeof parsed.fp !== "string") return null;
    return { until, fp: parsed.fp };
  } catch {
    return null;
  }
}

export function trustDevice(userId: string, now = Date.now(), fp = deviceFingerprint()) {
  try {
    const record: TrustRecord = { until: now + TRUST_MS, fp };
    localStorage.setItem(trustKey(userId), JSON.stringify(record));
  } catch {
    // Sem armazenamento: fica sem reconhecimento.
  }
}

export function forgetTrustedDevice(userId: string) {
  try {
    localStorage.removeItem(trustKey(userId));
  } catch {
    // ignore
  }
}

/** Esquece o reconhecimento de todas as contas neste navegador (ao terminar sessão). */
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

/**
 * `trusted`: reconhecido; `expired`: passaram 30 dias; `changed`: outro
 * navegador ou sistema (sinal de risco); `shared`: nunca reconhecido.
 */
export type DeviceTrust = "trusted" | "expired" | "changed" | "shared";

export function deviceTrust(
  userId: string,
  now = Date.now(),
  fp = deviceFingerprint(),
): DeviceTrust {
  const record = read(userId);
  if (record === null) return "shared";
  if (record.fp !== fp) return "changed";
  return now < record.until ? "trusted" : "expired";
}
