import { describe, expect, it } from "vitest";
import { passwordPolicyMessage, weakSignInPasswordNotice } from "@/lib/password-policy-error";

describe("passwordPolicyMessage", () => {
  it("explica a senha exposta em fugas de dados", () => {
    expect(passwordPolicyMessage({ name: "AuthWeakPasswordError", reasons: ["pwned"] })).toMatch(
      /fugas de dados/,
    );
  });

  it("reconhece o erro da API pelo código", () => {
    expect(passwordPolicyMessage({ code: "weak_password", message: "Password is weak" })).toMatch(
      /política de segurança/,
    );
    expect(passwordPolicyMessage({ code: "weak_password", reasons: ["length"] })).toMatch(
      /8 caracteres/,
    );
    expect(passwordPolicyMessage({ code: "weak_password", reasons: ["characters"] })).toMatch(
      /símbolos/,
    );
  });

  it("não trata outros erros", () => {
    expect(passwordPolicyMessage({ code: "invalid_credentials" })).toBeNull();
    expect(passwordPolicyMessage(new Error("network"))).toBeNull();
    expect(passwordPolicyMessage(null)).toBeNull();
  });
});

describe("weakSignInPasswordNotice", () => {
  it("avisa quando a senha usada ao entrar está exposta", () => {
    expect(weakSignInPasswordNotice({ reasons: ["pwned"], message: "" })).toMatch(/fugas/);
    expect(weakSignInPasswordNotice({ reasons: ["length"], message: "" })).toMatch(/política/);
  });

  it("fica calado sem weakPassword", () => {
    expect(weakSignInPasswordNotice(undefined)).toBeNull();
    expect(weakSignInPasswordNotice(null)).toBeNull();
  });
});
