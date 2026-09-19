export function refundEligibility(input: {
  paymentStatus: string;
  paymentSchoolId: string | null;
  requiredSchoolId: string;
  actorRole: string;
  reason: string;
}): { ok: true; idempotent?: boolean } | { ok: false; status: number; code: string; message: string } {
  if (input.actorRole !== "finance_admin") {
    return {
      ok: false,
      status: 403,
      code: "refund_requires_finance_admin",
      message: "O estorno exige o papel finance_admin (Administrador SIGA via SSO).",
    };
  }
  if (!input.paymentSchoolId || input.paymentSchoolId !== input.requiredSchoolId) {
    return {
      ok: false,
      status: 403,
      code: "transfer_school_mismatch",
      message: "Este pagamento não pertence à escola da sessão administrativa.",
    };
  }
  if (input.reason.trim().length < 8) {
    return {
      ok: false,
      status: 400,
      code: "refund_reason_required",
      message: "Descreva o motivo do estorno (mínimo 8 caracteres).",
    };
  }
  if (input.paymentStatus === "refunded") {
    return { ok: true, idempotent: true };
  }
  if (input.paymentStatus !== "paid") {
    return {
      ok: false,
      status: 409,
      code: "payment_not_paid",
      message: "Só é possível estornar um pagamento já liquidado.",
    };
  }
  return { ok: true };
}
