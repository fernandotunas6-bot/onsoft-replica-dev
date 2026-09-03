export type CheckoutStatus =
  | "open"
  | "pending"
  | "under_review"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled";

export interface CheckoutLineItem {
  id: string;
  label: string;
  description?: string;
  amount: number;
}

export interface Checkout {
  id: string;
  merchantName: string;
  merchantLogoUrl?: string;
  schoolName?: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  status: CheckoutStatus;
  expiresAt?: string;
  lineItems: CheckoutLineItem[];
  receiptUrl?: string;
}

export interface BankTransferInstructions {
  transferId: string;
  bankName: string;
  accountHolder: string;
  iban: string;
  amount: number;
  currency: string;
  reference: string;
  expiresAt?: string;
  status: CheckoutStatus;
}

export interface CheckoutStatusResponse {
  status: CheckoutStatus;
  paidAt?: string;
  receiptUrl?: string;
  message?: string;
}

const apiBase = (import.meta.env.VITE_PAYFLOW_API_BASE || "").replace(/\/$/, "");

function endpoint(path: string): string {
  return apiBase + path;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Não foi possível concluir esta operação.");
  }
  return data;
}

export async function getCheckout(checkoutId: string): Promise<Checkout> {
  const response = await fetch(
    endpoint("/api/payflow/checkouts/" + encodeURIComponent(checkoutId)),
    { headers: { Accept: "application/json" } },
  );
  return readJson<Checkout>(response);
}

export async function createBankTransfer(
  checkoutId: string,
): Promise<BankTransferInstructions> {
  const response = await fetch(
    endpoint("/api/payflow/checkouts/" + encodeURIComponent(checkoutId) + "/bank-transfer"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ method: "bank_transfer" }),
    },
  );
  return readJson<BankTransferInstructions>(response);
}

export async function getCheckoutStatus(
  checkoutId: string,
): Promise<CheckoutStatusResponse> {
  const response = await fetch(
    endpoint("/api/payflow/checkouts/" + encodeURIComponent(checkoutId) + "/status"),
    { headers: { Accept: "application/json" } },
  );
  return readJson<CheckoutStatusResponse>(response);
}

export async function uploadTransferProof(
  checkoutId: string,
  transferId: string,
  file: File,
): Promise<{ ok: true; status: CheckoutStatus; message?: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("transferId", transferId);

  const response = await fetch(
    endpoint("/api/payflow/checkouts/" + encodeURIComponent(checkoutId) + "/proof"),
    { method: "POST", body: form },
  );
  return readJson<{ ok: true; status: CheckoutStatus; message?: string }>(response);
}
