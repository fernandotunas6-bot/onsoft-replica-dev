import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { adminSessions } from "@/db/schema";
import { adminSessionCookie, sessionCookie } from "@/lib/admin-session";
import { sha256 } from "@/lib/identifiers";
import { jsonResponse } from "@/lib/payflow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${adminSessionCookie}=`))
    ?.slice(adminSessionCookie.length + 1);
  if (raw) {
    await getDb()
      .delete(adminSessions)
      .where(eq(adminSessions.tokenHash, await sha256(decodeURIComponent(raw))));
  }
  return jsonResponse(
    { data: { signed_out: true } },
    { headers: { "Set-Cookie": sessionCookie("", request.url, 0), "Cache-Control": "no-store" } },
  );
}
