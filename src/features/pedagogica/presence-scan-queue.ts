/**
 * Fila das leituras do QR da escola feitas sem rede (zonas remotas). Cada leitura
 * guarda a hora do telemóvel e a localização no momento em que foi feita, e é
 * enviada quando voltar a internet. O servidor corrige a hora do telemóvel e
 * recusa o que chegar depois do prazo da escola (72 h por omissão).
 */
export type QueuedPresenceScan = {
  opId: string;
  token: string;
  deviceScannedAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
};

const QUEUE_KEY = "siga.presence.queue.v1";
const MAX_QUEUE = 50;

export function readPresenceQueue(): QueuedPresenceScan[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as QueuedPresenceScan[]) : [];
  } catch {
    return [];
  }
}

function writePresenceQueue(items: QueuedPresenceScan[]) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch {
    // Sem armazenamento (janela privada): a leitura só vale com rede.
  }
}

export function enqueuePresenceScan(item: QueuedPresenceScan) {
  const items = readPresenceQueue().filter((entry) => entry.opId !== item.opId);
  writePresenceQueue([...items, item]);
}

export function removeQueuedPresenceScan(opId: string) {
  writePresenceQueue(readPresenceQueue().filter((entry) => entry.opId !== opId));
}

/** Erro de rede (sem internet, servidor inalcançável), não uma recusa do servidor. */
export function isNetworkError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!(error instanceof Error)) return false;
  return (
    error.name === "TypeError" ||
    /failed to fetch|network|load failed|fetch failed|timeout/i.test(error.message)
  );
}

export function newOpId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Navegadores antigos: UUID v4 com Math.random (só identifica o envio).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const MODE_KEY = "siga.presence.mode.v1";

/** Último modo conhecido da escola, para mostrar o leitor mesmo sem rede. */
export function rememberPresenceMode(mode: string) {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Sem armazenamento: só mostra o leitor com rede.
  }
}

export function readRememberedPresenceMode(): string | null {
  try {
    return window.localStorage.getItem(MODE_KEY);
  } catch {
    return null;
  }
}

const DEVICE_KEY = "siga.presence.device.v1";

/**
 * Id aleatório deste navegador, criado na primeira leitura e guardado nele. Não
 * identifica a pessoa: só deixa a Direcção ver quando contas de professores
 * diferentes lêem o QR no mesmo telemóvel. Sem armazenamento, não se envia.
 */
export function presenceDeviceId(): string | undefined {
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);
    if (saved && /^[A-Za-z0-9_-]{8,128}$/.test(saved)) return saved;
    const created = newOpId();
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return undefined;
  }
}
