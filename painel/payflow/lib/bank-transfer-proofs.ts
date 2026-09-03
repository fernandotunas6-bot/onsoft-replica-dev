import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  bankTransferInstructions,
  bankTransferProofs,
  paymentEvents,
} from "@/db/schema";
import { createOpaqueId } from "@/lib/identifiers";
import { removeTransferProof, storeTransferProof } from "@/lib/transfer-proof-storage";

export async function submitBankTransferProof(paymentId: string, file: File) {
  const db = getDb();
  const [instruction] = await db
    .select()
    .from(bankTransferInstructions)
    .where(eq(bankTransferInstructions.paymentId, paymentId))
    .limit(1);

  if (!instruction || !["awaiting_transfer", "proof_submitted"].includes(instruction.status)) {
    throw new Error("bank_transfer_not_awaiting_proof");
  }
  if (Date.parse(instruction.expiresAt) <= Date.now()) {
    throw new Error("bank_transfer_expired");
  }

  const stored = await storeTransferProof(paymentId, file);
  const [existing] = await db
    .select({ id: bankTransferProofs.id, status: bankTransferProofs.status })
    .from(bankTransferProofs)
    .where(
      and(
        eq(bankTransferProofs.instructionId, instruction.id),
        eq(bankTransferProofs.sha256, stored.sha256),
      ),
    )
    .limit(1);
  if (existing) {
    await removeTransferProof(stored.objectKey);
    return { proofId: existing.id, status: existing.status, duplicate: true };
  }

  const previous = await db
    .select({ id: bankTransferProofs.id })
    .from(bankTransferProofs)
    .where(eq(bankTransferProofs.instructionId, instruction.id))
    .limit(3);
  if (previous.length >= 3) {
    await removeTransferProof(stored.objectKey);
    throw new Error("bank_transfer_proof_limit_reached");
  }

  const proofId = createOpaqueId("btp", 22);
  const now = new Date().toISOString();
  try {
    await db.insert(bankTransferProofs).values({
      id: proofId,
      instructionId: instruction.id,
      objectKey: stored.objectKey,
      sha256: stored.sha256,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      status: "submitted",
      createdAt: now,
    });
    await db
      .update(bankTransferInstructions)
      .set({ status: "proof_submitted", updatedAt: now })
      .where(eq(bankTransferInstructions.id, instruction.id));
    await db.insert(paymentEvents).values({
      paymentId,
      type: "bank_transfer.proof_submitted",
      payload: JSON.stringify({ proof_id: proofId, content_type: stored.contentType, size: stored.sizeBytes }),
      createdAt: now,
    });
  } catch (error) {
    await removeTransferProof(stored.objectKey);
    throw error;
  }

  return { proofId, status: "submitted", duplicate: false };
}
