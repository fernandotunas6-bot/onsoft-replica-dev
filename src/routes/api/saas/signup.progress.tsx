import { createFileRoute } from "@tanstack/react-router";
import { recordSignupProgressFromRequest } from "@/features/saas/signup-email-api";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import { clientIpFromRequest } from "@/lib/request-ip";

const APPS = ["web"] as const;

// style-check: route-exempt — registo público (WEB): passo atingido no assistente, sem dados pessoais.

export const Route = createFileRoute("/api/saas/signup/progress")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        try {
          const result = await recordSignupProgressFromRequest(body, clientIpFromRequest(request));
          return jsonWithCors(request, result.body, { status: result.status, apps: [...APPS] });
        } catch {
          // O acompanhamento nunca pode atrapalhar o registo.
          return jsonWithCors(request, { ok: false }, { status: 200, apps: [...APPS] });
        }
      },
    },
  },
});
