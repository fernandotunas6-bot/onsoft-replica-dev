import { createFileRoute } from "@tanstack/react-router";
import { requestSignupEmailCode } from "@/features/saas/signup-email-api";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import { clientIpFromRequest } from "@/lib/request-ip";

const APPS = ["web"] as const;

// style-check: route-exempt — registo público (WEB): envia o código de confirmação do e-mail.

export const Route = createFileRoute("/api/saas/signup/email-code")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        try {
          const result = await requestSignupEmailCode(body, clientIpFromRequest(request));
          return jsonWithCors(request, result.body, { status: result.status, apps: [...APPS] });
        } catch {
          return jsonWithCors(
            request,
            { error: "Não foi possível enviar o código. Tente de novo." },
            { status: 500, apps: [...APPS] },
          );
        }
      },
    },
  },
});
