import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { bankTransferInstructions, payments } from "@/db/schema";
import { requireAdminPermission } from "@/lib/admin-session";
import {
  matchStatementMovements,
  parseBankStatementCsv,
  type BankStatementMovement,
} from "@/lib/bank-statement";
import { schoolScopeForVerification } from "@/lib/school-scope";
import {
  executeBankTransferVerification,
  verifiedPayload,
} from "@/lib/bank-transfer-verify";
import { logPayflowEvent } from "@/lib/ops-log";
import { corsHeaders, isIntegrationAuthorized, jsonResponse } from "@/lib/payflow";

export const dynamic = "force-dynamic";

const MAX_CSV_CHARS = 400_000;

const importSchema = z.object({
  csv: z.string().trim().min(8).max(MAX_CSV_CHARS),
  apply: z.boolean().optional().default(false),
  school_id: z.string().trim().min(8).max(80).optional(),
});

async function readCsvFromRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const apply = String(form.get("apply") ?? "") === "true" || form.get("apply") === "1";
    const schoolId = String(form.get("school_id") ?? "").trim() || undefined;
    if (!(file instanceof File)) {
      return { error: "Envie o ficheiro CSV no campo file." as const };
    }
    if (file.size > MAX_CSV_CHARS) {
      return { error: "O extrato é demasiado grande (máx. 400 KB)." as const };
    }
    const csv = await file.text();
    return { csv, apply, school_id: schoolId };
  }
  const parsed = importSchema.safeParse(await request.json());
  if (!parsed.success) {
    return { error: "Envie um CSV com cabeçalho (referencia, valor, movimento, data)." as const };
  }
  return parsed.data;
}

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
          message: "Sessão administrativa com conciliação ou chave de integração necessária.",
        },
      },
      { status: 401 },
    );
  }

  try {
    const payload = await readCsvFromRequest(request);
    if ("error" in payload && payload.error) {
      return jsonResponse(
        { error: { code: "invalid_statement", message: payload.error } },
        { status: 400 },
      );
    }

    const csv = "csv" in payload ? payload.csv : "";
    const apply = "apply" in payload ? Boolean(payload.apply) : false;
    const scope = schoolScopeForVerification({
      adminSchoolId: adminSession?.schoolId,
      requestedSchoolId: "school_id" in payload ? payload.school_id : undefined,
    });
    if (!scope.ok) {
      return jsonResponse(
        { error: { code: scope.code, message: scope.message } },
        { status: scope.status },
      );
    }
    const requestedSchoolId = scope.schoolId;

    const movements = parseBankStatementCsv(csv);
    if (movements.length === 0) {
      return jsonResponse(
        {
          error: {
            code: "empty_statement",
            message: "O CSV não tem linhas de movimento. Use o modelo com cabeçalho.",
          },
        },
        { status: 400 },
      );
    }

    const pending = await getDb()
      .select({
        transferReference: bankTransferInstructions.transferReference,
        expectedAmountMinor: bankTransferInstructions.expectedAmountMinor,
        currency: bankTransferInstructions.currency,
        status: bankTransferInstructions.status,
        paymentStatus: payments.status,
        schoolId: payments.schoolId,
      })
      .from(bankTransferInstructions)
      .innerJoin(payments, eq(payments.id, bankTransferInstructions.paymentId))
      .where(and(eq(payments.schoolId, requestedSchoolId), eq(payments.provider, "bank_transfer")));

    const matches = matchStatementMovements(movements, pending, { schoolId: requestedSchoolId });
    const applied: Array<ReturnType<typeof verifiedPayload>> = [];
    const applyErrors: Array<{ line: number; code: string; message: string }> = [];

    if (apply) {
      const matchedRows = matches.filter((row) => row.outcome === "matched");
      const byLine = new Map(movements.map((row) => [row.line, row]));
      for (const row of matchedRows) {
        const movement = byLine.get(row.line) as BankStatementMovement;
        const result = await executeBankTransferVerification(
          {
            transfer_reference: movement.transferReference!,
            amount: movement.amountMinor!,
            currency: movement.currency,
            bank_transaction_id: movement.bankTransactionId,
            booked_at: movement.bookedAt ?? new Date().toISOString(),
            source: "bank_statement",
            verified_by: adminSession?.userId ?? "bank_statement_import",
          },
          { adminSession, integrationAuthorized, requiredSchoolId: requestedSchoolId },
        );
        if (!result.ok) {
          applyErrors.push({ line: row.line, code: result.code, message: result.message });
          continue;
        }
        applied.push(verifiedPayload(result, request.url));
      }
    }

    const summary = {
      rows: matches.length,
      matched: matches.filter((row) => row.outcome === "matched").length,
      amount_mismatch: matches.filter((row) => row.outcome === "amount_mismatch").length,
      unknown_reference: matches.filter((row) => row.outcome === "unknown_reference").length,
      invalid_row: matches.filter((row) => row.outcome === "invalid_row").length,
      applied: applied.length,
      dry_run: !apply,
    };

    logPayflowEvent("bank_statement.import", {
      school_id: requestedSchoolId,
      apply,
      matched: summary.matched,
      applied: summary.applied,
      unknown_reference: summary.unknown_reference,
      amount_mismatch: summary.amount_mismatch,
    });

    return jsonResponse({
      data: {
        summary,
        matches,
        applied,
        apply_errors: applyErrors,
      },
    });
  } catch (error) {
    console.error("bank_statement_import_failed", error);
    return jsonResponse(
      {
        error: {
          code: "bank_statement_import_failed",
          message: "Não foi possível importar o extrato bancário.",
        },
      },
      { status: 500 },
    );
  }
}
