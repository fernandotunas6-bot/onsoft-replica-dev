import type { requireMobileAcademicAccess } from "./authorization";
import type { Context } from "../../../mobile-v4/src/domain/model";
import { parseNotificationInbox } from "../../../mobile-v4/src/domain/notifications";
import { MobileApiError } from "./errors";
type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
export async function readMobileNotifications(db: Db, ctx: Context) {
  // Every privileged query includes both the verified user and selected school.
  const [rows, count] = await Promise.all([
    db
      .from("notifications")
      .select("id, school_id, user_id, title, body, event_type, status, read_at, created_at")
      .eq("school_id", ctx.schoolId)
      .eq("user_id", ctx.userId)
      .eq("channel", "in_app")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("school_id", ctx.schoolId)
      .eq("user_id", ctx.userId)
      .eq("channel", "in_app")
      .is("read_at", null)
      .neq("status", "read"),
  ]);
  if (
    rows.error ||
    count.error ||
    !rows.data ||
    count.count === null ||
    rows.data.some((x) => x.school_id !== ctx.schoolId || x.user_id !== ctx.userId)
  )
    throw new MobileApiError(503, "NOTIFICATIONS_UNAVAILABLE");
  try {
    return parseNotificationInbox(
      {
        ...ctx,
        unread: count.count,
        items: rows.data.map((x) => ({
          id: x.id,
          title: x.title,
          body: x.body,
          eventType: x.event_type,
          read: x.status === "read" || !!x.read_at,
          createdAt: x.created_at,
        })),
      },
      ctx,
    );
  } catch {
    throw new MobileApiError(503, "NOTIFICATIONS_INCONSISTENT");
  }
}
