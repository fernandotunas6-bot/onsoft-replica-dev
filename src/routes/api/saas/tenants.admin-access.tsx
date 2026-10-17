import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { requirePlatformAdminFromRequest } from "@/features/saas/platform-guard";
import {
  loadSchoolAdminAccessSnapshot,
  repairSchoolAdminAccess,
} from "@/features/saas/school-admin-access";
import {
  assessSchoolAdminAccess,
  schoolAdminAccessReady,
} from "@/features/saas/school-admin-access-rules";
import { corsPreflight, jsonWithCors } from "@/lib/ecosystem-cors";

const APPS = ["admin"] as const;

const repairInputSchema = z.object({
  tenantId: z.string().uuid(),
  issueAccessLinks: z.boolean().optional().default(false),
});

function errorStatus(message: string) {
  return message === "Unauthorized" || message.includes("Sem permissão") ? 401 : 400;
}

// style-check: route-exempt — diagnóstico e reparação do acesso do administrador para o ADMIN.

export const Route = createFileRoute("/api/saas/tenants/admin-access")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsPreflight(request, [...APPS]),
      // Diagnóstico: só lê.
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
          const db = await loadSgaAdminClient();
          const snapshot = await loadSchoolAdminAccessSnapshot(db, { tenantId });
          if (!snapshot) {
            return jsonWithCors(
              request,
              { error: "Escola não encontrada." },
              { status: 404, apps: [...APPS] },
            );
          }
          const issues = assessSchoolAdminAccess(snapshot);
          return jsonWithCors(
            request,
            {
              tenant: snapshot.tenant,
              school: snapshot.school,
              admins: snapshot.admins.map((admin) => ({
                userId: admin.userId,
                email: admin.email,
                roleCodes: admin.roleCodes,
                lastSignInAt: admin.lastSignInAt,
                verifiedFactors: admin.verifiedFactors,
              })),
              issues,
              ready: schoolAdminAccessReady(issues),
            },
            { apps: [...APPS] },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível verificar o acesso.";
          return jsonWithCors(
            request,
            { error: message },
            { status: errorStatus(message), apps: [...APPS] },
          );
        }
      },
      // Reparação: correcções automáticas e, se pedido, links de acesso.
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
        const parsed = repairInputSchema.safeParse(body);
        if (!parsed.success) {
          return jsonWithCors(
            request,
            { error: "Pedido inválido.", issues: parsed.error.flatten().fieldErrors },
            { status: 400, apps: [...APPS] },
          );
        }
        try {
          const userId = await requirePlatformAdminFromRequest(request);
          const db = await loadSgaAdminClient();
          const result = await repairSchoolAdminAccess(
            db,
            { tenantId: parsed.data.tenantId },
            { issueAccessLinks: parsed.data.issueAccessLinks },
          );
          // Os links nunca vão para o registo: só quem pediu os vê, uma vez.
          await db.from("saas_audit_logs").insert({
            tenant_id: parsed.data.tenantId,
            user_id: userId,
            action: "TENANT_ADMIN_ACCESS_REPAIRED",
            entity: "tenant",
            entity_id: parsed.data.tenantId,
            metadata: {
              actions: result.actions,
              issues_before: result.before.map((issue) => issue.code),
              issues_after: result.after.map((issue) => issue.code),
              access_links_for: result.accessLinks.map((link) => link.email),
            },
          });
          return jsonWithCors(
            request,
            { ...result, ready: schoolAdminAccessReady(result.after) },
            { apps: [...APPS] },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Não foi possível reparar o acesso.";
          return jsonWithCors(
            request,
            { error: message },
            { status: errorStatus(message), apps: [...APPS] },
          );
        }
      },
    },
  },
  component: TenantAdminAccessApiPlaceholder,
});

function TenantAdminAccessApiPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold">API de acesso do administrador</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GET/POST autenticado. A UI vive no ADMIN.
      </p>
    </main>
  );
}
