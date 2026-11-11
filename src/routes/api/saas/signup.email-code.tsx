import { createFileRoute } from "@tanstack/react-router";
import { requestSignupEmailCode } from "@/features/saas/signup-email-api";
import { corsPreflight, jsonWithCors, readJsonWithCors } from "@/lib/ecosystem-cors";
import { BODY_LIMITS } from "@/lib/read-json-body";
import { clientIpFromRequest } from "@/lib/request-ip";

const APPS = ["web"] as const;

// style-check: route-exempt — registo público (WEB): envia o código de confirmação do e-mail.

export const Route = createFileRoute("/api/saas/signup/email-code")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        const read = await readJsonWithCors(request, [...APPS], { maxBytes: BODY_LIMITS.small });
        if (!read.ok) return read.response;
        const body = read.value;
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
