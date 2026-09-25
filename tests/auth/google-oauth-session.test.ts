import { describe, expect, it } from "vitest";
import { hasInstitutionalAccess } from "@/features/auth/institutional-access";

describe("SIGA authorization: Google and password sessions", () => {
  it("allows an active membership to its active institution", () => {
    expect(hasInstitutionalAccess({
      activeMembershipSchoolIds: ["school-a"],
      activeSchoolIds: ["school-a"],
      isPlatformAdmin: false,
    })).toBe(true);
  });

  it("denies memberships attached to a suspended institution", () => {
    expect(hasInstitutionalAccess({
      activeMembershipSchoolIds: ["school-a"],
      activeSchoolIds: [],
      isPlatformAdmin: false,
    })).toBe(false);
  });

  it("does not allow authorization through another school's active record", () => {
    expect(hasInstitutionalAccess({
      activeMembershipSchoolIds: ["school-a"],
      activeSchoolIds: ["school-b"],
      isPlatformAdmin: false,
    })).toBe(false);
  });

  it("denies inactive or missing memberships without platform authorization", () => {
    expect(hasInstitutionalAccess({
      activeMembershipSchoolIds: [],
      activeSchoolIds: ["school-a"],
      isPlatformAdmin: false,
    })).toBe(false);
  });

  it("permits a platform administrator at the identity gate", () => {
    expect(hasInstitutionalAccess({
      activeMembershipSchoolIds: [],
      activeSchoolIds: [],
      isPlatformAdmin: true,
    })).toBe(true);
  });
});
