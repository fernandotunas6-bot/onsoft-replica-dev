import { createFileRoute } from "@tanstack/react-router";
import { recordSignupProgressFromRequest } from "@/features/saas/signup-email-api";
import { corsPreflight, jsonWithCors, readJsonWithCors } from "@/lib/ecosystem-cors";
import { BODY_LIMITS } from "@/lib/read-json-body";
import { clientIpFromRequest } from "@/lib/request-ip";

const APPS = ["web"] as const;

// style-check: route-exempt — registo público (WEB): passo atingido no assistente, sem dados pessoais.

export const Route = createFileRoute("/api/saas/signup/progress")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        const read = await readJsonWithCors(request, [...APPS], { maxBytes: BODY_LIMITS.small });
        if (!read.ok) return read.response;
        const body = read.value;
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
