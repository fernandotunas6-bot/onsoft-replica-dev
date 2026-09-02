import { createFileRoute } from "@tanstack/react-router";
import { resolvePlatformSessionFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — identidade partilhada ADMIN ↔ SIGA (Fase 10).

export const Route = createFileRoute("/api/saas/me")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        const session = await resolvePlatformSessionFromRequest(request);
        if (!session) {
          return jsonWithCors(request, { error: "Unauthorized" }, { status: 401, apps: [...APPS] });
        }
        return jsonWithCors(
          request,
          {
            userId: session.userId,
            email: session.email ?? null,
            platformAdmin: session.platformAdmin,
          },
          { apps: [...APPS] },
        );
      },
    },
  },
  component: MeApiPlaceholder,
});

function MeApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de sessão SaaS</h1>
      <p className="mt-2 text-sm text-muted-foreground">GET autenticado — perfil platform admin.</p>
    </main>
  );
}
