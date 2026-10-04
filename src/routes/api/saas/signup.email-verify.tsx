import { createFileRoute } from "@tanstack/react-router";
import { verifySignupEmailCode } from "@/features/saas/signup-email-api";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import { clientIpFromRequest } from "@/lib/request-ip";

const APPS = ["web"] as const;

// style-check: route-exempt — registo público (WEB): confirma o código e devolve o comprovativo.

export const Route = createFileRoute("/api/saas/signup/email-verify")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        try {
          const result = await verifySignupEmailCode(body, clientIpFromRequest(request));
          return jsonWithCors(request, result.body, { status: result.status, apps: [...APPS] });
        } catch {
          return jsonWithCors(
            request,
            { error: "Não foi possível confirmar o código. Tente de novo." },
            { status: 500, apps: [...APPS] },
          );
        }
      },
    },
  },
});
