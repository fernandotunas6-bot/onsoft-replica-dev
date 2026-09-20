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

function readRedirectTo(request: Request, form: FormData | null) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("redirect_to")?.trim() || "";
  const fromForm = form ? String(form.get("redirect_to") ?? "").trim() : "";
  const candidate = fromForm || fromQuery || "/admin";
  // Só caminhos relativos internos — evita open redirect.
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/admin";
  return candidate;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const isForm = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
    let form: FormData | null = null;
    let assertion = "";
    if (isForm) {
      form = await request.formData();
      const value = form.get("assertion");
      assertion = typeof value === "string" ? value : "";
    } else {
      assertion = await readAssertion(request);
    }

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

    const cookie = sessionCookie(token, request.url, maxAgeSeconds);
    if (isForm) {
      const redirectTo = readRedirectTo(request, form);
      return new Response(null, {
        status: 303,
        headers: {
          Location: new URL(redirectTo, request.url).toString(),
          "Cache-Control": "no-store",
          "Set-Cookie": cookie,
        },
      });
    }

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
          "Set-Cookie": cookie,
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
