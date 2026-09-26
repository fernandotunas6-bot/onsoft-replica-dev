/**
 * Notificações pessoais (tabela `notifications`): horário publicado, tarefas
 * novas, lembretes da véspera… Lidas e marcadas com a sessão do próprio
 * utilizador — o RLS já só deixa ver e alterar as suas (user_id = auth.uid()).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sgaClient } from "@/integrations/supabase/sga";

export type PersonalNotification = {
  id: string;
  title: string;
  body: string;
  eventType: string;
  read: boolean;
  createdAt: string;
};

const isMissing = (message?: string) =>
  /schema cache|does not exist|42P01|PGRST205/i.test(message ?? "");

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: PersonalNotification[]; unread: number }> => {
    const db = sgaClient(context.supabase);
    const { data, error } = await db
      .from("notifications")
      .select("id, title, body, event_type, status, read_at, created_at")
      .eq("user_id", context.userId)
      .eq("channel", "in_app")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      if (isMissing(error.message)) return { items: [], unread: 0 };
      throw new Error("Não foi possível carregar as notificações.");
    }
    const items = (data ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      eventType: String(row.event_type ?? ""),
      read: row.status === "read" || Boolean(row.read_at),
      createdAt: String(row.created_at),
    }));
    return { items, unread: items.filter((item) => !item.read).length };
  });

export const markMyNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(50).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = sgaClient(context.supabase);
    let query = db
      .from("notifications")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (data.ids?.length) query = query.in("id", data.ids);
    const { error } = await query;
    if (error && !isMissing(error.message)) {
      throw new Error("Não foi possível marcar como lidas.");
    }
    return { ok: true };
  });
