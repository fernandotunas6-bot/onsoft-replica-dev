import { createFileRoute } from "@tanstack/react-router";
import { listSignupLeads } from "@/features/saas/commercial-lifecycle";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — registos por concluir e funil do assistente, para o ADMIN.

export const Route = createFileRoute("/api/saas/signup-leads")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const days = Math.min(
            90,
            Math.max(1, Number(new URL(request.url).searchParams.get("days") || 30)),
          );
          return jsonWithCors(request, await listSignupLeads(days), { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível ler os registos.";
          const status =
            message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 500;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
});
