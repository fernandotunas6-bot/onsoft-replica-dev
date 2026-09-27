import { createFileRoute } from "@tanstack/react-router";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { runLessonReminders } from "@/features/academic/lesson-reminders";
import { timingSafeEqual } from "@/lib/timing-safe-equal";

// style-check: route-exempt — agendador (Cloudflare Cron / cron externo), de hora a hora.

/**
 * Lembretes da véspera. Chamar de hora a hora com
 * `Authorization: Bearer <SIGA_CRON_SECRET>`; cada escola só recebe à hora que
 * configurou, e o registo de envios impede repetir. Falha fechada sem segredo.
 */
async function handle(request: Request) {
  const secret = (typeof process !== "undefined" && process.env?.SIGA_CRON_SECRET?.trim()) || "";
  if (secret.length < 24) {
    return Response.json({ ok: false, message: "Agendador não configurado." }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!timingSafeEqual(token, secret)) {
    return Response.json({ ok: false, message: "Não autorizado." }, { status: 401 });
  }
  try {
    const db = await loadSgaAdminClient();
    const summary = await runLessonReminders(db);
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron.lesson-reminders]", error);
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha nos lembretes." },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/cron/lesson-reminders")({
  server: {
    handlers: { POST: ({ request }) => handle(request), GET: ({ request }) => handle(request) },
  },
});
