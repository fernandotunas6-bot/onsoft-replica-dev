import {
  decideEmisWebhookIngress,
  EMIS_WEBHOOK_SIGNATURE_HEADER,
  isEmisProductionAdapterEnabled,
  verifyEmisWebhookSignature,
} from "@/lib/providers/emis-webhook";
import { corsHeaders, jsonResponse } from "@/lib/payflow";
import { reportPayflowEvent } from "@/lib/ops-report";
import { env } from "@/lib/cf-env";
import { isEmisHomologated } from "@/lib/runtime";

export const dynamic = "force-dynamic";

type RuntimeValues = Record<string, unknown>;

function getEmisWebhookSecret() {
  const workerValue = (env as unknown as RuntimeValues)?.EMIS_WEBHOOK_SECRET;
  if (typeof workerValue === "string") return workerValue.trim();
  if (typeof process !== "undefined") {
    return process.env.EMIS_WEBHOOK_SECRET?.trim() ?? "";
  }
  return "";
}

/**
 * Ingress EMIS (fail-closed).
 * Valida homologação + assinatura HMAC; **não** liquida pagamentos até existir
 * adaptador de produção (`isEmisProductionAdapterEnabled` = false).
 */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get(EMIS_WEBHOOK_SIGNATURE_HEADER) ??
    request.headers.get("x-payflow-emis-signature");

  const signatureValid = await verifyEmisWebhookSignature({
    rawBody,
    signatureHeader,
    secret: getEmisWebhookSecret(),
  });

  const decision = decideEmisWebhookIngress({
    homologated: isEmisHomologated(),
    signatureValid,
    productionAdapterEnabled: isEmisProductionAdapterEnabled(),
  });

  if (!decision.ok) {
    reportPayflowEvent("emis.webhook.rejected", {
      code: decision.code,
      http_status: decision.status,
    });
    return jsonResponse(
      {
        error: {
          code: decision.code,
          message: decision.message,
        },
      },
      { status: decision.status },
    );
  }

  reportPayflowEvent("emis.webhook.adapter_not_ready", {
    code: decision.code,
    http_status: decision.status,
  });

  return jsonResponse(
    {
      error: {
        code: decision.code,
        message: decision.message,
        settle: false,
      },
    },
    { status: decision.status },
  );
}
