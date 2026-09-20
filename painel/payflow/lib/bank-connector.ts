export type ConnectorMovement = {
  transfer_reference: string;
  amount: number;
  currency: string;
  bank_transaction_id: string;
  booked_at: string;
};

export function bankConnectorEligibility(input: {
  connectorUrl: string | null;
  connectorKey: string;
  schoolId: string;
}): { ok: true } | { ok: false; status: number; code: string; message: string } {
  if (!input.schoolId.trim()) {
    return {
      ok: false,
      status: 400,
      code: "school_required",
      message: "Indique school_id da escola a conciliar.",
    };
  }
  if (!input.connectorUrl) {
    return {
      ok: false,
      status: 503,
      code: "bank_connector_not_configured",
      message:
        "PAYFLOW_BANK_CONNECTOR_URL não está definida ou não é HTTPS (localhost só em http).",
    };
  }
  if (input.connectorKey.length < 16) {
    return {
      ok: false,
      status: 503,
      code: "bank_connector_key_required",
      message: "PAYFLOW_BANK_CONNECTOR_KEY deve ter pelo menos 16 caracteres.",
    };
  }
  return { ok: true };
}

export function mapConnectorMovement(
  raw: unknown,
  schoolId: string,
):
  | { ok: true; movement: ConnectorMovement }
  | { ok: false; code: string; message: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "invalid_bank_movement", message: "Movimento inválido." };
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.school_id === "string" && row.school_id.trim() && row.school_id !== schoolId) {
    return {
      ok: false,
      code: "transfer_school_mismatch",
      message: "O conector devolveu um school_id diferente do pedido.",
    };
  }

  const transfer_reference = String(row.transfer_reference ?? "").trim().toUpperCase();
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
  const currency = String(row.currency ?? "").trim().toUpperCase();
  const bank_transaction_id = String(row.bank_transaction_id ?? "").trim();
  const booked_at = String(row.booked_at ?? "").trim();

  if (transfer_reference.length < 12 || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, code: "invalid_bank_movement", message: "Referência ou valor inválidos." };
  }
  if (!/^[A-Z]{3}$/.test(currency) || bank_transaction_id.length < 3) {
    return { ok: false, code: "invalid_bank_movement", message: "Moeda ou movimento inválidos." };
  }
  if (Number.isNaN(Date.parse(booked_at))) {
    return { ok: false, code: "invalid_bank_movement", message: "booked_at inválido." };
  }

  return {
    ok: true,
    movement: { transfer_reference, amount, currency, bank_transaction_id, booked_at },
  };
}

export function parseConnectorPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray((payload as { movements?: unknown }).movements)) {
    return (payload as { movements: unknown[] }).movements;
  }
  return [];
}
