import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ADMIN_PATH, safeAdminNext } from "../../painel/admin/src/lib/safe-next";
import {
  ADMIN_SIGN_IN_FALLBACK,
  adminSignInErrorMessage,
} from "../../painel/admin/src/lib/auth-errors";

describe("ADMIN — destino depois do login (?next=)", () => {
  it("aceita as rotas protegidas da consola, com query", () => {
    expect(safeAdminNext("/tenants/escola?id=abc&tab=dominios")).toBe(
      "/tenants/escola?id=abc&tab=dominios",
    );
    expect(safeAdminNext("/site/messages")).toBe("/site/messages");
  });

  it("/dashboard-2 volta para onde estava (a cópia antiga da lista não o tinha)", () => {
    expect(safeAdminNext("/dashboard-2")).toBe("/dashboard-2");
  });

  it("recusa outros domínios e caminhos fora da consola", () => {
    for (const next of [
      null,
      undefined,
      "",
      "//evil.example/tenants",
      "https://evil.example/tenants",
      "/\\evil.example",
      "tenants",
      "/sign-in",
      "/tenantsX",
      "/errors/not-found",
    ]) {
      expect(safeAdminNext(next), String(next)).toBe(DEFAULT_ADMIN_PATH);
    }
  });

  it("o formulário de login usa a fonte única, sem lista própria", () => {
    const form = readFileSync(
      resolve(process.cwd(), "painel/admin/src/app/(auth)/sign-in/components/login-form-1.tsx"),
      "utf8",
    );
    expect(form).toContain("safeAdminNext(");
    expect(form).not.toContain("SAFE_ADMIN_PREFIXES");
    expect(form).toContain("adminSignInErrorMessage(error)");
    expect(form).not.toContain("setServerError(error.message)");
  });
});

describe("ADMIN — mensagens do login em português", () => {
  it("traduz os códigos do Supabase Auth", () => {
    expect(adminSignInErrorMessage({ code: "invalid_credentials", message: "x" })).toBe(
      "E-mail ou senha incorrectos.",
    );
    expect(adminSignInErrorMessage({ code: "email_not_confirmed" })).toMatch(/Confirme/);
  });

  it("traduz pela mensagem quando não vem código", () => {
    expect(adminSignInErrorMessage({ message: "Invalid login credentials" })).toBe(
      "E-mail ou senha incorrectos.",
    );
    expect(adminSignInErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Sem ligação/);
  });

  it("limite de pedidos e erros desconhecidos", () => {
    expect(adminSignInErrorMessage({ status: 429, message: "slow down" })).toMatch(
      /Demasiadas tentativas/,
    );
    expect(adminSignInErrorMessage({ message: "Database error querying schema" })).toBe(
      ADMIN_SIGN_IN_FALLBACK,
    );
    expect(adminSignInErrorMessage(null)).toBe(ADMIN_SIGN_IN_FALLBACK);
  });
});

describe("ADMIN — recuperar a senha", () => {
  it("encaminha para a recuperação oficial do SIGA em vez do e-mail genérico sem saída", () => {
    const form = readFileSync(
      resolve(
        process.cwd(),
        "painel/admin/src/app/(auth)/forgot-password/components/forgot-password-form-1.tsx",
      ),
      "utf8",
    );
    expect(form).not.toMatch(/resetPasswordForEmail\s*\(/);
    expect(form).toContain('getSigaUrl("/")');
    expect(form).toContain("Esqueceu a senha?");
  });
});
