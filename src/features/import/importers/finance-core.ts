import type { SupabaseClient } from "@supabase/supabase-js";
import { invoiceNetTotal, invoiceStatusFromPaid } from "@/features/finance/invoice-settlement";
import { normalizeText } from "../engine/normalize";
import { categoryToFeeKind } from "@/features/finance/server";

/**
 * Resolução de matrícula, plano financeiro, contrato, fatura e recibo para os três
 * importadores financeiros (dividas, pagamentos, historico_financeiro).
 *
 * Replica deliberadamente o modelo real de `src/features/finance/server.ts`
 * (`issueInvoice`, `settleGatewayPayment`): uma fatura pertence a um `finance_contracts`
 * (matrícula + plano), nunca directamente a um aluno, e um pagamento é sempre um
 * `finance_receipts` contra uma fatura existente — não há coluna `amount_paid` na
 * fatura, nem tabela `invoices`/`payments` (essas pertencem ao modelo Lovable que a
 * produção nunca teve).
 */

export type EnrollmentFinanceRef = {
  id: string;
  student_id: string;
  academic_year_id: string;
  status: string;
};

export type FeePlanRef = { id: string; academic_year_id: string; status: string };

export type FeeItemRef = {
  id: string;
  fee_plan_id: string;
  kind: string;
  name: string;
  is_active: boolean;
  /** Preço de uma classe (finance/fee-items.ts); null = preço geral. */
  grade_level_id: string | null;
};

export async function loadEnrollmentFinanceRefs(
  db: SupabaseClient,
  schoolId: string,
): Promise<EnrollmentFinanceRef[]> {
  const { data, error } = await db
    .from("enrollments")
    .select("id, student_id, academic_year_id, status")
    .eq("school_id", schoolId);
  if (error) throw new Error(`Não foi possível carregar matrículas: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    student_id: String(row.student_id),
    academic_year_id: String(row.academic_year_id),
    status: String(row.status),
  }));
}

/**
 * A matrícula do aluno a usar: a do ano lectivo do lote de importação, se indicado
 * (histórico financeiro de anos anteriores precisa disto); senão a mais recente
 * activa, e na ausência dessa, a mais recente de qualquer estado.
 */
export function resolveEnrollmentForStudent(
  studentId: string,
  enrollments: EnrollmentFinanceRef[],
  academicYearId: string | null,
): EnrollmentFinanceRef | null {
  const forStudent = enrollments.filter((row) => row.student_id === studentId);
  if (academicYearId) {
    return forStudent.find((row) => row.academic_year_id === academicYearId) ?? null;
  }
  return forStudent.find((row) => row.status === "active") ?? forStudent[0] ?? null;
}

export async function loadFeePlanRefs(db: SupabaseClient, schoolId: string): Promise<FeePlanRef[]> {
  const { data, error } = await db
    .from("fee_plans")
    .select("id, academic_year_id, status")
    .eq("school_id", schoolId);
  if (error) throw new Error(`Não foi possível carregar planos financeiros: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    academic_year_id: String(row.academic_year_id),
    status: String(row.status),
  }));
}

/** Plano activo do ano lectivo pedido; sem correspondência exacta, qualquer plano activo da escola. */
export function resolveFeePlanForYear(
  plans: FeePlanRef[],
  academicYearId: string | null,
): FeePlanRef | null {
  const active = plans.filter((row) => row.status === "active");
  if (academicYearId) {
    return active.find((row) => row.academic_year_id === academicYearId) ?? active[0] ?? null;
  }
  return active[0] ?? null;
}

export async function loadFeeItemRefs(db: SupabaseClient, schoolId: string): Promise<FeeItemRef[]> {
  // `select("*")`: a coluna da classe só existe depois de 20261005030000.
  const { data, error } = await db
    .from("fee_items")
    .select("*")
    .eq("school_id", schoolId)
    .eq("is_active", true);
  if (error) throw new Error(`Não foi possível carregar itens de taxa: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    fee_plan_id: String(row.fee_plan_id),
    kind: String(row.kind),
    name: String(row.name ?? ""),
    is_active: Boolean(row.is_active),
    grade_level_id: row.grade_level_id ? String(row.grade_level_id) : null,
  }));
}

/** Item de taxa do plano: pelo tipo sugerido pela descrição da linha, senão mensalidade, senão o primeiro activo. */
export function resolveFeeItemForPlan(
  items: FeeItemRef[],
  feePlanId: string,
  descriptionHint: unknown,
): FeeItemRef | null {
  const forPlan = items
    .filter((row) => row.fee_plan_id === feePlanId && row.is_active)
    // O preço de uma classe (finance/fee-items.ts) não etiqueta faturas de outras: o geral primeiro.
    .sort((a, b) => Number(Boolean(a.grade_level_id)) - Number(Boolean(b.grade_level_id)));
  const kind = categoryToFeeKind(normalizeText(descriptionHint));
  if (kind) {
    const byKind = forPlan.find((row) => row.kind === kind);
    if (byKind) return byKind;
  }
  return forPlan.find((row) => row.kind === "tuition") ?? forPlan[0] ?? null;
}

/** Contrato financeiro activo da matrícula: encontra ou cria, mesmo padrão de `issueInvoice`. */
export async function ensureFinanceContract(
  db: SupabaseClient,
  schoolId: string,
  enrollmentId: string,
  feePlanId: string,
  userId: string,
  cache: Map<string, string>,
): Promise<string> {
  const cacheKey = `${enrollmentId}:${feePlanId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { data: existing, error: existingError } = await db
    .from("finance_contracts")
    .select("id")
    .eq("school_id", schoolId)
    .eq("enrollment_id", enrollmentId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existingError)
    throw new Error(`Não foi possível verificar contrato financeiro: ${existingError.message}`);
  if (existing?.id) {
    cache.set(cacheKey, String(existing.id));
    return String(existing.id);
  }

  const { data: created, error } = await db
    .from("finance_contracts")
    .insert({
      school_id: schoolId,
      enrollment_id: enrollmentId,
      fee_plan_id: feePlanId,
      discount_percentage: 0,
      status: "active",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Não foi possível criar o contrato financeiro: ${error.message}`);
  cache.set(cacheKey, String(created.id));
  return String(created.id);
}

/**
 * Insere uma fatura tentando números sequenciais FT-AAAA/NNNN a partir de `startSequence`,
 * repetindo em colisão (23505) — mesma estratégia de `issueInvoice`. Devolve a fatura criada
 * e a sequência que ficou livre a seguir, para o chamador continuar a numeração dentro do lote.
 */
export async function insertInvoiceWithNumber(
  db: SupabaseClient,
  row: {
    school_id: string;
    contract_id: string;
    fee_item_id: string;
    competence_month: string;
    amount: number;
    discount_amount: number;
    due_date: string;
    status: "open";
    issued_by: string;
  },
  year: number,
  startSequence: number,
  preferredNumber: string | null,
): Promise<{ id: string; invoice_number: string; nextSequence: number }> {
  if (preferredNumber) {
    const { data, error } = await db
      .from("finance_invoices")
      .insert({ ...row, invoice_number: preferredNumber })
      .select("id, invoice_number")
      .single();
    if (!error) {
      return {
        id: String(data.id),
        invoice_number: String(data.invoice_number),
        nextSequence: startSequence,
      };
    }
    if (error.code !== "23505") {
      throw new Error(`Erro ao gravar fatura: ${error.message}`);
    }
    // número preferido colidiu (ex.: já usado por outra fatura) — cai para a numeração gerada
  }

  let sequence = startSequence;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = `FT-${year}/${String(sequence).padStart(4, "0")}`;
    const { data, error } = await db
      .from("finance_invoices")
      .insert({ ...row, invoice_number: invoiceNumber })
      .select("id, invoice_number")
      .single();
    if (!error) {
      return {
        id: String(data.id),
        invoice_number: String(data.invoice_number),
        nextSequence: sequence + 1,
      };
    }
    if (error.code === "23505") {
      sequence += 1;
      continue;
    }
    throw new Error(`Erro ao gravar fatura: ${error.message}`);
  }
  throw new Error("Não foi possível gerar um número de fatura livre.");
}

/** Números de recibo já emitidos na escola — protege contra reimportar o mesmo lote de pagamentos duas vezes. */
export async function loadExistingReceiptNumbers(
  db: SupabaseClient,
  schoolId: string,
): Promise<Set<string>> {
  const { data, error } = await db
    .from("finance_receipts")
    .select("receipt_number")
    .eq("school_id", schoolId);
  if (error) throw new Error(`Não foi possível carregar recibos existentes: ${error.message}`);
  return new Set((data ?? []).map((row) => normalizeText(row.receipt_number)).filter(Boolean));
}

export type OpenInvoiceRef = {
  id: string;
  invoice_number: string;
  student_id: string;
  amount: number;
  due_date: string;
  /** "AAAA-MM-01" ou null — o mês a que a fatura respeita, usado para casar o "Mês / Referência" da folha. */
  competence_month: string | null;
  remaining: number;
};

/**
 * Faturas em aberto (`open`/`partially_paid`) por aluno, com o saldo já descontado dos recibos
 * emitidos — é contra isto que `pagamentos` escolhe a fatura a liquidar. `finance_invoices` não
 * tem `student_id`: a ligação é `finance_invoices → finance_contracts → enrollments → student_id`.
 */
export async function loadOpenInvoiceRefs(
  db: SupabaseClient,
  schoolId: string,
): Promise<OpenInvoiceRef[]> {
  const { data: invoices, error: invoicesError } = await db
    .from("finance_invoices")
    .select(
      "id, contract_id, invoice_number, amount, discount_amount, penalty_amount, due_date, competence_month",
    )
    .eq("school_id", schoolId)
    .in("status", ["open", "partially_paid"]);
  if (invoicesError) {
    throw new Error(`Não foi possível carregar faturas em aberto: ${invoicesError.message}`);
  }
  if (!invoices?.length) return [];

  const contractIds = [...new Set(invoices.map((row) => String(row.contract_id)))];
  const { data: contracts, error: contractsError } = await db
    .from("finance_contracts")
    .select("id, enrollment_id")
    .eq("school_id", schoolId)
    .in("id", contractIds);
  if (contractsError) {
    throw new Error(`Não foi possível carregar contratos financeiros: ${contractsError.message}`);
  }
  const enrollmentIdByContract = new Map(
    (contracts ?? []).map((row) => [String(row.id), String(row.enrollment_id)]),
  );

  const enrollmentIds = [...new Set([...enrollmentIdByContract.values()])];
  const { data: enrollments, error: enrollmentsError } = enrollmentIds.length
    ? await db
        .from("enrollments")
        .select("id, student_id")
        .eq("school_id", schoolId)
        .in("id", enrollmentIds)
    : { data: [], error: null };
  if (enrollmentsError) {
    throw new Error(
      `Não foi possível carregar matrículas das faturas: ${enrollmentsError.message}`,
    );
  }
  const studentIdByEnrollment = new Map(
    (enrollments ?? []).map((row) => [String(row.id), String(row.student_id)]),
  );

  const invoiceIds = invoices.map((row) => String(row.id));
  const { data: receipts, error: receiptsError } = await db
    .from("finance_receipts")
    .select("invoice_id, amount")
    .eq("school_id", schoolId)
    .eq("status", "issued")
    .in("invoice_id", invoiceIds);
  if (receiptsError) {
    throw new Error(`Não foi possível carregar recibos existentes: ${receiptsError.message}`);
  }
  const paidByInvoice = new Map<string, number>();
  for (const row of receipts ?? []) {
    const key = String(row.invoice_id);
    paidByInvoice.set(key, (paidByInvoice.get(key) ?? 0) + Number(row.amount || 0));
  }

  return invoices
    .map((row) => {
      const enrollmentId = enrollmentIdByContract.get(String(row.contract_id));
      const studentId = enrollmentId ? studentIdByEnrollment.get(enrollmentId) : undefined;
      // Total a pagar (valor menos desconto mais multa aplicada): a regra de register_payment.
      const amount = invoiceNetTotal(row);
      const paid = paidByInvoice.get(String(row.id)) ?? 0;
      return studentId
        ? {
            id: String(row.id),
            invoice_number: String(row.invoice_number),
            student_id: studentId,
            amount,
            due_date: String(row.due_date),
            competence_month: row.competence_month ? String(row.competence_month) : null,
            remaining: Math.max(0, amount - paid),
          }
        : null;
    })
    .filter((row): row is OpenInvoiceRef => row !== null)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

const MESES = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * "Fevereiro 2026" / "02/2026" / "2026-02" → "2026-02". É o "Mês / Referência" da folha, que
 * o modelo oficial marca como obrigatório: serve para escolher a fatura do mês certo em vez de
 * liquidar sempre a mais antiga em aberto. Devolve null quando não é reconhecível.
 */
export function parseCompetenceMonth(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;

  const iso = text.match(/(\d{4})[-/](\d{1,2})\b/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) return `${iso[1]}-${String(month).padStart(2, "0")}`;
  }

  const numeric = text.match(/\b(\d{1,2})[-/](\d{4})\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    if (month >= 1 && month <= 12) return `${numeric[2]}-${String(month).padStart(2, "0")}`;
  }

  const folded = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const year = folded.match(/\b(\d{4})\b/);
  if (!year) return null;
  const monthIndex = MESES.findIndex((mes) => folded.includes(mes));
  if (monthIndex === -1) return null;
  return `${year[1]}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function mapPaymentMethod(value: unknown): "cash" | "bank_transfer" | "card" | "other" {
  const key = normalizeText(value).toLowerCase();
  if (key.includes("dinheiro") || key.includes("cash")) return "cash";
  if (key.includes("transfer") || key.includes("deposito") || key.includes("depósito")) {
    return "bank_transfer";
  }
  if (
    key.includes("multicaixa") ||
    key.includes("tpa") ||
    key.includes("cartao") ||
    key.includes("cartão") ||
    key.includes("card")
  ) {
    return "card";
  }
  return "other";
}

/**
 * Regista um pagamento directamente em `finance_receipts`, sem passar pela RPC
 * `register_payment` — essa exige sessão interactiva com AAL2 (`private.is_aal2()`), o que uma
 * importação em lote, corrida com o cliente administrativo, nunca tem. Mesmo fallback que
 * `settleGatewayPayment` usa para pagamentos server-to-server (`gateway-webhook-handler.ts`):
 * soma os recibos já emitidos, valida o saldo, grava o recibo e recalcula o estado da fatura.
 * Sem o `FOR UPDATE` da função SQL — aceitável porque a importação processa uma linha de cada vez.
 */
export async function registerReceiptDirect(
  db: SupabaseClient,
  params: {
    schoolId: string;
    invoiceId: string;
    invoiceAmount: number;
    amount: number;
    paymentMethod: "cash" | "bank_transfer" | "card" | "other";
    paidOn: string;
    receivedBy: string;
    receiptNumberHint?: string | null;
  },
): Promise<{ receiptId: string; receiptNumber: string; invoiceStatus: string }> {
  const { data: receipts, error: receiptsError } = await db
    .from("finance_receipts")
    .select("amount")
    .eq("school_id", params.schoolId)
    .eq("invoice_id", params.invoiceId)
    .eq("status", "issued");
  if (receiptsError) {
    throw new Error(`Não foi possível verificar recibos existentes: ${receiptsError.message}`);
  }
  const alreadyPaid = (receipts ?? []).reduce((acc, row) => acc + Number(row.amount || 0), 0);
  if (alreadyPaid + params.amount > params.invoiceAmount + 0.01) {
    const saldo = (params.invoiceAmount - alreadyPaid).toFixed(2);
    throw new Error(
      `O pagamento (${params.amount}) excede o saldo em aberto da fatura (${saldo} Kz).`,
    );
  }

  const hint = normalizeText(params.receiptNumberHint);
  let receiptNumber = hint || `REC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

  let created: { id: string } | null = null;
  let lastError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await db
      .from("finance_receipts")
      .insert({
        school_id: params.schoolId,
        invoice_id: params.invoiceId,
        receipt_number: receiptNumber,
        amount: params.amount,
        paid_on: params.paidOn,
        payment_method: params.paymentMethod,
        status: "issued",
        received_by: params.receivedBy,
      })
      .select("id")
      .single();
    if (!error) {
      created = { id: String(data.id) };
      lastError = null;
      break;
    }
    lastError = error;
    if (error.code === "23505") {
      // Número vindo da folha e já gravado: é o mesmo recibo importado outra
      // vez. Inventar um sufixo criaria um segundo recibo do mesmo pagamento.
      if (hint) {
        throw new Error(`O recibo ${hint} já existe nesta escola; linha ignorada.`);
      }
      receiptNumber = `REC-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      continue;
    }
    break;
  }
  if (!created || lastError) {
    throw new Error(
      `Não foi possível gravar o recibo: ${lastError?.message ?? "erro desconhecido"}`,
    );
  }

  const invoiceStatus = invoiceStatusFromPaid(params.invoiceAmount, alreadyPaid + params.amount);
  const { error: updateError } = await db
    .from("finance_invoices")
    .update({ status: invoiceStatus })
    .eq("school_id", params.schoolId)
    .eq("id", params.invoiceId);
  if (updateError) throw new Error(`Não foi possível actualizar a fatura: ${updateError.message}`);

  return { receiptId: created.id, receiptNumber, invoiceStatus };
}
