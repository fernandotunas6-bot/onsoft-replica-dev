import type { requireMobileAcademicAccess } from "./authorization";
import type { Context } from "../../../mobile-v4/src/domain/model";
import {
  NOTIFICATIONS_PAGE,
  parseNotificationInbox,
  parseNotificationReadReceipt,
  type NotificationCursor,
  type NotificationReadTarget,
} from "../../../mobile-v4/src/domain/notifications";
import { MobileApiError } from "./errors";
import { isoMicros } from "./timestamps";
type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];

/** Não lidas da pessoa nesta escola — o mesmo critério do SIGA (status ou read_at). */
async function unreadCount(db: Db, ctx: Context) {
  const result = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("school_id", ctx.schoolId)
    .eq("user_id", ctx.userId)
    .eq("channel", "in_app")
    .is("read_at", null)
    .neq("status", "read");
  if (result.error || result.count === null)
    throw new MobileApiError(503, "NOTIFICATIONS_UNAVAILABLE");
  return result.count;
}

export async function readMobileNotifications(db: Db, ctx: Context, before?: NotificationCursor) {
  // Every privileged query includes both the verified user and selected school.
  let query = db
    .from("notifications")
    .select("id, school_id, user_id, title, body, event_type, status, read_at, created_at")
    .eq("school_id", ctx.schoolId)
    .eq("user_id", ctx.userId)
    .eq("channel", "in_app");
  if (before)
    query = query.or(
      `created_at.lt.${before.date},and(created_at.eq.${before.date},id.lt.${before.id})`,
    );
  // Mais um do que a página: diz se há uma seguinte sem outra consulta.
  const [rows, count] = await Promise.all([
    query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(NOTIFICATIONS_PAGE + 1),
    unreadCount(db, ctx),
  ]);
  if (
    rows.error ||
    !rows.data ||
    rows.data.some((x) => x.school_id !== ctx.schoolId || x.user_id !== ctx.userId)
  )
    throw new MobileApiError(503, "NOTIFICATIONS_UNAVAILABLE");
  const page = rows.data.slice(0, NOTIFICATIONS_PAGE);
  const last = page[page.length - 1];
  try {
    return parseNotificationInbox(
      {
        ...ctx,
        unread: count,
        items: page.map((x) => ({
          id: x.id,
          title: x.title,
          body: x.body,
          eventType: x.event_type,
          read: x.status === "read" || !!x.read_at,
          createdAt: isoMicros(x.created_at),
        })),
        next:
          rows.data.length > NOTIFICATIONS_PAGE && last
            ? { date: isoMicros(last.created_at), id: last.id }
            : null,
      },
      ctx,
    );
  } catch {
    throw new MobileApiError(503, "NOTIFICATIONS_INCONSISTENT");
  }
}

/**
 * Marca como lidos avisos da própria pessoa nesta escola, como o SIGA faz
 * (`status = 'read'` e `read_at`). Só toca nos que ainda não estavam lidos, pelo
 * mesmo critério do contador: `updated` é o que passou de não lido a lido, e
 * repetir o pedido não muda a data de leitura.
 */
export async function markMobileNotificationsRead(
  db: Db,
  ctx: Context,
  target: NotificationReadTarget,
) {
  let query = db
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("school_id", ctx.schoolId)
    .eq("user_id", ctx.userId)
    .eq("channel", "in_app")
    .is("read_at", null)
    .neq("status", "read");
  if ("ids" in target) query = query.in("id", target.ids);
  const updated = await query.select("id");
  if (updated.error || !updated.data) throw new MobileApiError(503, "NOTIFICATIONS_UNAVAILABLE");
  try {
    return parseNotificationReadReceipt(
      { ...ctx, updated: updated.data.length, unread: await unreadCount(db, ctx) },
      ctx,
      target,
    );
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    throw new MobileApiError(503, "NOTIFICATIONS_INCONSISTENT");
  }
}
