import { isTauriDesktop, notifyNative } from "@/lib/desktop-utils";

/**
 * Notificações do sistema na app desktop: mensagens novas, comunicados publicados e
 * alterações enviadas depois de uma falha de rede. Regras puras aqui (testadas);
 * as subscrições estão em `DesktopNotifications`.
 *
 * Só avisam com a app em segundo plano (com a janela à frente, o próprio ecrã mostra)
 * e nunca mostram o texto de uma mensagem: o aviso pode aparecer no ecrã bloqueado ou
 * numa sala com o ecrã projectado.
 */

type Row = Record<string, unknown>;

const STAFF_ROLES = ["Administrador", "Secretaria", "Professor"];
/** Comunicados publicados há mais do que isto não avisam (edição de um antigo). */
const FRESH_ANNOUNCEMENT_MS = 10 * 60_000;
const TITLE_MAX = 120;

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Mensagem directa recebida por esta conta (não enviada por ela). */
export function isIncomingMessage(row: Row | null | undefined, userId: string) {
  if (!row || !userId) return false;
  return Boolean(text(row["id"])) && row["recipient_id"] === userId && row["sender_id"] !== userId;
}

/**
 * Comunicado que esta conta vê na lista (mesma regra de communications/server.ts:
 * o pessoal vê todos; alunos e encarregados só os enviados e não os do corpo
 * docente), acabado de publicar e escrito por outra pessoa.
 */
export function isFreshAnnouncementFor(
  row: Row | null | undefined,
  ctx: { userId: string; roles: readonly string[]; now: number },
) {
  if (!row || !text(row["id"]) || row["deleted_at"]) return false;
  if (row["status"] !== "sent") return false;
  if (row["created_by"] && row["created_by"] === ctx.userId) return false;
  const staff = STAFF_ROLES.some((role) => ctx.roles.includes(role));
  if (!staff && row["audience"] === "teaching_staff") return false;
  const published = Date.parse(text(row["published_at"]));
  return Number.isFinite(published) && ctx.now - published <= FRESH_ANNOUNCEMENT_MS;
}

export function messageNotice(count: number, senderName: string | null) {
  if (count > 1) return { title: `${count} mensagens novas`, body: "Abra o SIGA para as ler." };
  return {
    title: "Nova mensagem",
    body: senderName ? `De ${senderName}.` : "Abra o SIGA para a ler.",
  };
}

export function announcementNotice(count: number, title: string) {
  if (count > 1) return { title: `${count} comunicados novos`, body: "Abra o SIGA para os ler." };
  const clean = title.trim();
  return {
    title: "Novo comunicado",
    body: clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean || "Abra o SIGA.",
  };
}

/** A app está em segundo plano (minimizada, escondida ou outra janela à frente)? */
export function appInBackground(doc: Pick<Document, "hidden" | "hasFocus"> = document) {
  return doc.hidden || !doc.hasFocus();
}

/**
 * Junta avisos seguidos do mesmo tipo: o primeiro sai logo; os que chegam na janela
 * seguinte saem num só aviso com a contagem («3 mensagens novas»).
 */
export function createNoticeBatcher<T>(
  send: (items: T[]) => void,
  windowMs = 10_000,
  timers: Pick<typeof globalThis, "setTimeout" | "clearTimeout"> = globalThis,
) {
  let queue: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    if (!queue.length) return;
    const items = queue;
    queue = [];
    send(items);
    timer = timers.setTimeout(flush, windowMs);
  };
  return {
    push(item: T) {
      queue.push(item);
      if (!timer) flush();
    },
    dispose() {
      if (timer) timers.clearTimeout(timer);
      timer = null;
      queue = [];
    },
  };
}

/** Envia uma notificação do sistema só na app e só em segundo plano. */
export async function notifyInBackground(title: string, body: string) {
  if (!isTauriDesktop() || !appInBackground()) return false;
  return notifyNative(title, body);
}
