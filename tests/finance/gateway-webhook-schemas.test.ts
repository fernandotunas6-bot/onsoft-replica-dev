import { describe, expect, it } from "vitest";
import { gatewayConfirmInputSchema } from "@/features/finance/gateway-webhook-schemas";

describe("gatewayConfirmInputSchema", () => {
  it("aceita o aviso EMIS mínimo, com identificador da transacção", () => {
    const payload = gatewayConfirmInputSchema.parse({
      reference: "123456789",
      amount: 45000,
      externalId: "emis-000123",
    });
    expect(payload.channel).toBe("multicaixa_express");
    expect(payload.amount).toBe(45000);
  });

  it("recusa aviso sem externalId (sem ele não há como impedir liquidar duas vezes)", () => {
    expect(
      gatewayConfirmInputSchema.safeParse({ reference: "123456789", amount: 100 }).success,
    ).toBe(false);
  });
});
