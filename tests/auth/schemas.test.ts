import { describe, expect, it } from "vitest";
import { updateCurrentProfileInputSchema } from "@/features/auth/schemas";

describe("updateCurrentProfileInputSchema", () => {
  it("aceita telefone angolano opcional", () => {
    expect(
      updateCurrentProfileInputSchema.parse({
        fullName: "Ana Costa",
        phone: "+244923456789",
        expectedUpdatedAt: new Date().toISOString(),
      }).phone,
    ).toBe("+244923456789");
  });

  it("rejeita telefone inválido", () => {
    expect(() =>
      updateCurrentProfileInputSchema.parse({
        fullName: "Ana Costa",
        phone: "123",
        expectedUpdatedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});
