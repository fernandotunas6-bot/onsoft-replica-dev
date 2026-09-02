import { describe, expect, it } from "vitest";
import { gatewayConfirmInputSchema } from "@/features/finance/gateway-webhook-schemas";

describe("gatewayConfirmInputSchema", () => {
  it("aceita payload mínimo do webhook EMIS", () => {
    const payload = gatewayConfirmInputSchema.parse({
      apiKey: "school-webhook-key-12345678",
      reference: "123456789",
      amount: 45000,
      invoiceId: "a1111111-2222-3333-4444-555555555555",
    });
    expect(payload.channel).toBe("multicaixa_express");
    expect(payload.amount).toBe(45000);
  });

  it("rejeita apiKey curta", () => {
    expect(() =>
      gatewayConfirmInputSchema.parse({
        apiKey: "short",
        reference: "123456789",
        amount: 100,
      }),
    ).toThrow();
  });
});
