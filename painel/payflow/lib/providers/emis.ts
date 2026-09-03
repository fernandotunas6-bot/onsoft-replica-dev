import { createMerchantReference, createOpaqueId } from "@/lib/identifiers";
import { isSandboxRuntime } from "@/lib/runtime";

export const emisMethods = ["mcx_express", "payment_reference"] as const;
export type EmisMethod = (typeof emisMethods)[number];

export type EmisInitiation = {
  transactionId: string;
  merchantReference: string;
  status: "awaiting_authorization";
  responseCode: "SANDBOX";
  referenceData: {
    entity: string;
    reference: string;
  } | null;
};

export function initiateEmisSandbox(method: EmisMethod): EmisInitiation {
  if (!isSandboxRuntime()) {
    throw new Error("payment_provider_not_configured");
  }
  const merchantReference = createMerchantReference();
  const transactionId = createOpaqueId("emis_test", 18);
  const numeric = crypto
    .randomUUID()
    .replace(/\D/g, "")
    .padEnd(12, "0")
    .slice(0, 12);

  return {
    transactionId,
    merchantReference,
    status: "awaiting_authorization",
    responseCode: "SANDBOX",
    referenceData:
      method === "payment_reference"
        ? {
            entity: "00000",
            reference: `${numeric.slice(0, 3)} ${numeric.slice(3, 6)} ${numeric.slice(6)}`,
          }
        : null,
  };
}
