import { createFileRoute } from "@tanstack/react-router";
import { unsubscribeLead } from "@/features/saas/commercial-lifecycle";
import { verifyLeadUnsubscribeSignature } from "@/features/saas/signup-verification";
import { getAppName } from "@/lib/app-config";

// style-check: route-exempt — ligação «deixar de receber lembretes» dos e-mails de registo.

function page(title: string, text: string, status = 200) {
  const esc = (v: string) =>
    v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return new Response(
    `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;color:#0f172a"><h1 style="font-size:20px">${esc(title)}</h1><p style="color:#475569;line-height:1.5">${esc(text)}</p><p style="color:#94a3b8;font-size:13px">${esc(getAppName())}</p></body></html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

export const Route = createFileRoute("/api/saas/signup/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lead = url.searchParams.get("lead") ?? "";
        const sig = url.searchParams.get("sig") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(lead) || !verifyLeadUnsubscribeSignature(lead, sig)) {
          return page("Ligação inválida", "Esta ligação não é válida ou foi alterada.", 400);
        }
        await unsubscribeLead(lead).catch(() => false);
        return page(
          "Lembretes desligados",
          "Não voltará a receber lembretes sobre este registo. Pode concluí-lo quando quiser a partir do site.",
        );
      },
    },
  },
});
