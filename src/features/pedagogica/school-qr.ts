/**
 * QR da escola para a presença dos professores: formato, assinatura e regras.
 *
 * Um só QR para todos os professores da escola, mostrado pela Direcção num ecrã
 * (muda a cada `rotationSeconds`) ou impresso para a semana. O professor lê-o no
 * portal antes da aula; o servidor confirma a assinatura, a hora e a zona da escola.
 *
 * Código puro (Web Crypto): corre no servidor, no ecrã da Direcção (que gera o QR
 * sem rede durante o dia, a partir da chave do dia) e nos testes.
 *
 *   SIGAP1.<escola>.<R|P>.<passo>.<mac>
 *   R (rotativo): passo = floor(unix / rotationSeconds); mac com a chave do dia
 *   P (impresso): passo = segunda-feira da semana, AAAAMMDD; mac com a chave da semana
 */

export const SCHOOL_QR_PREFIX = "SIGAP1";
export type SchoolQrKind = "rotating" | "printed";

export type ParsedSchoolQr = {
  schoolId: string;
  kind: SchoolQrKind;
  step: number;
  mac: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSchoolQr(raw: string): ParsedSchoolQr | null {
  const parts = String(raw ?? "")
    .trim()
    .split(".");
  if (parts.length !== 5 || parts[0] !== SCHOOL_QR_PREFIX) return null;
  const [, schoolId, kindCode, stepText, mac] = parts as [string, string, string, string, string];
  if (!UUID.test(schoolId)) return null;
  if (kindCode !== "R" && kindCode !== "P") return null;
  if (!/^\d{1,12}$/.test(stepText)) return null;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(mac)) return null;
  return {
    schoolId: schoolId.toLowerCase(),
    kind: kindCode === "R" ? "rotating" : "printed",
    step: Number(stepText),
    mac,
  };
}

export function formatSchoolQr(input: Omit<ParsedSchoolQr, "mac">, mac: string) {
  return [
    SCHOOL_QR_PREFIX,
    input.schoolId.toLowerCase(),
    input.kind === "rotating" ? "R" : "P",
    String(input.step),
    mac,
  ].join(".");
}

// ── Base64url e HMAC (Web Crypto) ─────────────────────────────────────────────

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary =
    typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

/** Chave do dia (ecrã da Direcção). Derivada do segredo da escola; vale só nesse dia. */
export async function schoolQrDayKey(secret: string, date: string, version: number) {
  return bytesToBase64Url(
    await hmac(base64UrlToBytes(secret), `siga-presence:day:${date}:v${version}`),
  );
}

/** Chave da semana do QR impresso (só no servidor). */
export async function schoolQrWeekKey(secret: string, monday: string, version: number) {
  return bytesToBase64Url(
    await hmac(base64UrlToBytes(secret), `siga-presence:print:${monday}:v${version}`),
  );
}

export async function schoolQrMac(
  key: string,
  input: { schoolId: string; kind: SchoolQrKind; step: number },
) {
  const message = `${input.schoolId.toLowerCase()}.${input.kind === "rotating" ? "R" : "P"}.${input.step}`;
  return bytesToBase64Url(await hmac(base64UrlToBytes(key), message)).slice(0, 22);
}

/** Comparação em tempo constante (o mac é curto, mas não damos pistas). */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Datas de Luanda ───────────────────────────────────────────────────────────

const LUANDA_OFFSET_MS = 60 * 60 * 1000; // UTC+1 todo o ano (sem hora de Verão)

export function luandaDateOf(ms: number): string {
  return new Date(ms + LUANDA_OFFSET_MS).toISOString().slice(0, 10);
}

export function luandaTimeOfMs(ms: number): string {
  return new Date(ms + LUANDA_OFFSET_MS).toISOString().slice(11, 16);
}

/** Segunda-feira (AAAA-MM-DD) da semana de uma data. */
export function mondayOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  const weekday = day.getUTCDay(); // 0 = domingo
  day.setUTCDate(day.getUTCDate() - ((weekday + 6) % 7));
  return day.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export function printedStepOf(monday: string) {
  return Number(monday.replaceAll("-", ""));
}

export function mondayOfPrintedStep(step: number): string | null {
  const text = String(step);
  if (!/^\d{8}$/.test(text)) return null;
  const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return mondayOf(iso) === iso ? iso : null;
}

export function rotatingStepAt(ms: number, rotationSeconds: number) {
  return Math.floor(ms / 1000 / rotationSeconds);
}

/** Gera o QR rotativo do momento (ecrã da Direcção). */
export async function rotatingSchoolQrAt(input: {
  schoolId: string;
  dayKey: string;
  rotationSeconds: number;
  nowMs: number;
}) {
  const step = rotatingStepAt(input.nowMs, input.rotationSeconds);
  const mac = await schoolQrMac(input.dayKey, {
    schoolId: input.schoolId,
    kind: "rotating",
    step,
  });
  return {
    token: formatSchoolQr({ schoolId: input.schoolId, kind: "rotating", step }, mac),
    step,
    expiresAtMs: (step + 1) * input.rotationSeconds * 1000,
  };
}

// ── Distância e decisão ───────────────────────────────────────────────────────

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

export type PresenceScanReason =
  | "qr_expirado"
  | "qr_do_futuro"
  | "offline_expirado"
  | "qr_impresso_desactivado"
  | "qr_impresso_fora_da_semana"
  | "hora_do_aparelho_inconsistente"
  | "leitura_offline"
  | "sem_localizacao"
  | "localizacao_imprecisa"
  | "localizacao_falsa"
  | "fora_da_escola"
  | "zona_por_definir"
  | "aparelho_partilhado";

export const PRESENCE_SCAN_REASON_LABELS: Record<PresenceScanReason, string> = {
  qr_expirado: "QR já expirado: leia o QR que está no ecrã agora",
  qr_do_futuro: "QR com hora à frente do servidor",
  offline_expirado: "Leitura enviada tarde demais",
  qr_impresso_desactivado: "A escola não aceita o QR impresso",
  qr_impresso_fora_da_semana: "QR impresso de outra semana",
  hora_do_aparelho_inconsistente: "Hora do telemóvel não bate com a do QR",
  leitura_offline: "Lida sem rede e enviada depois",
  sem_localizacao: "Sem localização",
  localizacao_imprecisa: "Localização imprecisa",
  localizacao_falsa: "Localização falsa detectada no telemóvel",
  fora_da_escola: "Fora da zona da escola",
  zona_por_definir: "Zona da escola por definir",
  aparelho_partilhado: "Telemóvel já usado hoje por outro professor",
};

/**
 * Motivos curtos para a lista da Direcção (os longos falam com o professor). `null`
 * esconde o motivo: já se vê noutra parte da linha.
 */
export const PRESENCE_SCAN_REASON_SHORT: Record<PresenceScanReason, string | null> = {
  qr_expirado: "QR expirado",
  qr_do_futuro: "QR com hora errada",
  offline_expirado: "Enviada fora do prazo",
  qr_impresso_desactivado: "QR impresso não aceite",
  qr_impresso_fora_da_semana: "QR impresso de outra semana",
  hora_do_aparelho_inconsistente: "Hora do telemóvel não bate certo",
  leitura_offline: null,
  sem_localizacao: "Sem localização",
  localizacao_imprecisa: "Localização imprecisa",
  localizacao_falsa: "Localização falsa",
  fora_da_escola: "Fora da escola",
  zona_por_definir: "Zona por definir",
  aparelho_partilhado: "Telemóvel partilhado",
};

export type PresenceDecision = "accepted" | "review" | "rejected";

export type PresenceScanSettings = {
  rotationSeconds: number;
  allowPrinted: boolean;
  requireLocation: boolean;
  offlineMaxHours: number;
  center: { latitude: number; longitude: number } | null;
  radiusM: number;
};

export type PresenceScanEvidence = {
  kind: SchoolQrKind;
  step: number;
  /** Hora do servidor ao receber. */
  receivedAtMs: number;
  /** Leitura guardada sem rede e enviada depois. */
  offline: boolean;
  /** Hora do aparelho no momento da leitura e no momento do envio (offline). */
  deviceScannedAtMs?: number | null;
  deviceNowMs?: number | null;
  location?: {
    latitude: number;
    longitude: number;
    accuracyM?: number | null;
    mocked?: boolean | null;
  } | null;
  /**
   * O mesmo telemóvel já leu o QR hoje com a conta de outro professor: um colega
   * pode estar a marcar por quem não veio.
   */
  sharedDevice?: boolean;
};

/** Tolerância de relógio entre o ecrã, o telemóvel e o servidor. */
const CLOCK_SLACK_MS = 60_000;
const MAX_USEFUL_ACCURACY_M = 500;

export function decidePresenceScan(
  evidence: PresenceScanEvidence,
  settings: PresenceScanSettings,
): {
  decision: PresenceDecision;
  reasons: PresenceScanReason[];
  scannedAtMs: number;
  distanceM: number | null;
  insideGeofence: boolean | null;
} {
  const reasons: PresenceScanReason[] = [];
  let rejected = false;
  let review = false;
  const received = evidence.receivedAtMs;

  // Hora da leitura: online, a do servidor; offline, a do aparelho corrigida pelo
  // desvio do relógio dele no envio (mudar a hora do telemóvel não engana).
  let scannedAt = received;
  const deviceSkew =
    evidence.deviceNowMs != null && Number.isFinite(evidence.deviceNowMs)
      ? evidence.deviceNowMs - received
      : 0;
  if (evidence.offline) {
    reasons.push("leitura_offline");
    if (evidence.deviceScannedAtMs != null && Number.isFinite(evidence.deviceScannedAtMs)) {
      scannedAt = Math.min(received, evidence.deviceScannedAtMs - deviceSkew);
    }
  }

  if (evidence.kind === "rotating") {
    const rotationMs = settings.rotationSeconds * 1000;
    const qrStart = evidence.step * rotationMs;
    const qrEnd = qrStart + rotationMs;
    if (qrStart > received + CLOCK_SLACK_MS) {
      rejected = true;
      reasons.push("qr_do_futuro");
    } else if (evidence.offline) {
      if (received - qrStart > settings.offlineMaxHours * 3_600_000) {
        rejected = true;
        reasons.push("offline_expirado");
      } else if (
        scannedAt < qrStart - CLOCK_SLACK_MS * 2 ||
        scannedAt > qrEnd + rotationMs + CLOCK_SLACK_MS * 2
      ) {
        review = true;
        reasons.push("hora_do_aparelho_inconsistente");
      }
      // O QR diz quando foi mostrado: a leitura fica nessa janela.
      scannedAt = Math.min(Math.max(scannedAt, qrStart), qrEnd + rotationMs);
    } else if (received > qrEnd + rotationMs + CLOCK_SLACK_MS) {
      rejected = true;
      reasons.push("qr_expirado");
    }
  } else {
    if (!settings.allowPrinted) {
      rejected = true;
      reasons.push("qr_impresso_desactivado");
    }
    const monday = mondayOfPrintedStep(evidence.step);
    const scanDate = luandaDateOf(scannedAt);
    if (!monday || scanDate < monday || scanDate > addDays(monday, 6)) {
      rejected = true;
      reasons.push("qr_impresso_fora_da_semana");
    }
    if (evidence.offline && received - scannedAt > settings.offlineMaxHours * 3_600_000) {
      rejected = true;
      reasons.push("offline_expirado");
    }
  }

  // Localização: a prova de que o professor estava na escola.
  let distanceM: number | null = null;
  let insideGeofence: boolean | null = null;
  const location = evidence.location;
  const locationRequired =
    settings.requireLocation || evidence.kind === "printed" || evidence.offline;
  if (!location) {
    if (locationRequired) {
      review = true;
      reasons.push("sem_localizacao");
    }
  } else {
    if (location.mocked) {
      review = true;
      reasons.push("localizacao_falsa");
    }
    const accuracy = location.accuracyM ?? null;
    if (accuracy != null && accuracy > MAX_USEFUL_ACCURACY_M && locationRequired) {
      review = true;
      reasons.push("localizacao_imprecisa");
    }
    if (settings.center) {
      distanceM = distanceMeters(settings.center, location);
      insideGeofence = distanceM <= settings.radiusM + Math.min(accuracy ?? 0, 150);
      if (!insideGeofence) {
        review = true;
        reasons.push("fora_da_escola");
      }
    }
  }
  if (evidence.sharedDevice) {
    review = true;
    reasons.push("aparelho_partilhado");
  }
  if (!settings.center) {
    reasons.push("zona_por_definir");
    // O QR impresso só vale com a zona: sem ela, uma fotografia servia a semana toda.
    if (evidence.kind === "printed") review = true;
  }

  return {
    decision: rejected ? "rejected" : review ? "review" : "accepted",
    reasons,
    scannedAtMs: scannedAt,
    distanceM,
    insideGeofence,
  };
}

export type SchoolPresenceMode = "off" | "button" | "qr";

export const SCHOOL_PRESENCE_MODE_LABELS: Record<SchoolPresenceMode, string> = {
  qr: "QR da escola obrigatório",
  button: "Só o botão «Estou na sala»",
  off: "Desligado",
};
