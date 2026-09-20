import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { bankAccounts, bankTransferInstructions } from "@/db/schema";
import { formatAngolaIban } from "@/lib/angola-banking";

export type BankAccountScope = "platform" | "school";

export async function findActiveBankAccount(input: {
  scope: BankAccountScope;
  currency: string;
  schoolId?: string | null;
}) {
  const ownership =
    input.scope === "school" && input.schoolId
      ? eq(bankAccounts.schoolId, input.schoolId)
      : isNull(bankAccounts.schoolId);

  const [account] = await getDb()
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.scope, input.scope),
        ownership,
        eq(bankAccounts.currency, input.currency),
        eq(bankAccounts.status, "active"),
      ),
    )
    .orderBy(desc(bankAccounts.isPrimary), desc(bankAccounts.updatedAt))
    .limit(1);

  return account ?? null;
}

export async function getBankTransferDetails(paymentId: string) {
  const [record] = await getDb()
    .select({
      instructionId: bankTransferInstructions.id,
      transferReference: bankTransferInstructions.transferReference,
      status: bankTransferInstructions.status,
      expectedAmountMinor: bankTransferInstructions.expectedAmountMinor,
      currency: bankTransferInstructions.currency,
      expiresAt: bankTransferInstructions.expiresAt,
      verifiedAt: bankTransferInstructions.verifiedAt,
      accountHolder: bankAccounts.accountHolder,
      bankName: bankAccounts.bankName,
      iban: bankAccounts.iban,
    })
    .from(bankTransferInstructions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, bankTransferInstructions.bankAccountId))
    .where(eq(bankTransferInstructions.paymentId, paymentId))
    .limit(1);

  return record ?? null;
}

export function publicBankTransfer(
  transfer: NonNullable<Awaited<ReturnType<typeof getBankTransferDetails>>>,
) {
  return {
    reference: transfer.transferReference,
    status: transfer.status,
    beneficiary: transfer.accountHolder,
    bank_name: transfer.bankName,
    iban: formatAngolaIban(transfer.iban),
    amount: transfer.expectedAmountMinor,
    currency: transfer.currency,
    expires_at: transfer.expiresAt,
    verified_at: transfer.verifiedAt,
  };
}
