import { createFileRoute } from "@tanstack/react-router";
import { verifySignupEmailCode } from "@/features/saas/signup-email-api";
import { corsPreflight, jsonWithCors, readJsonWithCors } from "@/lib/ecosystem-cors";
import { BODY_LIMITS } from "@/lib/read-json-body";
import { clientIpFromRequest } from "@/lib/request-ip";

const APPS = ["web"] as const;

// style-check: route-exempt — registo público (WEB): confirma o código e devolve o comprovativo.

export const Route = createFileRoute("/api/saas/signup/email-verify")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        const read = await readJsonWithCors(request, [...APPS], { maxBytes: BODY_LIMITS.small });
        if (!read.ok) return read.response;
        const body = read.value;
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
