import { createFileRoute } from "@tanstack/react-router";
import { publicSchoolSignupInputSchema } from "@/features/saas/schemas";
import { runPublicSchoolSignup } from "@/features/saas/public-signup";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";
import { ECOSYSTEM_URLS } from "@/lib/ecosystem-urls";

const WEB_APPS = ["web"] as const;

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// style-check: route-exempt — API pública de signup comercial (WEB → SIGA).

export const Route = createFileRoute("/api/saas/signup")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...WEB_APPS]),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonWithCors(
            request,
            { error: "Corpo JSON inválido." },
            { status: 400, apps: [...WEB_APPS] },
          );
        }
        const parsed = publicSchoolSignupInputSchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...WEB_APPS] },
          );
        }
        try {
          const result = await runPublicSchoolSignup(parsed.data, clientIp(request));
          return jsonWithCors(
            request,
            {
              ...result,
              sigaUrl: ECOSYSTEM_URLS.siga,
              adminTenantsUrl: `${ECOSYSTEM_URLS.admin}/tenants`,
            },
            { apps: [...WEB_APPS] },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível criar a escola.";
          const status = message.includes("Muitos pedidos") ? 429 : 400;
          return jsonWithCors(request, { error: message }, { status, apps: [...WEB_APPS] });
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
