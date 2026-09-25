import { describe, expect, it } from "vitest";
import { hasInstitutionalAccess } from "@/features/auth/institutional-access";

describe("SIGA institutional authorization (provider-independent)", () => {
  it("allows active school membership for any provider", () => {
    expect(hasInstitutionalAccess(1, 0)).toBe(true);
  });
  it("allows a platform administrator without a school membership", () => {
    expect(hasInstitutionalAccess(0, 1)).toBe(true);
  });
  it("denies identities with neither school membership nor platform authorization", () => {
    expect(hasInstitutionalAccess(0, 0)).toBe(false);
  });
});
