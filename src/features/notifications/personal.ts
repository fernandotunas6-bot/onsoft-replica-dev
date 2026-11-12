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
  /** Destino dentro do painel, quando o aviso leva a algum lado. */
  href: string | null;
};

/** Só caminhos internos simples: nada de outro domínio nem esquemas. */
export function safeNotificationHref(payload: unknown): string | null {
  const href =
    payload && typeof payload === "object" ? (payload as { href?: unknown }).href : undefined;
  if (typeof href !== "string") return null;
  return /^\/(?!\/)[A-Za-z0-9\-_/]*$/.test(href) && href.length <= 200 ? href : null;
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: PersonalNotification[]; unread: number }> => {
    const db = sgaClient(context.supabase);
    const { readActiveSchoolCookie } = await import("@/features/auth/active-school-cookie.server");
    const schoolId = await readActiveSchoolCookie();
    let listQuery = db
      .from("notifications")
      .select("id, title, body, event_type, status, read_at, created_at, payload")
      .eq("user_id", context.userId)
      .eq("channel", "in_app");
    // Num portal multiescola, mostrar só avisos da escola seleccionada.
    // No Mobile, que pode não enviar cookie, a RLS continua a restringir à própria conta.
    if (schoolId) listQuery = listQuery.eq("school_id", schoolId);
    const { data, error } = await listQuery.order("created_at", { ascending: false }).limit(20);
    // Ausência da tabela/RLS não é «sem avisos»: mostrar erro e permitir repetir.
    if (error) throw new Error("Não foi possível carregar as notificações.");
    const items = (data ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      eventType: String(row.event_type ?? ""),
      read: row.status === "read" || Boolean(row.read_at),
      createdAt: String(row.created_at),
      href: safeNotificationHref(row.payload),
    }));
    // O sino não pode limitar o total por ler aos últimos 20 avisos da lista.
    let countQuery = db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("channel", "in_app")
      .neq("status", "read")
      .is("read_at", null);
    if (schoolId) countQuery = countQuery.eq("school_id", schoolId);
    const { count, error: countError } = await countQuery;
    if (countError) throw new Error("Não foi possível contar as notificações por ler.");
    return { items, unread: count ?? 0 };
  });

export const markMyNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ ids: z.array(z.string().guid()).max(50).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    // [] significa «nenhuma», não «todas». Só a ausência de ids marca tudo.
    if (data.ids && data.ids.length === 0) return { ok: true };
    const db = sgaClient(context.supabase);
    const { readActiveSchoolCookie } = await import("@/features/auth/active-school-cookie.server");
    const schoolId = await readActiveSchoolCookie();
    let query = db
      .from("notifications")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("channel", "in_app")
      .neq("status", "read")
      .is("read_at", null);
    if (schoolId) query = query.eq("school_id", schoolId);
    if (data.ids) query = query.in("id", data.ids);
    const { error } = await query;
    if (error) throw new Error("Não foi possível marcar como lidas.");

    // PostgREST pode devolver sucesso com zero linhas se uma política RLS impedir
    // a escrita. Confirmar o estado na fonte de verdade antes de devolver ok.
    if (data.ids) {
      let check = db
        .from("notifications")
        .select("id, status, read_at")
        .eq("user_id", context.userId)
        .eq("channel", "in_app")
        .in("id", data.ids);
      if (schoolId) check = check.eq("school_id", schoolId);
      const { data: checked, error: checkError } = await check;
      const uniqueIds = new Set(data.ids);
      if (
        checkError ||
        !checked ||
        checked.length !== uniqueIds.size ||
        checked.some((row) => row.status !== "read" && !row.read_at)
      ) {
        throw new Error("Não foi possível confirmar a leitura das notificações.");
      }
    } else {
      let pending = db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("channel", "in_app")
        .neq("status", "read")
        .is("read_at", null);
      if (schoolId) pending = pending.eq("school_id", schoolId);
      const { count, error: countError } = await pending;
      if (countError || count !== 0) {
        throw new Error("Não foi possível confirmar a leitura de todos os avisos.");
      }
    }
    return { ok: true };
  });
