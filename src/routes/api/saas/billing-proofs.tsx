import { createFileRoute } from "@tanstack/react-router";
import { signedBillingProofUrl } from "@/features/saas/platform-ops";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

// style-check: route-exempt — ADMIN abre um comprovativo de pagamento (link de 5 minutos).

export const Route = createFileRoute("/api/saas/billing-proofs")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const path = new URL(request.url).searchParams.get("path") ?? "";
          return jsonWithCors(
            request,
            { url: await signedBillingProofUrl(path) },
            { apps: [...APPS] },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Comprovativo indisponível.";
          const status =
            message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 400;
          return jsonWithCors(request, { error: message }, { status, apps: [...APPS] });
        }
      },
    },
  },
});
