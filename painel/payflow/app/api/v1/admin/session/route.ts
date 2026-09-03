import { resolveAdminSession } from "@/lib/admin-session";
import { jsonResponse } from "@/lib/payflow";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await resolveAdminSession(request);
  if (!session) {
    return jsonResponse(
      { error: { code: "admin_session_required", message: "Inicie sessão através do SIGA Plus." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return jsonResponse({
    data: {
      user_id: session.userId,
      tenant_id: session.tenantId,
      school_id: session.schoolId,
      role: session.role,
      permissions: session.permissions,
      expires_at: session.expiresAt,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
