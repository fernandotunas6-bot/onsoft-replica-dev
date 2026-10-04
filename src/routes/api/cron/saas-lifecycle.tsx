import { createFileRoute } from "@tanstack/react-router";
import { runCommercialLifecycle } from "@/features/saas/commercial-lifecycle";
import { timingSafeEqual } from "@/lib/timing-safe-equal";

// style-check: route-exempt — agendador diário (.github/workflows/saas-lifecycle.yml).

/**
 * Avisos de fim do período experimental (7, 3 e 1 dia antes) e lembretes a quem
 * não concluiu o registo da escola. Chamar uma vez por dia com
 * `Authorization: Bearer <SIGA_CRON_SECRET>`; os registos de envio impedem
 * repetir. Falha fechada sem segredo, como /api/cron/lesson-reminders.
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
    return Response.json({ ok: true, ...(await runCommercialLifecycle()) });
  } catch (error) {
    console.error("[cron.saas-lifecycle]", error);
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha nos avisos." },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/cron/saas-lifecycle")({
  server: {
    handlers: { POST: ({ request }) => handle(request) },
  },
});
