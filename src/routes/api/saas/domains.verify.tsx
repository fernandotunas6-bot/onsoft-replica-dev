import { createFileRoute } from "@tanstack/react-router";
import { verifyTenantDomainInputSchema } from "@/features/saas/schemas";
import { verifyAndActivateTenantDomain } from "@/features/saas/platform-ops";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — verificação DNS de domínio SaaS para o ADMIN.

export const Route = createFileRoute("/api/saas/domains/verify")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonWithCors(request, { error: "Corpo JSON inválido." }, { status: 400, apps: [...APPS] });
        }
        const parsed = verifyTenantDomainInputSchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }
        try {
          const actorUserId = await requirePlatformAdminFromRequest(request);
          const result = await verifyAndActivateTenantDomain({
            domainId: parsed.data.domainId,
            actorUserId,
          });
          return jsonWithCors(request, result, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível verificar o domínio.";
          const status = message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 400;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
  component: DomainVerifyApiPlaceholder,
});

function DomainVerifyApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API verificação DNS</h1>
      <p className="mt-2 text-sm text-muted-foreground">POST autenticado. A UI vive no ADMIN.</p>
    </main>
  );
}
