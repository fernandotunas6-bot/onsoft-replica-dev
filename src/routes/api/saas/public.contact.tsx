import { createFileRoute } from "@tanstack/react-router";
import { contactMessageInputSchema } from "@/features/saas/web-site-schemas";
import { submitContactMessage } from "@/features/saas/web-site-content";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import { clientIpFromRequest } from "@/lib/request-ip";

const APPS = ["web"] as const;

// style-check: route-exempt — formulário de contacto do site; a mensagem fica para o ADMIN.

export const Route = createFileRoute("/api/saas/public/contact")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonWithCors(
            request,
            { error: "Corpo JSON inválido." },
            { status: 400, apps: [...APPS] },
          );
        }
        const parsed = contactMessageInputSchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Verifique os campos.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }
        try {
          const result = await submitContactMessage(parsed.data, clientIpFromRequest(request));
          if (!result.ok) {
            return jsonWithCors(
              request,
              { error: result.error },
              { status: result.status, apps: [...APPS] },
            );
          }
          return jsonWithCors(request, { ok: true }, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível enviar a mensagem.";
          return jsonWithCors(request, { error: message }, { status: 500, apps: [...APPS] });
        }
      },
    },
  },
  component: PublicContactApiPlaceholder,
});

function PublicContactApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de contacto</h1>
      <p className="mt-2 text-sm text-muted-foreground">POST guarda a mensagem para a equipa.</p>
    </main>
  );
}
