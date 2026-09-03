import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { assertPublishableSupabaseKey } from "@/integrations/supabase/api-key";

type PermissionCode =
  | "finance.read"
  | "finance.invoice"
  | "finance.payment"
  | "finance.refund"
  | "finance.plans";

type PayflowActor = {
  userId: string;
  schoolId: string;
  token: string;
  userClient: SupabaseClient;
};

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, init);
}

function safeOriginList() {
  const values = [
    process.env["PAYFLOW_ALLOWED_ORIGINS"],
    process.env["VITE_PAYFLOW_URL"],
    process.env["PAYFLOW_URL"],
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (process.env.NODE_ENV !== "production") {
    values.push("http://localhost:3007", "http://127.0.0.1:3007");
  }
  return new Set(values);
}

export function payflowCorsHeaders(request: Request) {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-SIGA-School-ID",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (origin && safeOriginList().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

export function withPayflowCors(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  payflowCorsHeaders(request).forEach((value, key) => headers.set(key, value));
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizedReference(value: string | null | undefined) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizedMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getBearerToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

async function createUserClient(token: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase público não configurado no servidor.");
  assertPublishableSupabaseKey(key, "SUPABASE_PUBLISHABLE_KEY");
  return createClient(url, key, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: undefined,
    },
  });
}

async function requireActor(request: Request, permission: PermissionCode): Promise<PayflowActor> {
  const token = getBearerToken(request);
  if (!token) throw Object.assign(new Error("Sessão PayFlow em falta."), { status: 401 });

  const userClient = await createUserClient(token);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user?.id) {
    throw Object.assign(new Error("Sessão PayFlow inválida ou expirada."), { status: 401 });
  }

  const preferredSchoolId = request.headers.get("x-siga-school-id");
  const membership = await resolveSgaMembershipAdmin(userData.user.id, preferredSchoolId);
  if (!membership?.schoolId) {
    throw Object.assign(new Error("Sem escola activa para esta conta."), { status: 403 });
  }

  const { data: allowed, error: permissionError } = await userClient.rpc("has_school_permission", {
    p_school_id: membership.schoolId,
    p_permission: permission,
  });
  if (permissionError || allowed !== true) {
    throw Object.assign(new Error("Sem permissão para esta operação no PayFlow."), { status: 403 });
  }

  return {
    userId: userData.user.id,
    schoolId: membership.schoolId,
    token,
    userClient,
  };
}

async function audit(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  event: {
    schoolId?: string | null;
    actorId?: string | null;
    actorKind?: "user" | "system" | "gateway" | "bank" | "support";
    action: string;
    entityType: string;
    entityId?: string | null;
    result?: "success" | "denied" | "failed" | "noop";
    metadata?: Record<string, unknown>;
  },
) {
  await db
    .from("payflow_audit_events")
    .insert({
      school_id: event.schoolId ?? null,
      actor_id: event.actorId ?? null,
      actor_kind: event.actorKind ?? (event.actorId ? "user" : "system"),
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      result: event.result ?? "success",
      metadata: event.metadata ?? {},
    })
    .throwOnError();
}

async function loadCheckoutByToken(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  token: string,
) {
  if (!/^[0-9a-f]{32}$/i.test(token)) return null;
  const { data, error } = await db
    .from("payflow_checkouts")
    .select(
      "id, public_token, school_id, invoice_id, student_id, source_type, source_id, merchant_name, title, description, payer_name, payer_email, payer_phone, amount, currency, status, expires_at, paid_at, metadata, created_at",
    )
    .eq("public_token", token.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  if (
    data.status !== "paid" &&
    data.status !== "cancelled" &&
    new Date(String(data.expires_at)).getTime() <= Date.now()
  ) {
    await db
      .from("payflow_checkouts")
      .update({ status: "expired" })
      .eq("id", data.id)
      .neq("status", "paid");
    return { ...data, status: "expired" };
  }
  return data;
}

async function publicCheckout(request: Request, token: string) {
  const db = await loadSgaAdminClient();
  const checkout = await loadCheckoutByToken(db, token);
  if (!checkout || checkout.status === "draft" || checkout.status === "cancelled") {
    return json({ error: "Checkout não encontrado." }, { status: 404 });
  }

  const [{ data: items }, { data: transaction }] = await Promise.all([
    db
      .from("payflow_checkout_items")
      .select("id, label, description, quantity, unit_amount, amount")
      .eq("checkout_id", checkout.id)
      .order("created_at", { ascending: true }),
    db
      .from("payflow_transactions")
      .select("finance_receipt_number, status")
      .eq("checkout_id", checkout.id)
      .eq("status", "settled")
      .order("settled_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const receiptUrl =
    checkout.status === "paid"
      ? new URL(
          "/api/payflow/checkouts/" + encodeURIComponent(checkout.public_token) + "/receipt",
          request.url,
        ).toString()
      : undefined;

  return json({
    id: checkout.public_token,
    merchantName: checkout.merchant_name,
    schoolName:
      typeof checkout.metadata?.schoolName === "string" ? checkout.metadata.schoolName : undefined,
    merchantLogoUrl:
      typeof checkout.metadata?.merchantLogoUrl === "string"
        ? checkout.metadata.merchantLogoUrl
        : undefined,
    title: checkout.title,
    description: checkout.description ?? undefined,
    amount: normalizedMoney(checkout.amount),
    currency: checkout.currency,
    status: checkout.status,
    expiresAt: checkout.expires_at,
    payerName: checkout.payer_name ?? undefined,
    payerEmail: checkout.payer_email ?? undefined,
    receiptUrl,
    receiptNumber: transaction?.finance_receipt_number ?? undefined,
    lineItems: (items ?? []).map((item: Record<string, unknown>) => ({
      id: String(item["id"]),
      label: String(item["label"] ?? ""),
      description: item["description"] ? String(item["description"]) : undefined,
      quantity: normalizedMoney(item["quantity"]),
      unitAmount: normalizedMoney(item["unit_amount"]),
      amount: normalizedMoney(item["amount"]),
    })),
  });
}

async function createBankTransfer(token: string) {
  const db = await loadSgaAdminClient();
  const checkout = await loadCheckoutByToken(db, token);
  if (!checkout) return json({ error: "Checkout não encontrado." }, { status: 404 });
  if (checkout.status === "paid") {
    return json({ error: "Este checkout já está pago." }, { status: 409 });
  }
  if (checkout.status === "expired" || checkout.status === "cancelled") {
    return json({ error: "Este checkout já não aceita pagamentos." }, { status: 409 });
  }

  const { data: existingIntent } = await db
    .from("payflow_payment_intents")
    .select("id, status, amount, currency, expires_at")
    .eq("checkout_id", checkout.id)
    .eq("method", "bank_transfer")
    .in("status", [
      "requires_action",
      "pending",
      "proof_submitted",
      "under_review",
      "verified",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let intent = existingIntent;
  if (!intent) {
    const { data: inserted, error } = await db
      .from("payflow_payment_intents")
      .insert({
        checkout_id: checkout.id,
        school_id: checkout.school_id,
        method: "bank_transfer",
        provider: "bank_transfer",
        amount: checkout.amount,
        currency: checkout.currency,
        status: "pending",
        idempotency_key: "checkout:" + checkout.id + ":bank_transfer",
        expires_at: checkout.expires_at,
      })
      .select("id, status, amount, currency, expires_at")
      .single();
    if (error) throw error;
    intent = inserted;
  }

  const { data: existingTransfer } = await db
    .from("payflow_bank_transfers")
    .select(
      "id, bank_account_id, reference, expected_amount, currency, status, created_at",
    )
    .eq("intent_id", intent.id)
    .maybeSingle();

  let transfer = existingTransfer;
  if (!transfer) {
    const { data: account, error: accountError } = await db
      .from("payflow_bank_accounts")
      .select("id, bank_name, account_holder, iban, currency")
      .eq("school_id", checkout.school_id)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) {
      return json(
        {
          error:
            "A escola ainda não configurou uma conta bancária activa no PayFlow. Contacte a instituição.",
        },
        { status: 503 },
      );
    }

    const reference = "PF-" + String(checkout.public_token).toUpperCase();
    const { data: inserted, error } = await db
      .from("payflow_bank_transfers")
      .insert({
        intent_id: intent.id,
        checkout_id: checkout.id,
        school_id: checkout.school_id,
        bank_account_id: account.id,
        reference,
        expected_amount: checkout.amount,
        currency: checkout.currency,
        status: "pending",
      })
      .select("id, bank_account_id, reference, expected_amount, currency, status, created_at")
      .single();
    if (error) throw error;
    transfer = inserted;
  }

  const { data: account, error: accountError } = await db
    .from("payflow_bank_accounts")
    .select("bank_name, account_holder, iban")
    .eq("id", transfer.bank_account_id)
    .eq("school_id", checkout.school_id)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account) return json({ error: "Conta bancária do checkout indisponível." }, { status: 503 });

  await db
    .from("payflow_checkouts")
    .update({ status: checkout.status === "open" ? "pending" : checkout.status })
    .eq("id", checkout.id);

  await audit(db, {
    schoolId: checkout.school_id,
    actorKind: "system",
    action: "bank_transfer.instructions_issued",
    entityType: "checkout",
    entityId: checkout.id,
    metadata: { intentId: intent.id, transferId: transfer.id },
  });

  return json({
    transferId: transfer.id,
    bankName: account.bank_name,
    accountHolder: account.account_holder,
    iban: account.iban,
    amount: normalizedMoney(transfer.expected_amount),
    currency: transfer.currency,
    reference: transfer.reference,
    expiresAt: checkout.expires_at,
    status: transfer.status === "verified" ? "verified" : checkout.status === "open" ? "pending" : checkout.status,
  });
}

async function uploadProof(request: Request, token: string) {
  const form = await request.formData();
  const file = form.get("file");
  const transferId = String(form.get("transferId") ?? "");
  if (!(file instanceof File)) {
    return json({ error: "Comprovativo em falta." }, { status: 400 });
  }
  if (!transferId) return json({ error: "Transferência em falta." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_PROOF_BYTES) {
    return json({ error: "O comprovativo deve ter no máximo 10 MB." }, { status: 413 });
  }
  const extension = ALLOWED_PROOF_TYPES.get(file.type);
  if (!extension) {
    return json({ error: "Formato inválido. Envie PDF, JPG ou PNG." }, { status: 415 });
  }

  const db = await loadSgaAdminClient();
  const checkout = await loadCheckoutByToken(db, token);
  if (!checkout) return json({ error: "Checkout não encontrado." }, { status: 404 });
  if (checkout.status === "paid" || checkout.status === "expired" || checkout.status === "cancelled") {
    return json({ error: "Este checkout já não aceita comprovativos." }, { status: 409 });
  }

  const { data: transfer, error: transferError } = await db
    .from("payflow_bank_transfers")
    .select("id, intent_id, proof_sha256, proof_storage_path, status")
    .eq("id", transferId)
    .eq("checkout_id", checkout.id)
    .eq("school_id", checkout.school_id)
    .maybeSingle();
  if (transferError) throw transferError;
  if (!transfer) return json({ error: "Transferência não encontrada." }, { status: 404 });

  const bytes = await file.arrayBuffer();
  const digest = await sha256Hex(bytes);
  if (transfer.proof_sha256 === digest && transfer.proof_storage_path) {
    return json({
      ok: true,
      status: "under_review",
      message: "Este comprovativo já tinha sido recebido e continua em validação.",
    });
  }

  const storagePath =
    checkout.school_id +
    "/" +
    checkout.id +
    "/" +
    transfer.id +
    "/" +
    digest +
    "." +
    extension;

  const { error: uploadError } = await db.storage
    .from("payflow-proofs")
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: "0",
    });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
    throw uploadError;
  }

  const now = new Date().toISOString();
  await Promise.all([
    db
      .from("payflow_bank_transfers")
      .update({
        proof_storage_path: storagePath,
        proof_sha256: digest,
        proof_received_at: now,
        status: "under_review",
      })
      .eq("id", transfer.id),
    db
      .from("payflow_payment_intents")
      .update({ status: "under_review" })
      .eq("id", transfer.intent_id),
    db
      .from("payflow_checkouts")
      .update({ status: "under_review" })
      .eq("id", checkout.id),
    db.from("payflow_reconciliation_events").insert({
      school_id: checkout.school_id,
      checkout_id: checkout.id,
      intent_id: transfer.intent_id,
      transfer_id: transfer.id,
      source: "proof",
      result: "received",
      reason: "Comprovativo submetido; ainda não constitui confirmação de liquidação.",
      metadata: { sha256: digest, mimeType: file.type, size: file.size },
    }),
  ]);

  await audit(db, {
    schoolId: checkout.school_id,
    actorKind: "system",
    action: "bank_transfer.proof_received",
    entityType: "bank_transfer",
    entityId: transfer.id,
    metadata: { sha256: digest },
  });

  return json({
    ok: true,
    status: "under_review",
    message:
      "Comprovativo recebido. A transferência só será marcada como paga após conciliação.",
  });
}

async function checkoutStatus(request: Request, token: string) {
  const db = await loadSgaAdminClient();
  const checkout = await loadCheckoutByToken(db, token);
  if (!checkout) return json({ error: "Checkout não encontrado." }, { status: 404 });

  const { data: transaction } = await db
    .from("payflow_transactions")
    .select("status, finance_receipt_number, settled_at")
    .eq("checkout_id", checkout.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return json({
    status: checkout.status,
    paidAt: checkout.paid_at ?? transaction?.settled_at ?? undefined,
    receiptNumber: transaction?.finance_receipt_number ?? undefined,
    receiptUrl:
      checkout.status === "paid"
        ? new URL(
            "/api/payflow/checkouts/" + encodeURIComponent(checkout.public_token) + "/receipt",
            request.url,
          ).toString()
        : undefined,
    message:
      checkout.status === "verified"
        ? "Transferência conciliada. Falta emitir o recibo oficial."
        : undefined,
  });
}

async function receiptHtml(request: Request, token: string) {
  const db = await loadSgaAdminClient();
  const checkout = await loadCheckoutByToken(db, token);
  if (!checkout || checkout.status !== "paid") {
    return new Response("Recibo ainda indisponível.", { status: 404 });
  }
  const { data: transaction } = await db
    .from("payflow_transactions")
    .select("finance_receipt_number, settled_at, amount, currency, reference")
    .eq("checkout_id", checkout.id)
    .eq("status", "settled")
    .order("settled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!transaction?.finance_receipt_number) {
    return new Response("Recibo oficial ainda indisponível.", { status: 404 });
  }

  const html = `<!doctype html>
<html lang="pt-AO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Recibo ${escapeHtml(transaction.finance_receipt_number)}</title>
<style>body{font:14px system-ui;margin:0;background:#f5f6f8;color:#101828}.r{max-width:720px;margin:40px auto;background:#fff;padding:40px;border-radius:18px;border:1px solid #e4e7ec}.h{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #eee;padding-bottom:24px}.n{font-size:28px;font-weight:800}.m{color:#667085}.row{display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid #f2f4f7}.ok{margin-top:24px;padding:14px;border-radius:12px;background:#ecfdf3;color:#067647;font-weight:700}@media print{body{background:#fff}.r{margin:0;border:0}}</style></head>
<body><main class="r"><div class="h"><div><b>PayFlow</b><div class="m">by SIGA Plus</div></div><div style="text-align:right"><div class="m">Recibo</div><div class="n">${escapeHtml(transaction.finance_receipt_number)}</div></div></div>
<h1>${escapeHtml(checkout.merchant_name)}</h1>
<p class="m">${escapeHtml(checkout.title)}</p>
<div class="row"><span>Montante</span><b>${escapeHtml(normalizedMoney(transaction.amount))} ${escapeHtml(transaction.currency)}</b></div>
<div class="row"><span>Referência</span><b>${escapeHtml(transaction.reference ?? "-")}</b></div>
<div class="row"><span>Pago em</span><b>${escapeHtml(transaction.settled_at ?? checkout.paid_at ?? "-")}</b></div>
<div class="ok">Pagamento confirmado e associado ao recibo oficial do SIGA.</div>
<p class="m" style="margin-top:28px">Checkout ${escapeHtml(checkout.public_token)}</p></main></body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function adminOverview(request: Request) {
  const actor = await requireActor(request, "finance.read");
  const db = await loadSgaAdminClient();

  const [
    { count: checkoutCount },
    { count: pendingCount },
    { count: transactionCount },
    { count: reviewCount },
    { count: refundCount },
    { data: settled },
  ] = await Promise.all([
    db.from("payflow_checkouts").select("id", { count: "exact", head: true }).eq("school_id", actor.schoolId),
    db
      .from("payflow_checkouts")
      .select("id", { count: "exact", head: true })
      .eq("school_id", actor.schoolId)
      .in("status", ["pending", "proof_submitted", "under_review", "verified"]),
    db
      .from("payflow_transactions")
      .select("id", { count: "exact", head: true })
      .eq("school_id", actor.schoolId),
    db
      .from("payflow_bank_transfers")
      .select("id", { count: "exact", head: true })
      .eq("school_id", actor.schoolId)
      .in("status", ["proof_submitted", "under_review", "mismatch"]),
    db
      .from("payflow_refunds")
      .select("id", { count: "exact", head: true })
      .eq("school_id", actor.schoolId)
      .in("status", ["requested", "approved", "processing"]),
    db
      .from("payflow_transactions")
      .select("amount")
      .eq("school_id", actor.schoolId)
      .eq("status", "settled"),
  ]);

  const settledAmount = (settled ?? []).reduce(
    (sum: number, row: { amount: number }) => sum + normalizedMoney(row.amount),
    0,
  );

  return json({
    checkouts: checkoutCount ?? 0,
    pending: pendingCount ?? 0,
    transactions: transactionCount ?? 0,
    reconciliationQueue: reviewCount ?? 0,
    refundsOpen: refundCount ?? 0,
    settledAmount,
    currency: "AOA",
  });
}

function sanitizeIntegrationConfig(config: unknown) {
  const source = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (/secret|token|password|api.?key|private|credential|webhook.?key/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

async function adminData(request: Request) {
  const url = new URL(request.url);
  const resource = url.searchParams.get("resource") || "transactions";
  const permission: PermissionCode =
    resource === "refunds"
      ? "finance.refund"
      : resource === "payment-plans"
        ? "finance.plans"
        : "finance.read";
  const actor = await requireActor(request, permission);
  const db = await loadSgaAdminClient();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);

  if (resource === "checkouts") {
    const { data, error } = await db
      .from("payflow_checkouts")
      .select(
        "id, public_token, invoice_id, student_id, source_type, title, payer_name, amount, currency, status, expires_at, paid_at, created_at",
      )
      .eq("school_id", actor.schoolId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "transactions") {
    const { data, error } = await db
      .from("payflow_transactions")
      .select(
        "id, checkout_id, invoice_id, provider, method, amount, currency, status, reference, external_transaction_id, finance_receipt_number, verified_at, settled_at, created_at",
      )
      .eq("school_id", actor.schoolId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "reconciliation") {
    const { data, error } = await db
      .from("payflow_bank_transfers")
      .select(
        "id, checkout_id, intent_id, reference, expected_amount, currency, status, proof_received_at, bank_transaction_id, bank_posted_at, bank_amount, bank_reference, reconciliation_note, created_at",
      )
      .eq("school_id", actor.schoolId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "refunds") {
    const { data, error } = await db
      .from("payflow_refunds")
      .select(
        "id, transaction_id, amount, currency, status, reason, provider_refund_id, requested_at, approved_at, completed_at, failure_message",
      )
      .eq("school_id", actor.schoolId)
      .order("requested_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "invoices" || resource === "receivables") {
    const { data, error } = await db
      .from("finance_invoices")
      .select(
        "id, invoice_number, contract_id, fee_item_id, amount, discount_amount, penalty_amount, due_date, competence_month, status, created_at",
      )
      .eq("school_id", actor.schoolId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "payments") {
    const { data, error } = await db
      .from("finance_receipts")
      .select(
        "id, receipt_number, invoice_id, amount, paid_on, payment_method, status, reversal_reason, created_at",
      )
      .eq("school_id", actor.schoolId)
      .order("paid_on", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "payment-plans") {
    const { data, error } = await db
      .from("finance_payment_plans")
      .select(
        "id, invoice_id, student_id, channel, installments, reference, status, notes, created_at, updated_at",
      )
      .eq("school_id", actor.schoolId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "bank-accounts") {
    const { data, error } = await db
      .from("payflow_bank_accounts")
      .select(
        "id, label, bank_name, account_holder, iban, swift, currency, is_default, is_active, verification_status, verified_at, created_at, updated_at",
      )
      .eq("school_id", actor.schoolId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "integrations") {
    const { data, error } = await db
      .from("school_integrations")
      .select("id, provider, status, config, created_at, updated_at")
      .eq("school_id", actor.schoolId)
      .order("provider", { ascending: true });
    if (error) throw error;
    return json({
      rows: (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        config: sanitizeIntegrationConfig(row["config"]),
      })),
    });
  }

  if (resource === "webhooks") {
    const { data, error } = await db
      .from("payflow_webhook_events")
      .select(
        "id, provider, event_key, event_type, payload_sha256, status, attempts, last_error, received_at, processed_at",
      )
      .eq("school_id", actor.schoolId)
      .order("received_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "notifications") {
    const { data, error } = await db
      .from("payflow_notification_events")
      .select(
        "id, checkout_id, channel, template_key, recipient_hint, status, provider_message_id, attempts, last_error, queued_at, sent_at",
      )
      .eq("school_id", actor.schoolId)
      .order("queued_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "audit") {
    const { data, error } = await db
      .from("payflow_audit_events")
      .select(
        "id, actor_id, actor_kind, action, entity_type, entity_id, result, request_id, created_at",
      )
      .eq("school_id", actor.schoolId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  }

  if (resource === "students") {
    const { data: students, error } = await db
      .from("students")
      .select("id, student_number, person_id, status, created_at")
      .eq("school_id", actor.schoolId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const personIds = [...new Set((students ?? []).map((row: { person_id: string }) => row.person_id))];
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name, email, phone")
          .eq("school_id", actor.schoolId)
          .in("id", personIds)
      : { data: [] as Array<Record<string, unknown>> };
    const peopleMap = new Map((people ?? []).map((p: any) => [p.id, p]));
    return json({
      rows: (students ?? []).map((student: any) => ({
        ...student,
        person: peopleMap.get(student.person_id) ?? null,
      })),
    });
  }

  if (resource === "reports") {
    const [{ data: tx }, { data: refunds }, { data: invoices }] = await Promise.all([
      db
        .from("payflow_transactions")
        .select("amount, status, created_at")
        .eq("school_id", actor.schoolId),
      db
        .from("payflow_refunds")
        .select("amount, status, requested_at")
        .eq("school_id", actor.schoolId),
      db
        .from("finance_invoices")
        .select("amount, discount_amount, penalty_amount, due_date, status")
        .eq("school_id", actor.schoolId),
    ]);
    const settled = (tx ?? [])
      .filter((row: any) => row.status === "settled")
      .reduce((sum: number, row: any) => sum + normalizedMoney(row.amount), 0);
    const refunded = (refunds ?? [])
      .filter((row: any) => row.status === "succeeded")
      .reduce((sum: number, row: any) => sum + normalizedMoney(row.amount), 0);
    const today = new Date().toISOString().slice(0, 10);
    const receivable = (invoices ?? [])
      .filter((row: any) => !["paid", "cancelled"].includes(String(row.status)))
      .reduce(
        (sum: number, row: any) =>
          sum +
          normalizedMoney(row.amount) -
          normalizedMoney(row.discount_amount) +
          normalizedMoney(row.penalty_amount),
        0,
      );
    const overdue = (invoices ?? [])
      .filter(
        (row: any) =>
          !["paid", "cancelled"].includes(String(row.status)) &&
          row.due_date &&
          String(row.due_date) < today,
      )
      .reduce(
        (sum: number, row: any) =>
          sum +
          normalizedMoney(row.amount) -
          normalizedMoney(row.discount_amount) +
          normalizedMoney(row.penalty_amount),
        0,
      );
    return json({ settled, refunded, net: settled - refunded, receivable, overdue, currency: "AOA" });
  }

  return json({ error: "Recurso PayFlow desconhecido." }, { status: 404 });
}

async function createCheckoutAction(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  actor: PayflowActor,
  body: Record<string, unknown>,
) {
  const amount = normalizedMoney(body["amount"]);
  if (amount <= 0) return json({ error: "Montante inválido." }, { status: 400 });
  const invoiceId = typeof body["invoiceId"] === "string" ? body["invoiceId"] : null;
  const studentId = typeof body["studentId"] === "string" ? body["studentId"] : null;
  if (invoiceId) {
    const { data: invoice } = await db
      .from("finance_invoices")
      .select("id, amount, discount_amount, penalty_amount, status")
      .eq("id", invoiceId)
      .eq("school_id", actor.schoolId)
      .maybeSingle();
    if (!invoice) return json({ error: "Fatura não encontrada." }, { status: 404 });
    if (invoice.status === "cancelled" || invoice.status === "paid") {
      return json({ error: "Esta fatura não aceita novo checkout." }, { status: 409 });
    }
  }

  const { data: school } = await db
    .from("schools")
    .select("name")
    .eq("id", actor.schoolId)
    .maybeSingle();
  const { data: row, error } = await db
    .from("payflow_checkouts")
    .insert({
      school_id: actor.schoolId,
      invoice_id: invoiceId,
      student_id: studentId,
      source_type: typeof body["sourceType"] === "string" ? body["sourceType"] : "invoice",
      source_id: typeof body["sourceId"] === "string" ? body["sourceId"] : null,
      merchant_name: String(body["merchantName"] || school?.name || "Instituição Escolar"),
      title: String(body["title"] || "Pagamento escolar"),
      description: typeof body["description"] === "string" ? body["description"] : null,
      payer_name: typeof body["payerName"] === "string" ? body["payerName"] : null,
      payer_email: typeof body["payerEmail"] === "string" ? body["payerEmail"] : null,
      payer_phone: typeof body["payerPhone"] === "string" ? body["payerPhone"] : null,
      amount,
      currency: "AOA",
      status: "open",
      expires_at:
        typeof body["expiresAt"] === "string"
          ? body["expiresAt"]
          : new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      metadata: {
        schoolName: school?.name ?? "Instituição Escolar",
        ...(body["metadata"] && typeof body["metadata"] === "object"
          ? (body["metadata"] as Record<string, unknown>)
          : {}),
      },
      created_by: actor.userId,
    })
    .select("id, public_token, status")
    .single();
  if (error) throw error;

  const items = Array.isArray(body["items"]) ? body["items"] : [];
  if (items.length) {
    const payload = items
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => {
        const quantity = normalizedMoney(item["quantity"] || 1);
        const unitAmount = normalizedMoney(item["unitAmount"] ?? item["amount"]);
        return {
          checkout_id: row.id,
          school_id: actor.schoolId,
          label: String(item["label"] || "Serviço"),
          description: typeof item["description"] === "string" ? item["description"] : null,
          quantity,
          unit_amount: unitAmount,
          amount: normalizedMoney(item["amount"] ?? quantity * unitAmount),
          created_by: actor.userId,
        };
      });
    if (payload.length) await db.from("payflow_checkout_items").insert(payload).throwOnError();
  }

  await audit(db, {
    schoolId: actor.schoolId,
    actorId: actor.userId,
    action: "checkout.created",
    entityType: "checkout",
    entityId: row.id,
  });

  const base = (process.env["PAYFLOW_URL"] || process.env["VITE_PAYFLOW_URL"] || "http://localhost:3007").replace(/\/$/, "");
  return json({ ...row, checkoutUrl: base + "/checkout/" + row.public_token }, { status: 201 });
}

async function saveBankAccountAction(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  actor: PayflowActor,
  body: Record<string, unknown>,
) {
  const iban = String(body["iban"] ?? "").toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z]{2}[A-Z0-9]{13,32}$/.test(iban)) {
    return json({ error: "IBAN inválido." }, { status: 400 });
  }
  const isDefault = body["isDefault"] !== false;
  if (isDefault) {
    await db
      .from("payflow_bank_accounts")
      .update({ is_default: false, updated_by: actor.userId })
      .eq("school_id", actor.schoolId)
      .eq("is_default", true);
  }

  const existingId = typeof body["id"] === "string" ? body["id"] : null;
  const payload = {
    school_id: actor.schoolId,
    label: String(body["label"] || "Conta principal"),
    bank_name: String(body["bankName"] || ""),
    account_holder: String(body["accountHolder"] || ""),
    iban,
    swift: typeof body["swift"] === "string" && body["swift"].trim() ? body["swift"].trim() : null,
    currency: "AOA",
    is_default: isDefault,
    is_active: body["isActive"] !== false,
    updated_by: actor.userId,
  };

  const query = existingId
    ? db
        .from("payflow_bank_accounts")
        .update(payload)
        .eq("id", existingId)
        .eq("school_id", actor.schoolId)
    : db
        .from("payflow_bank_accounts")
        .insert({ ...payload, created_by: actor.userId });

  const { data, error } = await query
    .select("id, label, bank_name, account_holder, iban, swift, is_default, is_active")
    .single();
  if (error) throw error;
  await audit(db, {
    schoolId: actor.schoolId,
    actorId: actor.userId,
    action: existingId ? "bank_account.updated" : "bank_account.created",
    entityType: "bank_account",
    entityId: data.id,
  });
  return json(data, { status: existingId ? 200 : 201 });
}

async function verifyTransferAction(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  actor: PayflowActor,
  body: Record<string, unknown>,
) {
  const transferId = String(body["transferId"] ?? "");
  const bankTransactionId = String(body["bankTransactionId"] ?? "").trim();
  const observedAmount = normalizedMoney(body["amount"]);
  const observedReference = String(body["reference"] ?? "").trim();
  if (!transferId || !bankTransactionId || observedAmount <= 0 || !observedReference) {
    return json({ error: "Dados de conciliação incompletos." }, { status: 400 });
  }

  const { data: transfer, error } = await db
    .from("payflow_bank_transfers")
    .select("id, checkout_id, intent_id, reference, expected_amount, currency, status")
    .eq("id", transferId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (error) throw error;
  if (!transfer) return json({ error: "Transferência não encontrada." }, { status: 404 });

  const amountMatches = Math.abs(normalizedMoney(transfer.expected_amount) - observedAmount) < 0.005;
  const referenceMatches = normalizedReference(transfer.reference) === normalizedReference(observedReference);

  if (!amountMatches || !referenceMatches) {
    await Promise.all([
      db
        .from("payflow_bank_transfers")
        .update({
          status: "mismatch",
          bank_transaction_id: bankTransactionId,
          bank_amount: observedAmount,
          bank_reference: observedReference,
          bank_posted_at:
            typeof body["postedAt"] === "string" ? body["postedAt"] : new Date().toISOString(),
          reconciliation_note: typeof body["note"] === "string" ? body["note"] : null,
        })
        .eq("id", transfer.id),
      db.from("payflow_reconciliation_events").insert({
        school_id: actor.schoolId,
        checkout_id: transfer.checkout_id,
        intent_id: transfer.intent_id,
        transfer_id: transfer.id,
        source: "manual",
        result: "mismatch",
        bank_transaction_id: bankTransactionId,
        expected_amount: transfer.expected_amount,
        observed_amount: observedAmount,
        expected_reference: transfer.reference,
        observed_reference: observedReference,
        reason: !amountMatches ? "Montante divergente." : "Referência divergente.",
        actor_id: actor.userId,
      }),
    ]);
    return json(
      {
        error: !amountMatches
          ? "O montante bancário não coincide com o checkout."
          : "A referência bancária não coincide com o checkout.",
      },
      { status: 409 },
    );
  }

  const postedAt =
    typeof body["postedAt"] === "string" ? body["postedAt"] : new Date().toISOString();
  const now = new Date().toISOString();

  const { data: updatedTransfer, error: updateError } = await db
    .from("payflow_bank_transfers")
    .update({
      status: "verified",
      bank_transaction_id: bankTransactionId,
      bank_amount: observedAmount,
      bank_reference: observedReference,
      bank_posted_at: postedAt,
      reconciliation_note: typeof body["note"] === "string" ? body["note"] : null,
      verified_at: now,
      verified_by: actor.userId,
    })
    .eq("id", transfer.id)
    .select("id")
    .single();
  if (updateError) {
    if (/duplicate|unique/i.test(updateError.message)) {
      return json({ error: "Este movimento bancário já foi conciliado." }, { status: 409 });
    }
    throw updateError;
  }

  const { data: checkout } = await db
    .from("payflow_checkouts")
    .select("invoice_id, amount")
    .eq("id", transfer.checkout_id)
    .eq("school_id", actor.schoolId)
    .maybeSingle();

  let { data: transaction } = await db
    .from("payflow_transactions")
    .select("id, status")
    .eq("intent_id", transfer.intent_id)
    .maybeSingle();

  if (!transaction) {
    const { data: inserted, error: txError } = await db
      .from("payflow_transactions")
      .insert({
        school_id: actor.schoolId,
        checkout_id: transfer.checkout_id,
        intent_id: transfer.intent_id,
        invoice_id: checkout?.invoice_id ?? null,
        provider: "bank_transfer",
        method: "bank_transfer",
        amount: observedAmount,
        currency: transfer.currency,
        status: "verified",
        reference: transfer.reference,
        external_transaction_id: bankTransactionId,
        idempotency_key: "bank:" + actor.schoolId + ":" + bankTransactionId,
        verified_at: now,
      })
      .select("id, status")
      .single();
    if (txError) throw txError;
    transaction = inserted;
  } else {
    await db
      .from("payflow_transactions")
      .update({
        status: transaction.status === "settled" ? "settled" : "verified",
        external_transaction_id: bankTransactionId,
        reference: transfer.reference,
        verified_at: now,
      })
      .eq("id", transaction.id);
  }

  await Promise.all([
    db
      .from("payflow_payment_intents")
      .update({ status: "verified", verified_at: now, external_transaction_id: bankTransactionId })
      .eq("id", transfer.intent_id),
    db
      .from("payflow_checkouts")
      .update({ status: "verified" })
      .eq("id", transfer.checkout_id)
      .neq("status", "paid"),
    db.from("payflow_reconciliation_events").insert({
      school_id: actor.schoolId,
      checkout_id: transfer.checkout_id,
      intent_id: transfer.intent_id,
      transaction_id: transaction.id,
      transfer_id: updatedTransfer.id,
      source: "manual",
      result: "verified",
      bank_transaction_id: bankTransactionId,
      expected_amount: transfer.expected_amount,
      observed_amount: observedAmount,
      expected_reference: transfer.reference,
      observed_reference: observedReference,
      actor_id: actor.userId,
      reason: "Montante e referência conciliados.",
    }),
  ]);

  await audit(db, {
    schoolId: actor.schoolId,
    actorId: actor.userId,
    action: "bank_transfer.verified",
    entityType: "transaction",
    entityId: transaction.id,
    metadata: { bankTransactionId },
  });

  return json({
    ok: true,
    transferId: transfer.id,
    transactionId: transaction.id,
    status: "verified",
    message: "Transferência conciliada. Emita agora o recibo oficial.",
  });
}

async function finalizeTransactionAction(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  actor: PayflowActor,
  body: Record<string, unknown>,
) {
  const transactionId = String(body["transactionId"] ?? "");
  if (!transactionId) return json({ error: "Transação em falta." }, { status: 400 });

  const { data: current, error } = await db
    .from("payflow_transactions")
    .select(
      "id, checkout_id, intent_id, invoice_id, amount, status, reference, finance_receipt_id, finance_receipt_number",
    )
    .eq("id", transactionId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (error) throw error;
  if (!current) return json({ error: "Transação não encontrada." }, { status: 404 });
  if (current.status === "settled") {
    return json({
      ok: true,
      status: "paid",
      receiptId: current.finance_receipt_id,
      receiptNumber: current.finance_receipt_number,
    });
  }
  if (current.status !== "verified") {
    return json(
      { error: "A transação precisa estar conciliada antes da emissão do recibo." },
      { status: 409 },
    );
  }
  if (!current.invoice_id) {
    return json(
      {
        error:
          "Checkout sem fatura financeira associada. Crie/vincule a fatura antes da liquidação.",
      },
      { status: 409 },
    );
  }

  const { data: claimed, error: claimError } = await db
    .from("payflow_transactions")
    .update({ status: "settling" })
    .eq("id", current.id)
    .eq("status", "verified")
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    return json({ error: "Esta transação está a ser liquidada por outro processo." }, { status: 409 });
  }

  const { data: transfer } = await db
    .from("payflow_bank_transfers")
    .select("bank_posted_at")
    .eq("intent_id", current.intent_id)
    .maybeSingle();
  const paidOn = String(transfer?.bank_posted_at ?? new Date().toISOString()).slice(0, 10);

  const { data: outcome, error: paymentError } = await actor.userClient.rpc("register_payment", {
    school_id: actor.schoolId,
    invoice_id: current.invoice_id,
    amount: normalizedMoney(current.amount),
    payment_method: "bank_transfer",
    paid_on: paidOn,
  });

  if (paymentError) {
    const isPermission =
      paymentError.code === "42501" || /aal2|2fa|autoriz|permission/i.test(paymentError.message ?? "");
    if (isPermission) {
      await db.from("payflow_transactions").update({ status: "verified" }).eq("id", current.id);
    }
    await audit(db, {
      schoolId: actor.schoolId,
      actorId: actor.userId,
      action: "transaction.settlement_failed",
      entityType: "transaction",
      entityId: current.id,
      result: "failed",
      metadata: { code: paymentError.code, permissionFailure: isPermission },
    });
    return json(
      {
        error: isPermission
          ? "A emissão do recibo exige sessão AAL2/2FA da Tesouraria."
          : "A liquidação ficou em estado de recuperação para evitar recibo duplicado.",
      },
      { status: isPermission ? 403 : 502 },
    );
  }

  const result = outcome as {
    receiptId: string;
    receiptNumber: string;
    invoiceStatus: string;
  };
  const now = new Date().toISOString();

  await Promise.all([
    db
      .from("payflow_transactions")
      .update({
        status: "settled",
        finance_receipt_id: result.receiptId,
        finance_receipt_number: result.receiptNumber,
        settled_at: now,
      })
      .eq("id", current.id),
    db
      .from("payflow_payment_intents")
      .update({ status: "succeeded", succeeded_at: now })
      .eq("id", current.intent_id),
    db
      .from("payflow_checkouts")
      .update({ status: "paid", paid_at: now })
      .eq("id", current.checkout_id),
    db.from("payflow_reconciliation_events").insert({
      school_id: actor.schoolId,
      checkout_id: current.checkout_id,
      intent_id: current.intent_id,
      transaction_id: current.id,
      source: "manual",
      result: "verified",
      actor_id: actor.userId,
      reason: "Recibo oficial emitido após conciliação.",
      metadata: { receiptId: result.receiptId, receiptNumber: result.receiptNumber },
    }),
  ]);

  await audit(db, {
    schoolId: actor.schoolId,
    actorId: actor.userId,
    action: "transaction.settled",
    entityType: "transaction",
    entityId: current.id,
    metadata: { receiptId: result.receiptId, receiptNumber: result.receiptNumber },
  });

  return json({
    ok: true,
    status: "paid",
    receiptId: result.receiptId,
    receiptNumber: result.receiptNumber,
    invoiceStatus: result.invoiceStatus,
  });
}

async function requestRefundAction(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  actor: PayflowActor,
  body: Record<string, unknown>,
) {
  const transactionId = String(body["transactionId"] ?? "");
  const amount = normalizedMoney(body["amount"]);
  const reason = String(body["reason"] ?? "").trim();
  if (!transactionId || amount <= 0 || reason.length < 3) {
    return json({ error: "Pedido de reembolso inválido." }, { status: 400 });
  }
  const { data: transaction } = await db
    .from("payflow_transactions")
    .select("id, amount, status")
    .eq("id", transactionId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!transaction || !["settled", "partial_refund"].includes(transaction.status)) {
    return json({ error: "A transação não é reembolsável." }, { status: 409 });
  }

  const { data: previous } = await db
    .from("payflow_refunds")
    .select("amount, status")
    .eq("transaction_id", transactionId)
    .in("status", ["requested", "approved", "processing", "succeeded"]);
  const committed = (previous ?? []).reduce(
    (sum: number, row: { amount: number }) => sum + normalizedMoney(row.amount),
    0,
  );
  if (committed + amount > normalizedMoney(transaction.amount)) {
    return json({ error: "O reembolso excede o valor disponível." }, { status: 409 });
  }

  const { data, error } = await db
    .from("payflow_refunds")
    .insert({
      school_id: actor.schoolId,
      transaction_id: transactionId,
      amount,
      currency: "AOA",
      status: "requested",
      reason,
      requested_by: actor.userId,
    })
    .select("id, status, amount, requested_at")
    .single();
  if (error) throw error;

  await audit(db, {
    schoolId: actor.schoolId,
    actorId: actor.userId,
    action: "refund.requested",
    entityType: "refund",
    entityId: data.id,
    metadata: { transactionId, amount },
  });
  return json(data, { status: 201 });
}

async function adminAction(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "JSON inválido." }, { status: 400 });
  const action = String(body["action"] ?? "");
  const permission: PermissionCode =
    action === "request-refund"
      ? "finance.refund"
      : action === "create-checkout"
        ? "finance.invoice"
        : action === "save-bank-account"
          ? "finance.payment"
          : "finance.payment";
  const actor = await requireActor(request, permission);
  const db = await loadSgaAdminClient();

  if (action === "create-checkout") return createCheckoutAction(db, actor, body);
  if (action === "save-bank-account") return saveBankAccountAction(db, actor, body);
  if (action === "verify-transfer") return verifyTransferAction(db, actor, body);
  if (action === "finalize-transaction") return finalizeTransactionAction(db, actor, body);
  if (action === "request-refund") return requestRefundAction(db, actor, body);

  return json({ error: "Acção PayFlow desconhecida." }, { status: 404 });
}

export async function handlePayflowRequest(request: Request, splat: string | undefined) {
  try {
    const path = String(splat ?? "").replace(/^\/+|\/+$/g, "");
    const parts = path.split("/").filter(Boolean);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: payflowCorsHeaders(request) });
    }

    if (parts[0] === "checkouts" && parts[1]) {
      const token = parts[1];
      if (request.method === "GET" && parts.length === 2) return publicCheckout(request, token);
      if (request.method === "POST" && parts[2] === "bank-transfer")
        return createBankTransfer(token);
      if (request.method === "POST" && parts[2] === "proof") return uploadProof(request, token);
      if (request.method === "GET" && parts[2] === "status") return checkoutStatus(request, token);
      if (request.method === "GET" && parts[2] === "receipt") return receiptHtml(request, token);
    }

    if (parts[0] === "admin" && request.method === "GET" && parts[1] === "overview")
      return adminOverview(request);
    if (parts[0] === "admin" && request.method === "GET" && parts[1] === "data")
      return adminData(request);
    if (parts[0] === "admin" && request.method === "POST" && parts[1] === "actions")
      return adminAction(request);

    return json({ error: "Rota PayFlow não encontrada." }, { status: 404 });
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? Number((error as { status: number }).status)
        : 500;
    const message = error instanceof Error ? error.message : "Erro interno do PayFlow.";
    return json({ error: message }, { status });
  }
}
