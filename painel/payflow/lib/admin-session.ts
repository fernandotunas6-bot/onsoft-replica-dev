import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { adminSessions } from "@/db/schema";
import { sha256 } from "@/lib/identifiers";
import type { PayflowAdminRole } from "@/lib/sso-assertion";

export const adminSessionCookie = "payflow_admin_session";

const rolePermissions: Record<PayflowAdminRole, readonly string[]> = {
  finance_admin: ["dashboard:read", "payments:read", "payments:refund", "reconciliation:read", "reconciliation:write", "bank_accounts:write", "reports:read"],
  treasurer: ["dashboard:read", "payments:read", "reconciliation:read", "reconciliation:write", "reports:read"],
  cashier: ["dashboard:read", "payments:read", "payments:create"],
  auditor: ["dashboard:read", "payments:read", "reconciliation:read", "reports:read", "audit:read"],
};

export function permissionsForRole(role: PayflowAdminRole) {
  return [...rolePermissions[role]];
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export async function resolveAdminSession(request: Request) {
  const token = cookieValue(request, adminSessionCookie);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const [session] = await getDb()
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.tokenHash, tokenHash))
    .limit(1);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  return { ...session, permissions: JSON.parse(session.permissions) as string[] };
}

export async function requireAdminPermission(request: Request, permission: string) {
  const session = await resolveAdminSession(request);
  if (!session || !session.permissions.includes(permission)) return null;
  return session;
}

export function sessionCookie(token: string, requestUrl: string, maxAgeSeconds: number) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${adminSessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
