import { env } from "cloudflare:workers";

import { createOpaqueId } from "@/lib/identifiers";

type PrivateBucket = {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

function getProofBucket() {
  const bucket = (env as unknown as Record<string, unknown>).TRANSFER_PROOFS;
  if (!bucket || typeof (bucket as PrivateBucket).put !== "function") {
    throw new Error("transfer_proof_storage_unavailable");
  }
  return bucket as PrivateBucket;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function detectContentType(bytes: Uint8Array) {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "application/pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function storeTransferProof(paymentId: string, file: File) {
  if (file.size < 32 || file.size > MAX_PROOF_BYTES) {
    throw new Error("invalid_transfer_proof_size");
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const contentType = detectContentType(bytes);
  if (!contentType) throw new Error("invalid_transfer_proof_type");

  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const sha256 = bytesToHex(new Uint8Array(digest));
  const objectKey = `bank-transfer-proofs/${paymentId}/${createOpaqueId("proof", 24)}`;
  await getProofBucket().put(objectKey, buffer, { httpMetadata: { contentType } });

  return { objectKey, sha256, contentType, sizeBytes: file.size };
}

export async function removeTransferProof(objectKey: string) {
  try {
    await getProofBucket().delete(objectKey);
  } catch {
    // Best-effort cleanup. The database never exposes orphan object keys.
  }
}
