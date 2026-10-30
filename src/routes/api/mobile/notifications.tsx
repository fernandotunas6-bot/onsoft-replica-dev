import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { listSchoolAnnouncements } from "@/features/communications/server";
import { listChatConversations } from "@/features/messages/chat-server";
import { listMyNotifications, markMyNotificationsRead } from "@/features/notifications/personal";
import { mobileRespond } from "@/features/mobile/api-response";
import { corsPreflight } from "@/lib/ecosystem-cors";

// style-check: route-exempt — API da app móvel (SIGA Plus Flutter, modo SIGA).

/**
 * Avisos pessoais da app móvel (tabela `notifications`, canal `in_app`): trabalho
 * novo ou devolvido, avaliação marcada, pauta publicada, horário, lembretes,
 * comunicados… As mesmas funções do sino do portal: a sessão do próprio
 * utilizador e o RLS (`user_id = auth.uid()`) só deixam ver e marcar os seus.
 *
 *   GET                              { items: [{ id, title, body, eventType, read, createdAt, href }], unread }
 *   GET ?pulse=1&after=ISO&announcements_after=ISO
 *                                    só o que é novo, num pedido pequeno, para a
 *                                    verificação em segundo plano da app:
 *                                    { items (depois de `after`), unread, chatUnread,
 *                                      announcements: [{ id, title, publishedAt }] }
 *   POST { action: "read", ids? }    marca como lidos os indicados (ou todos)
 */
export const Route = createFileRoute("/api/mobile/notifications")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request),
      GET: async ({ request }) =>
        mobileRespond(request, "api/mobile/notifications", async () => {
          const url = new URL(request.url);
          if (url.searchParams.get("pulse") !== "1") return listMyNotifications();
          return pulse(
            instant(url.searchParams.get("after")),
            instant(url.searchParams.get("announcements_after")),
          );
        }),
      POST: async ({ request }) =>
        mobileRespond(request, "api/mobile/notifications", async () => {
          const body = (await request.json().catch(() => null)) as MobileNotificationsBody | null;
          if (!body || typeof body !== "object" || body.action !== "read") {
            throw new ZodError([]);
          }
          return markMyNotificationsRead({
            data: Array.isArray(body.ids) ? { ids: body.ids } : {},
          } as never);
        }),
    },
  },
});

type MobileNotificationsBody = { action?: string; ids?: unknown };

const PULSE_NOTICES = 10;
const PULSE_ANNOUNCEMENTS = 5;

/** Uma data ISO válida em milissegundos; qualquer outra coisa conta como «sem data». */
function instant(raw: string | null): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

const newer = (iso: string | null | undefined, after: number | null) => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) && (after === null || ms > after);
};

/**
 * O que mudou desde a última verificação: os avisos novos (sem os já vistos), o
 * total por ler, as mensagens por ler e os comunicados novos (só título; o texto
 * abre na app). Mensagens e comunicados são extras: se falharem, o pulso segue
 * sem eles (`null` / lista vazia), e a sessão inválida dá 401 pelos avisos.
 */
async function pulse(after: number | null, announcementsAfter: number | null) {
  const [feed, chat, announcements] = await Promise.all([
    listMyNotifications(),
    listChatConversations().catch(() => null),
    listSchoolAnnouncements({
      data: { limit: PULSE_ANNOUNCEMENTS, status: "sent" },
    } as never).catch(() => []),
  ]);
  return {
    items: feed.items.filter((item) => newer(item.createdAt, after)).slice(0, PULSE_NOTICES),
    unread: feed.unread,
    chatUnread: chat
      ? chat.conversations.reduce((sum, conversation) => sum + (conversation.unread ?? 0), 0)
      : null,
    announcements: announcements
      .filter((row) => row.status === "sent" && newer(row.published_at, announcementsAfter))
      .slice(0, PULSE_ANNOUNCEMENTS)
      .map((row) => ({ id: row.id, title: row.title, publishedAt: row.published_at })),
  };
}
