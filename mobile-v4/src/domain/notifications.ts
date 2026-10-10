import type { Context } from "./model";
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
}
export function parseNotificationInbox(value: unknown, ctx: Context): NotificationInbox {
  const data = value as NotificationInbox;
  if (
    !data ||
    typeof data !== "object" ||
    Object.keys(data).length !== 5 ||
    data.schoolId !== ctx.schoolId ||
    data.userId !== ctx.userId ||
    data.role !== ctx.role ||
    !Number.isSafeInteger(data.unread) ||
    data.unread < 0 ||
    !Array.isArray(data.items) ||
    data.items.length > 50 ||
    new Set(data.items.map((x) => x?.id)).size !== data.items.length ||
    data.items.some(
      (x) =>
        !x ||
        Object.keys(x).length !== 6 ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x.id) ||
        typeof x.title !== "string" ||
        x.title.length > 500 ||
        typeof x.body !== "string" ||
        x.body.length > 16000 ||
        typeof x.eventType !== "string" ||
        x.eventType.length > 200 ||
        typeof x.read !== "boolean" ||
        typeof x.createdAt !== "string" ||
        !Number.isFinite(Date.parse(x.createdAt)),
    )
  )
    throw new Error("Contrato de avisos inválido.");
  return data;
}
