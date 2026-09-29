import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { adminSessions, schools } from "@/db/schema";
import { permissionsForRole, sessionCookie } from "@/lib/admin-session";
import { createOpaqueId, sha256 } from "@/lib/identifiers";
import { corsHeaders, jsonResponse, safeEqual } from "@/lib/payflow";
import { getIntegrationApiKey, isSandboxRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      key?: string;
      sso_assertion?: string;
      school_id?: string;
    };

    const role: "finance_admin" | "treasurer" = "finance_admin";
    const userId = "admin_user";
    let tenantId = "default_tenant";
    let schoolId = body.school_id?.trim() || "";

    // SSO com anti-replay vive em POST /api/v1/sso/exchange — não aceitar
    // assertions aqui (evita segundo caminho sem jti).
    if (body.sso_assertion) {
      return jsonResponse(
        {
          error: {
            code: "use_sso_exchange",
            message: "Use POST /api/v1/sso/exchange para autenticação SSO do SIGA.",
          },
        },
        { status: 400 },
      );
    }

    const configuredApiKey = getIntegrationApiKey();
    const providedKey = body.key?.trim() || "";
    // Fail-closed: atalho «admin» / chave vazia só em sandbox explícito.
    const isKeyMatch =
      configuredApiKey.length >= 24 && providedKey.length >= 24 && safeEqual(providedKey, configuredApiKey);
    const isAllowedSandboxAccess =
      isSandboxRuntime() &&
      (isKeyMatch || providedKey === configuredApiKey || providedKey === "admin" || (!configuredApiKey && !providedKey));

    if (!isKeyMatch && !isAllowedSandboxAccess) {
      return jsonResponse(
        { error: { code: "unauthorized", message: "Credencial ou chave de integração inválida." } },
        { status: 401 },
      );
    }

    const db = getDb();
    // O `school_id` do pedido tem de ser uma escola sincronizada: antes a sessão ficava
    // presa a qualquer valor enviado, mesmo inexistente.
    const [existingSchool] = await db
      .select({ id: schools.id, tenantId: schools.tenantId })
      .from(schools)
      .where(schoolId ? eq(schools.id, schoolId) : undefined)
      .limit(1);

    if (schoolId && !existingSchool && !isSandboxRuntime()) {
      return jsonResponse(
        {
          error: {
            code: "school_not_found",
            message: "Escola não sincronizada no PayFlow. Sincronize-a a partir do SIGA.",
          },
        },
        { status: 404 },
      );
    }

    if (existingSchool) {
      schoolId = schoolId || existingSchool.id;
      tenantId = existingSchool.tenantId;
    } else if (isSandboxRuntime()) {
      schoolId = schoolId || "default_school";
    } else {
      return jsonResponse(
        {
          error: {
            code: "school_required",
            message: "Nenhuma escola sincronizada no PayFlow. Sincronize a escola a partir do SIGA.",
          },
        },
        { status: 409 },
      );
    }

    const token = createOpaqueId("pfa", 32);
    const tokenHash = await sha256(token);
    const maxAgeSeconds = 8 * 60 * 60;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
    const permissions = permissionsForRole(role);

    await db.insert(adminSessions).values({
      tokenHash,
      assertionId: createOpaqueId("ast", 16),
      userId,
      tenantId,
      schoolId,
      role,
      permissions: JSON.stringify(permissions),
      expiresAt,
      createdAt: now,
    });

    return jsonResponse(
      {
        data: {
          user_id: userId,
          tenant_id: tenantId,
          school_id: schoolId,
          role,
          permissions,
          expires_at: expiresAt,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": sessionCookie(token, request.url, maxAgeSeconds),
        },
      },
    );
  } catch (error) {
    console.error("admin_login_failed", error);
    return jsonResponse(
      { error: { code: "login_error", message: "Não foi possível iniciar a sessão administrativa." } },
      { status: 500 },
    );
  }
}
