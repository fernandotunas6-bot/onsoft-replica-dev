import type { Context } from "./model";
/** Posição do último aviso de uma página: data com a precisão da base e id. */
export interface NotificationCursor {
  date: string;
  id: string;
}
export interface NotificationInbox extends Context {
  unread: number;
  items: {
    id: string;
    title: string;
    body: string;
    eventType: string;
    read: boolean;
    createdAt: string;
  }[];
  /** Página seguinte (mais antiga), ou null quando não há mais avisos. */
  next: NotificationCursor | null;
}
/** Marcar uns avisos (até 50) ou todos os da escola. */
export type NotificationReadTarget = { ids: string[] } | { all: true };
export interface NotificationReadReceipt extends Context {
  updated: number;
  unread: number;
}
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sameContext = (data: Context, ctx: Context) =>
  data.schoolId === ctx.schoolId && data.userId === ctx.userId && data.role === ctx.role;
const count = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
export const NOTIFICATIONS_PAGE = 50;
export function parseNotificationInbox(value: unknown, ctx: Context): NotificationInbox {
  const data = value as NotificationInbox;
  const next = data?.next;
  if (
    !data ||
    typeof data !== "object" ||
    Object.keys(data).length !== 6 ||
    !sameContext(data, ctx) ||
    !count(data.unread) ||
    !Array.isArray(data.items) ||
    data.items.length > NOTIFICATIONS_PAGE ||
    new Set(data.items.map((x) => x?.id)).size !== data.items.length ||
    data.items.some(
      (x) =>
        !x ||
        Object.keys(x).length !== 6 ||
        !UUID.test(x.id) ||
        typeof x.title !== "string" ||
        x.title.length > 500 ||
        typeof x.body !== "string" ||
        x.body.length > 16000 ||
        typeof x.eventType !== "string" ||
        x.eventType.length > 200 ||
        typeof x.read !== "boolean" ||
        typeof x.createdAt !== "string" ||
        !Number.isFinite(Date.parse(x.createdAt)),
    ) ||
    (next !== null &&
      (!next ||
        typeof next !== "object" ||
        Object.keys(next).length !== 2 ||
        // O cursor aponta sempre para o último aviso desta página.
        data.items.length !== NOTIFICATIONS_PAGE ||
        next.id !== data.items[data.items.length - 1]!.id ||
        next.date !== data.items[data.items.length - 1]!.createdAt))
  )
    throw new Error("Contrato de avisos inválido.");
  return data;
}
export function parseNotificationReadReceipt(
  value: unknown,
  ctx: Context,
  target: NotificationReadTarget,
): NotificationReadReceipt {
  const data = value as NotificationReadReceipt;
  if (
    !data ||
    typeof data !== "object" ||
    Object.keys(data).length !== 5 ||
    !sameContext(data, ctx) ||
    !count(data.updated) ||
    !count(data.unread) ||
    ("ids" in target && data.updated > target.ids.length)
  )
    throw new Error("Resposta de leitura de avisos inválida.");
  return data;
}
