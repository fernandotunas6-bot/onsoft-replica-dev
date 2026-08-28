import { describe, it, expect } from "vitest";
import {
  gatePassLookupTokens,
  normalizeRfidTag,
  sanitizeGatePassFilterValue,
} from "@/features/catracas/gate-pass-token";
import {
  linkAccessCardRfidInputSchema,
  rotateAccessCardQrInputSchema,
} from "@/features/catracas/schemas";

describe("gate-pass-token helpers", () => {
  it("normalizes RFID tags", () => {
    expect(normalizeRfidTag("  a1 b2 c3  ")).toBe("A1B2C3");
  });

  it("strips PostgREST-breaking characters from filter values", () => {
    expect(sanitizeGatePassFilterValue("CARD,(x)")).toBe("CARDx");
  });

  it("returns original and RFID-normalized lookup tokens when they differ", () => {
    expect(gatePassLookupTokens("ab cd")).toEqual(["ab cd", "ABCD"]);
  });

  it("returns a single token when already normalized", () => {
    expect(gatePassLookupTokens("ABCD")).toEqual(["ABCD"]);
  });

  it("returns empty list for blank input", () => {
    expect(gatePassLookupTokens("   ")).toEqual([]);
  });
});

describe("RFID / QR card schemas", () => {
  it("accepts linkAccessCardRfid with null to clear", () => {
    const parsed = linkAccessCardRfidInputSchema.parse({
      cardId: "123e4567-e89b-12d3-a456-426614174000",
      rfidTag: null,
    });
    expect(parsed.rfidTag).toBeNull();
  });

  it("validates rotateAccessCardQr", () => {
    expect(
      rotateAccessCardQrInputSchema.parse({
        cardId: "123e4567-e89b-12d3-a456-426614174000",
      }).cardId,
    ).toBe("123e4567-e89b-12d3-a456-426614174000");
  });
});
