import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { adminSessions } from "@/db/schema";
import { permissionsForRole, sessionCookie } from "@/lib/admin-session";
import { createOpaqueId, sha256 } from "@/lib/identifiers";
import { jsonResponse } from "@/lib/payflow";
import { getSsoSecret } from "@/lib/runtime";
import { verifySsoAssertion } from "@/lib/sso-assertion";

export const dynamic = "force-dynamic";

async function readAssertion(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { assertion?: unknown };
    return typeof body.assertion === "string" ? body.assertion : "";
  }
  const form = await request.formData();
  const assertion = form.get("assertion");
  return typeof assertion === "string" ? assertion : "";
}

export async function POST(request: Request) {
  try {
    const assertion = await readAssertion(request);
    const claims = await verifySsoAssertion(assertion, getSsoSecret());
    if (!claims) {
      return jsonResponse(
        { error: { code: "invalid_sso_assertion", message: "A sessão SIGA é inválida ou expirou." } },
        { status: 401 },
      );
    }

    const db = getDb();
    const [replayed] = await db
      .select({ assertionId: adminSessions.assertionId })
      .from(adminSessions)
      .where(eq(adminSessions.assertionId, claims.jti))
      .limit(1);
    if (replayed) {
      return jsonResponse(
        { error: { code: "sso_assertion_replayed", message: "Esta autorização SIGA já foi utilizada." } },
        { status: 409 },
      );
    }

    const token = createOpaqueId("pfa", 32);
    const tokenHash = await sha256(token);
    const maxAgeSeconds = 8 * 60 * 60;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
    const permissions = permissionsForRole(claims.role);
    await db.insert(adminSessions).values({
      tokenHash,
      assertionId: claims.jti,
      userId: claims.sub,
      tenantId: claims.tenant_id,
      schoolId: claims.school_id,
      role: claims.role,
      permissions: JSON.stringify(permissions),
      expiresAt,
      createdAt: now,
    });

    return jsonResponse(
      {
        data: {
          user_id: claims.sub,
          tenant_id: claims.tenant_id,
          school_id: claims.school_id,
          role: claims.role,
          permissions,
          expires_at: expiresAt,
        },
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": sessionCookie(token, request.url, maxAgeSeconds),
        },
      },
    );
  } catch (error) {
    console.error("sso_exchange_failed", error);
    return jsonResponse(
      { error: { code: "sso_exchange_failed", message: "Não foi possível iniciar a sessão PayFlow." } },
      { status: 500 },
    );
  }
}
