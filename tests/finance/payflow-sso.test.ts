import { describe, expect, it } from "vitest";

import {
  buildPayflowSsoClaims,
  createPayflowSsoAssertion,
  mapSigaRoleToPayflowAdmin,
} from "@/features/finance/payflow-sso";

describe("payflow-sso", () => {
  it("maps SIGA roles to PayFlow admin roles", () => {
    expect(mapSigaRoleToPayflowAdmin("Administrador")).toBe("finance_admin");
    expect(mapSigaRoleToPayflowAdmin("Tesouraria")).toBe("treasurer");
    expect(mapSigaRoleToPayflowAdmin("Secretaria")).toBe("auditor");
    expect(mapSigaRoleToPayflowAdmin("Professor")).toBeNull();
  });

  it("builds short-lived claims compatible with PayFlow verify", async () => {
    const secret = "payflow-sso-test-secret-with-at-least-32-characters";
    const claims = buildPayflowSsoClaims({
      userId: "user-abc",
      tenantId: "tenant-001",
      schoolId: "school-001",
      role: "treasurer",
      now: 1_700_000_000_000,
    });

    expect(claims.iss).toBe("siga-plus");
    expect(claims.aud).toBe("payflow");
    expect(claims.exp - claims.iat).toBe(60);
    expect(claims.jti.length).toBeGreaterThanOrEqual(12);

    const assertion = await createPayflowSsoAssertion(claims, secret);
    expect(assertion.split(".")).toHaveLength(3);
  });

  it("rejects short SSO secrets", async () => {
    const claims = buildPayflowSsoClaims({
      userId: "user-abc",
      tenantId: "tenant-001",
      schoolId: "school-001",
      role: "finance_admin",
    });
    await expect(createPayflowSsoAssertion(claims, "too-short")).rejects.toThrow(/32/);
  });
});
