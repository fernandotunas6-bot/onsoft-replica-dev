import { jsonResponse } from "@/lib/payflow";
import { getPublicRuntimeStatus } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonResponse(
    {
      data: {
        service: "payflow",
        status: "ok",
        runtime: getPublicRuntimeStatus(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
