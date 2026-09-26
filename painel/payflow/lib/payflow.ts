import { getIntegrationApiKey } from "@/lib/runtime";

export const paymentStatuses = ["pending", "paid", "failed", "refunded"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export type PaymentRecord = {
  id: string;
  amountMinor: number;
  currency: string;
  description: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  externalReference: string;
  sourceApp: string;
  status: PaymentStatus;
  paymentMethod: string;
  provider: string;
  checkoutToken: string;
  idempotencyKey: string | null;
  metadata: string;
  schoolId: string | null;
  studentId: string | null;
  invoiceId: string | null;
  providerTransactionId: string | null;
  merchantReference: string | null;
  createdAt: string;
  updatedAt: string;
};

export function createPaymentId() {
  return `pay_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

export function createCheckoutToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

export function safeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function isIntegrationAuthorized(request: Request) {
  const expected = getIntegrationApiKey();
  if (expected.length < 24) return false;
  const authorization = request.headers.get("authorization");
  const apiKey = request.headers.get("x-api-key");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : apiKey?.trim() ?? "";
  return safeEqual(supplied, expected);
}

export const corsHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key, X-API-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { ...corsHeaders, ...(init?.headers ?? {}) },
  });
}

export function publicPayment(payment: PaymentRecord, requestUrl: string) {
  const checkoutUrl = new URL(`/checkout/${payment.checkoutToken}`, requestUrl).toString();
  return {
    id: payment.id,
    amount: payment.amountMinor,
    currency: payment.currency,
    description: payment.description,
    customer: {
      name: payment.customerName,
      email: payment.customerEmail,
      phone: payment.customerPhone,
    },
    external_reference: payment.externalReference,
    source_app: payment.sourceApp,
    status: payment.status,
    payment_method: payment.paymentMethod || null,
    provider: payment.provider,
    school_id: payment.schoolId,
    student_id: payment.studentId,
    invoice_id: payment.invoiceId,
    provider_transaction_id: payment.providerTransactionId,
    merchant_reference: payment.merchantReference,
    checkout_url: checkoutUrl,
    created_at: payment.createdAt,
    updated_at: payment.updatedAt,
  };
}
