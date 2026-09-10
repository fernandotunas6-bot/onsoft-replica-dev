import { describe, expect, it } from "vitest";
import {
  normalizeResendRecipients,
  resolveResendCredentials,
  resolveResendFromAddress,
} from "@/features/integrations/resend-client";

describe("resend-client", () => {
  it("resolve Resend from address from domain or email", () => {
    expect(resolveResendFromAddress("")).toContain("onboarding@resend.dev");
    expect(resolveResendFromAddress("escola.ao")).toBe("SIGA Plus <noreply@escola.ao>");
    expect(resolveResendFromAddress("https://mail.escola.ao/path")).toBe(
      "SIGA Plus <noreply@mail.escola.ao>",
    );
    expect(resolveResendFromAddress("secretaria@escola.ao")).toBe(
      "SIGA Plus <secretaria@escola.ao>",
    );
  });

  it("resolve credentials from school integration config", () => {
    expect(resolveResendCredentials({})).toBeNull();
    expect(resolveResendCredentials({ merchantId: "re_test", callbackUrl: "escola.ao" })).toEqual({
      apiKey: "re_test",
      from: "SIGA Plus <noreply@escola.ao>",
    });
    expect(resolveResendCredentials({}, "re_env")).toEqual({
      apiKey: "re_env",
      from: "SIGA Plus <onboarding@resend.dev>",
    });
  });

  it("normalizes and dedupes recipients (max 50)", () => {
    expect(normalizeResendRecipients([" A@X.ao ", "a@x.ao", "bad", ""])).toEqual(["a@x.ao"]);
    const many = Array.from({ length: 60 }, (_, i) => `u${i}@escola.ao`);
    expect(normalizeResendRecipients(many)).toHaveLength(50);
  });
});
