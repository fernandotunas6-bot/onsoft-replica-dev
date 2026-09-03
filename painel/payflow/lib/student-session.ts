import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { studentPaymentSessions } from "@/db/schema";
import { sha256 } from "@/lib/identifiers";

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function resolveStudentSession(request: Request) {
  const token = readBearerToken(request);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const [session] = await getDb()
    .select()
    .from(studentPaymentSessions)
    .where(eq(studentPaymentSessions.tokenHash, tokenHash))
    .limit(1);

  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  return session;
}
