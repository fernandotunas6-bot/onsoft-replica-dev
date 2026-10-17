import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import {
  loadTenantOverview,
  pauseTenantBilling,
  resumeTenantBilling,
  reviewPublicSchool,
  saveTenantBillingProfile,
} from "@/features/saas/tenant-billing";
import {
  PUBLIC_SCHOOL_REQUIREMENTS,
  tenantBillingProfileInputSchema,
} from "@/features/saas/tenant-billing-rules";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

const requirementIds = PUBLIC_SCHOOL_REQUIREMENTS.map((r) => r.id) as [string, ...string[]];

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    tenantId: z.string().uuid(),
    profile: tenantBillingProfileInputSchema,
  }),
  z.object({
    action: z.literal("pause"),
    tenantId: z.string().uuid(),
    reason: z.string().trim().min(3, "Indique o motivo da pausa.").max(300),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
      .nullish()
      .transform((v) => v ?? null),
  }),
  z.object({ action: z.literal("resume"), tenantId: z.string().uuid() }),
  z.object({
    action: z.literal("public_review"),
    tenantId: z.string().uuid(),
    decision: z.enum(["save", "approve", "reject"]),
    requirements: z.record(z.enum(requirementIds), z.boolean()).default({}),
    officialCode: z
      .string()
      .trim()
      .max(80)
      .nullish()
      .transform((v) => v || null),
    supervisingBody: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((v) => v || null),
    notes: z
      .string()
      .trim()
      .max(2000)
      .nullish()
      .transform((v) => v || null),
  }),
]);

function errorStatus(message: string) {
  return message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 400;
}

// style-check: route-exempt — cobrança SaaS por escola para o ADMIN.

export const Route = createFileRoute("/api/saas/tenants/billing")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      // Tudo o que a página da escola mostra: dados, uso, plano, cobrança, revisão.
      GET: async ({ request }) => {
        try {
          await requirePlatformAdminFromRequest(request);
          const tenantId = new URL(request.url).searchParams.get("tenantId") ?? "";
          if (!z.string().uuid().safeParse(tenantId).success) {
            return jsonWithCors(
              request,
              { error: "tenantId inválido." },
              { status: 400, apps: [...APPS] },
            );
          }
          const overview = await loadTenantOverview(await loadSgaAdminClient(), tenantId);
          if (!overview) {
            return jsonWithCors(
              request,
              { error: "Escola não encontrada." },
              { status: 404, apps: [...APPS] },
            );
          }
          return jsonWithCors(request, overview, { apps: [...APPS] });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível ler a escola.";
          return jsonWithCors(
            request,
            { error: message },
            { status: errorStatus(message), apps: [...APPS] },
          );
        }
      },
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonWithCors(
            request,
            { error: "Corpo JSON inválido." },
            { status: 400, apps: [...APPS] },
          );
        }
        const parsed = actionSchema.safeParse(body);
        if (!parsed.success) {
          const flat = parsed.error.flatten();
          const first =
            Object.values(flat.fieldErrors).flat()[0] ?? flat.formErrors[0] ?? "Pedido inválido.";
          return jsonWithCors(
            request,
            { error: first, issues: flat.fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }
        try {
          const userId = await requirePlatformAdminFromRequest(request);
          const db = await loadSgaAdminClient();
          const input = parsed.data;
          const result =
            input.action === "save"
              ? await saveTenantBillingProfile(db, input.tenantId, input.profile, userId)
              : input.action === "pause"
                ? await pauseTenantBilling(
                    db,
                    input.tenantId,
                    { reason: input.reason, until: input.until },
                    userId,
                  )
                : input.action === "resume"
                  ? await resumeTenantBilling(db, input.tenantId, userId)
                  : await reviewPublicSchool(
                      db,
                      input.tenantId,
                      {
                        decision: input.decision,
                        requirements: input.requirements,
                        officialCode: input.officialCode,
                        supervisingBody: input.supervisingBody,
                        notes: input.notes,
                      },
                      userId,
                    );
          return jsonWithCors(request, { success: true, ...result }, { apps: [...APPS] });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível gravar a cobrança.";
          return jsonWithCors(
            request,
            { error: message },
            { status: errorStatus(message), apps: [...APPS] },
          );
        }
      },
    },
  },
  component: TenantBillingApiPlaceholder,
});

function TenantBillingApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de cobrança da escola</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET/POST autenticado. A UI vive no ADMIN.
      </p>
    </main>
  );
}
