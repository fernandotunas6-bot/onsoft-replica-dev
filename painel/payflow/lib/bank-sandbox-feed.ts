export type SandboxFeedMovement = {
  school_id: string;
  transfer_reference: string;
  amount: number;
  currency: string;
  bank_transaction_id: string;
  booked_at: string;
};

/** Monta 0 ou 1 movimento a partir da query do feed sandbox (sem side-effects). */
export function buildSandboxFeedMovements(input: {
  schoolId: string;
  transferReference: string;
  amount: number;
  currency: string;
  bankTransactionId: string;
  bookedAt: string;
}): SandboxFeedMovement[] {
  const schoolId = input.schoolId.trim();
  const transferReference = input.transferReference.trim().toUpperCase();
  const currency = input.currency.trim().toUpperCase() || "AOA";
  const bankTransactionId = input.bankTransactionId.trim() || `SANDBOX-${Date.now()}`;
  const bookedAt = input.bookedAt.trim() || new Date().toISOString();

  if (schoolId.length < 8) return [];
  if (transferReference.length < 12) return [];
  if (!Number.isInteger(input.amount) || input.amount <= 0) return [];
  if (!/^[A-Z]{3}$/.test(currency)) return [];
  if (Number.isNaN(Date.parse(bookedAt))) return [];

  return [
    {
      school_id: schoolId,
      transfer_reference: transferReference,
      amount: input.amount,
      currency,
      bank_transaction_id: bankTransactionId,
      booked_at: bookedAt,
    },
  ];
}

export function timingSafeEqualString(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
