import { createFileRoute } from "@tanstack/react-router";
import { publicSchoolSignupInputSchema } from "@/features/saas/schemas";
import { runPublicSchoolSignup } from "@/features/saas/public-signup";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import { ECOSYSTEM_URLS } from "@/lib/ecosystem-urls";
import { clientIpFromRequest } from "@/lib/request-ip";
import { readJsonBodyLimited } from "@/lib/read-json-body";

const WEB_APPS = ["web"] as const;
// O wizard envia texto e metadados pequenos: um tecto alto evita payloads
// abusivos sem limitar uploads (enviados por fluxos específicos separados).
const MAX_SIGNUP_JSON_BYTES = 128 * 1024;
const PUBLIC_SIGNUP_RESPONSE = { apps: [...WEB_APPS], noStore: true };

/** Conserva o contrato de erros do registo (incluindo 429), sem expor cache. */
export function publicSignupErrorResponse(request: Request, error: unknown): Response {
  const message =
    error instanceof Error ? error.message : "Não foi possível criar a escola.";
  const status = message.includes("Muitos pedidos") ? 429 : 400;
  return jsonWithCors(request, { error: message }, { ...PUBLIC_SIGNUP_RESPONSE, status });
}

// style-check: route-exempt — API pública de signup comercial (WEB → SIGA).

export const Route = createFileRoute("/api/saas/signup")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...WEB_APPS]),
      POST: async ({ request }) => {
        const body = await readJsonBodyLimited(request, MAX_SIGNUP_JSON_BYTES);
        if (!body.ok) {
          const tooLarge = body.reason === "too_large";
          return jsonWithCors(
            request,
            { error: tooLarge ? "Pedido demasiado grande." : "Corpo JSON inválido." },
            { ...PUBLIC_SIGNUP_RESPONSE, status: tooLarge ? 413 : 400 },
          );
        }
        const parsed = publicSchoolSignupInputSchema.safeParse(body.value);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { ...PUBLIC_SIGNUP_RESPONSE, status: 400 },
          );
        }
        try {
          const result = await runPublicSchoolSignup(parsed.data, clientIpFromRequest(request));
          return jsonWithCors(
            request,
            {
              ...result,
              sigaUrl: ECOSYSTEM_URLS.siga,
              adminTenantsUrl: `${ECOSYSTEM_URLS.admin}/tenants`,
            },
            PUBLIC_SIGNUP_RESPONSE,
          );
        } catch (error) {
          return publicSignupErrorResponse(request, error);
        }
      },
    },
  },
  component: SignupApiPlaceholder,
});

function SignupApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de criação de escola</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O wizard comercial vive no WEB. Envie POST JSON para provisionar o tenant.
      </p>
    </main>
  );
}
