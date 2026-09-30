import { env } from "@/lib/cf-env";
import { checkDatabase, healthHttpStatus } from "@/lib/health";
import { jsonResponse } from "@/lib/payflow";
import { getPublicRuntimeStatus } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = { database: await checkDatabase(env.DB) };
  const httpStatus = healthHttpStatus(checks);
  return jsonResponse(
    {
      data: {
        service: "payflow",
        status: httpStatus === 200 ? "ok" : "degraded",
        checks,
        runtime: getPublicRuntimeStatus(),
      },
    },
    {
      status: httpStatus,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
