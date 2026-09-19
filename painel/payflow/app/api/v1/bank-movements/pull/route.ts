import { corsHeaders, isIntegrationAuthorized, jsonResponse } from "@/lib/payflow";
import { requireAdminPermission } from "@/lib/admin-session";
import {
  bankConnectorEligibility,
  mapConnectorMovement,
  parseConnectorPayload,
} from "@/lib/bank-connector";
import {
  executeBankTransferVerification,
  verifiedPayload,
} from "@/lib/bank-transfer-verify";
import { reportPayflowEvent } from "@/lib/ops-report";
import {
  getBankConnectorKey,
  getBankConnectorUrl,
} from "@/lib/runtime";
import { schoolScopeForVerification } from "@/lib/school-scope";

export const dynamic = "force-dynamic";

/**
 * Puxa movimentos do conector bancário configurado no servidor
 * (`PAYFLOW_BANK_CONNECTOR_URL`) e concilia com fonte `bank_api`.
 * Aceita chave de integração ou SSO com `reconciliation:write`.
 * A URL nunca vem do pedido — evita SSRF.
 */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const integrationAuthorized = isIntegrationAuthorized(request);
  const adminSession = integrationAuthorized
    ? null
    : await requireAdminPermission(request, "reconciliation:write");
  if (!integrationAuthorized && !adminSession) {
    return jsonResponse(
      {
        error: {
          code: "unauthorized",
          message: "Chave de integração ou sessão administrativa com conciliação necessária.",
        },
      },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { school_id?: string };
    const scope = schoolScopeForVerification({
      adminSchoolId: adminSession?.schoolId,
      requestedSchoolId: body.school_id,
    });
    if (!scope.ok) {
      return jsonResponse(
        { error: { code: scope.code, message: scope.message } },
        { status: scope.status },
      );
    }

    const connectorUrl = getBankConnectorUrl();
    const connectorKey = getBankConnectorKey();
    const gate = bankConnectorEligibility({
      connectorUrl,
      connectorKey,
      schoolId: scope.schoolId,
    });
    if (!gate.ok) {
      reportPayflowEvent("bank_connector.pull.rejected", {
        code: gate.code,
        school_id: scope.schoolId,
      });
      return jsonResponse(
        { error: { code: gate.code, message: gate.message } },
        { status: gate.status },
      );
    }

    const pullUrl = new URL(connectorUrl!);
    pullUrl.searchParams.set("school_id", scope.schoolId);
    const upstream = await fetch(pullUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${connectorKey}`,
        Accept: "application/json",
      },
    });
    if (!upstream.ok) {
      reportPayflowEvent("bank_connector.pull.failed", {
        code: "bank_connector_unavailable",
        school_id: scope.schoolId,
      });
      return jsonResponse(
        {
          error: {
            code: "bank_connector_unavailable",
            message: "O conector bancário não respondeu.",
          },
        },
        { status: 502 },
      );
    }

    const rows = parseConnectorPayload(await upstream.json());
    const results: Array<Record<string, unknown>> = [];
    let rejected = 0;
    let applied = 0;

    for (const row of rows) {
      const mapped = mapConnectorMovement(row, scope.schoolId);
      if (!mapped.ok) {
        rejected += 1;
        results.push({ ok: false, code: mapped.code, message: mapped.message });
        continue;
      }

      const result = await executeBankTransferVerification(
        {
          transfer_reference: mapped.movement.transfer_reference,
          amount: mapped.movement.amount,
          currency: mapped.movement.currency,
          bank_transaction_id: mapped.movement.bank_transaction_id,
          booked_at: mapped.movement.booked_at,
          source: "bank_api",
          verified_by: adminSession?.userId ?? "bank_connector_pull",
          school_id: scope.schoolId,
        },
        {
          adminSession,
          integrationAuthorized,
          requiredSchoolId: scope.schoolId,
        },
      );

      if (!result.ok) {
        rejected += 1;
        results.push({ ok: false, code: result.code, message: result.message });
        continue;
      }

      applied += 1;
      results.push({
        ok: true,
        ...verifiedPayload(result, request.url),
      });
    }

    reportPayflowEvent("bank_connector.pull.ok", {
      school_id: scope.schoolId,
      count: results.length,
      rejected,
    });

    return jsonResponse({
      data: {
        school_id: scope.schoolId,
        source: "bank_api",
        count: results.length,
        applied,
        rejected,
        results,
      },
    });
  } catch (error) {
    console.error("bank_connector_pull_failed", error);
    return jsonResponse(
      {
        error: {
          code: "bank_connector_pull_failed",
          message: "Não foi possível puxar movimentos do conector.",
        },
      },
      { status: 500 },
    );
  }
}
