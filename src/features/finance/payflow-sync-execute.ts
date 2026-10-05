/**
 * Núcleo servidor-a-servidor SIGA → PayFlow (education sync).
 * Usado pela serverFn e pelo auto-sync opcional após emitir fatura.
 */
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { invoiceNetTotal } from "./invoice-settlement";

export type PayflowStudentSyncResult = {
  ok: true;
  studentCode: string;
  invoicesSynced: number;
  bankAccountsSynced: number;
  syncedAt: string;
  payerUrl: string | null;
  warning: string | null;
};

export async function executePayflowStudentSync(input: {
  schoolId: string;
  studentId: string;
}): Promise<PayflowStudentSyncResult> {
  const apiKey = process.env.PAYFLOW_INTEGRATION_API_KEY?.trim() ?? "";
  if (apiKey.length < 24) {
    throw new Error(
      "PAYFLOW_INTEGRATION_API_KEY não está configurada no servidor SIGA (mín. 24 caracteres).",
    );
  }
  const { getPayflowUrl } = await import("@/lib/ecosystem-urls");
  const syncUrl = getPayflowUrl("/api/v1/education/sync");
  if (!syncUrl) throw new Error("VITE_PAYFLOW_URL não está configurada.");

  const {
    toPayflowStudentCode,
    derivePayflowPaymentPin,
    toPayflowSchoolCode,
    mapEnrollmentStatusToPayflow,
    mapInvoiceStatusToPayflow,
    kzToMinorUnits,
    buildPayflowBankAccount,
  } = await import("./payflow-education-sync");
  const { loadSchoolSettingsBundle } = await import("@/features/school/server");

  const db = await loadSgaAdminClient();
  const { data: student, error: studentError } = await db
    .from("students")
    .select("id, student_number, status, person_id, school_id")
    .eq("id", input.studentId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (studentError) throw publicDatabaseError(studentError, "Não foi possível carregar o aluno.");
  if (!student) throw new Error("Aluno não encontrado nesta escola.");

  const { data: schoolRow } = await db
    .from("schools")
    .select("id, tenant_id, name")
    .eq("id", input.schoolId)
    .maybeSingle();
  const schoolName = typeof schoolRow?.name === "string" ? schoolRow.name : "Escola";
  const tenantId =
    typeof schoolRow?.tenant_id === "string" && schoolRow.tenant_id.trim()
      ? schoolRow.tenant_id.trim()
      : input.schoolId;

  const { data: person } = await db
    .from("people")
    .select("id, full_name, email, phone")
    .eq("id", student.person_id)
    .eq("school_id", input.schoolId)
    .maybeSingle();

  const { data: enrollment } = await db
    .from("enrollments")
    .select("id, class_group_id, academic_year_id, status")
    .eq("student_id", student.id)
    .eq("school_id", input.schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!enrollment?.id || !enrollment.academic_year_id || !enrollment.class_group_id) {
    throw new Error(
      "O aluno precisa de matrícula activa com turma e ano lectivo para sincronizar com o PayFlow.",
    );
  }

  const { data: classGroup } = await db
    .from("class_groups")
    .select("id, name")
    .eq("id", enrollment.class_group_id)
    .eq("school_id", input.schoolId)
    .maybeSingle();

  const { data: guardians } = await db
    .from("student_guardians")
    .select("guardian_person_id, is_primary")
    .eq("student_id", student.id)
    .eq("school_id", input.schoolId)
    .order("is_primary", { ascending: false })
    .limit(1);
  const guardianId = guardians?.[0]?.guardian_person_id
    ? String(guardians[0].guardian_person_id)
    : null;

  let financialResponsible: { name: string; email: string; phone: string } | undefined;
  if (guardianId) {
    const { data: guardianPerson } = await db
      .from("people")
      .select("full_name, email, phone")
      .eq("id", guardianId)
      .eq("school_id", input.schoolId)
      .maybeSingle();
    if (guardianPerson?.full_name) {
      financialResponsible = {
        name: String(guardianPerson.full_name),
        email: typeof guardianPerson.email === "string" ? guardianPerson.email : "",
        phone: typeof guardianPerson.phone === "string" ? guardianPerson.phone : "",
      };
    }
  }

  const { data: contracts } = await db
    .from("finance_contracts")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("enrollment_id", enrollment.id);
  const contractIds = (contracts ?? []).map((c) => c.id as string);
  let invoiceRows: Array<{
    id: string;
    invoice_number: string | null;
    competence_month: string | null;
    amount: number | null;
    discount_amount: number | null;
    penalty_amount: number | null;
    due_date: string | null;
    status: string;
    fee_item_id: string | null;
  }> = [];
  if (contractIds.length) {
    const { data: invoices, error: invoicesError } = await db
      .from("finance_invoices")
      .select(
        "id, invoice_number, competence_month, amount, discount_amount, penalty_amount, due_date, status, fee_item_id",
      )
      .eq("school_id", input.schoolId)
      .in("contract_id", contractIds)
      .order("due_date", { ascending: false })
      .limit(100);
    if (invoicesError) {
      throw publicDatabaseError(invoicesError, "Não foi possível carregar as faturas do aluno.");
    }
    invoiceRows = (invoices ?? []) as typeof invoiceRows;
  }

  const feeIds = [
    ...new Set(invoiceRows.map((row) => row.fee_item_id).filter(Boolean)),
  ] as string[];
  const { data: feeItems } = feeIds.length
    ? await db.from("fee_items").select("id, name").in("id", feeIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const feeNameById = new Map((feeItems ?? []).map((f) => [f.id, f.name]));

  const settings = await loadSchoolSettingsBundle(db, input.schoolId);
  const bank = buildPayflowBankAccount({
    schoolId: input.schoolId,
    accountHolder: settings.banking.account_holder || schoolName,
    bankName: settings.banking.bank_name,
    iban: settings.banking.iban,
    currency: settings.currency || "AOA",
  });

  const payload = {
    school: {
      id: input.schoolId,
      tenant_id: tenantId,
      code: toPayflowSchoolCode(input.schoolId, schoolName),
      name: schoolName.slice(0, 160),
    },
    student: {
      id: student.id,
      code: toPayflowStudentCode(student.student_number, student.id),
      enrollment_id: enrollment.id,
      academic_year_id: enrollment.academic_year_id,
      class_id: enrollment.class_group_id,
      guardian_id: guardianId,
      full_name: (person?.full_name || "Aluno").slice(0, 160),
      class_name: (classGroup?.name || "").slice(0, 120),
      enrollment_status: mapEnrollmentStatusToPayflow(student.status, enrollment.status),
      financial_responsible: financialResponsible,
      payment_pin: derivePayflowPaymentPin(student.id),
    },
    invoices: invoiceRows
      .map((invoice) => {
        // Total a pagar, com a multa por atraso já aplicada (invoice-settlement.ts).
        const net = invoiceNetTotal(invoice);
        const amount = kzToMinorUnits(net);
        if (amount <= 0) return null;
        const due = invoice.due_date || new Date().toISOString().slice(0, 10);
        const feeName = invoice.fee_item_id ? feeNameById.get(invoice.fee_item_id) : null;
        return {
          id: invoice.id,
          code: String(invoice.invoice_number || invoice.id).slice(0, 60),
          description: String(feeName || "Propina escolar").slice(0, 180),
          period: String(invoice.competence_month || "").slice(0, 80),
          amount,
          currency: "AOA",
          due_date: due,
          status: mapInvoiceStatusToPayflow(invoice.status, invoice.due_date),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    bank_accounts: bank ? [bank] : [],
  };

  const response = await fetch(syncUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: {
      student_code?: string;
      invoices_received?: number;
      bank_accounts_received?: number;
      synced_at?: string;
    };
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    throw new Error(
      body.error?.message || `PayFlow recusou a sincronização (HTTP ${response.status}).`,
    );
  }

  return {
    ok: true as const,
    studentCode: body.data?.student_code ?? payload.student.code,
    invoicesSynced: body.data?.invoices_received ?? payload.invoices.length,
    bankAccountsSynced: body.data?.bank_accounts_received ?? payload.bank_accounts.length,
    syncedAt: body.data?.synced_at ?? new Date().toISOString(),
    payerUrl: getPayflowUrl("/aluno/pagar"),
    warning:
      payload.bank_accounts.length === 0
        ? "IBAN da escola não sincronizado — configure Definições → Financeiro."
        : null,
  };
}

/** Auto-sync após emitir fatura — só com PAYFLOW_AUTO_SYNC=1. Nunca bloqueia a emissão. */
export function queuePayflowStudentSyncBestEffort(input: { schoolId: string; studentId: string }) {
  if (process.env.PAYFLOW_AUTO_SYNC?.trim() !== "1") return;
  void executePayflowStudentSync(input).catch((error) => {
    console.warn("payflow_auto_sync_skipped", {
      studentId: input.studentId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}
