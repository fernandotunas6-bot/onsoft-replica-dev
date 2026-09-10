import { describe, expect, it } from "vitest";
import {
  getSchoolInitials,
  renderResetPasswordEmail,
} from "@/features/auth/email-templates/reset-password.html";
import { getAppUrl, getAppName, getAuthResetPasswordUrl } from "@/lib/app-config";
import { isPublicAppPath } from "@/lib/public-paths";
import { requestPasswordResetInputSchema } from "@/features/auth/reset-password-server";

describe("Auth Premium Multi-Tenant - Configuração Centralizada", () => {
  it("deve retornar o nome e URL centralizados da plataforma", () => {
    const appName = getAppName();
    const appUrl = getAppUrl();

    expect(appName).toBe("SIGA Plus");
    expect(appUrl).toContain("portal-siga.com");
  });

  it("deve gerar URL de redefinição de senha baseada na configuração ou no hostname do tenant", () => {
    const defaultUrl = getAuthResetPasswordUrl();
    expect(defaultUrl).toBe("https://portal-siga.com/auth/reset-password");

    const tenantUrl = getAuthResetPasswordUrl("https://colegio-esperanca.portal-siga.com");
    expect(tenantUrl).toBe("https://colegio-esperanca.portal-siga.com/auth/reset-password");
  });
});

describe("Auth Premium Multi-Tenant - Iniciais e Branding da Escola", () => {
  it("deve extrair iniciais corretas ignorando preposições", () => {
    expect(getSchoolInitials("Colégio Horizonte")).toBe("CH");
    expect(getSchoolInitials("Instituto Superior Politécnico de Luanda")).toBe("IS");
    expect(getSchoolInitials("Escola Primária do Futuro")).toBe("EP");
    expect(getSchoolInitials("Liceu")).toBe("LI");
    expect(getSchoolInitials("")).toBe("SP");
  });

  it("deve renderizar o template HTML de e-mail com branding da escola", () => {
    const rendered = renderResetPasswordEmail({
      schoolName: "Colégio Esperança",
      logoUrl: "https://portal-siga.com/storage/v1/object/public/school-logos/logo.png",
      resetUrl: "https://portal-siga.com/auth/reset-password#access_token=test_token&type=recovery",
      platformName: "SIGA Plus",
      platformUrl: "https://portal-siga.com",
      recipientEmail: "diretor@escola.ao",
    });

    expect(rendered.subject).toBe("Redefina a sua senha — Colégio Esperança");
    expect(rendered.html).toContain("Colégio Esperança");
    expect(rendered.html).toContain("Conta Institucional");
    expect(rendered.html).toContain("Redefinir Minha Senha");
    expect(rendered.html).toContain("Gerido com segurança por");
    expect(rendered.html).toContain("SIGA Plus");
    expect(rendered.html).toContain(
      "https://portal-siga.com/storage/v1/object/public/school-logos/logo.png",
    );
    expect(rendered.html).not.toContain("Powered by Supabase");
    expect(rendered.html).not.toContain("Supabase Auth");

    expect(rendered.text).toContain("COLÉGIO ESPERANÇA");
    expect(rendered.text).toContain("SIGA Plus");
  });

  it("deve aplicar fallback elegante com avatar de iniciais quando a escola não tiver logo", () => {
    const rendered = renderResetPasswordEmail({
      schoolName: "Complexo Escolar Alvorecer",
      logoUrl: null,
      resetUrl: "https://portal-siga.com/auth/reset-password#access_token=test_token",
    });

    expect(rendered.html).toContain("CE"); // Iniciais de Complexo Escolar
    expect(rendered.html).toContain("Complexo Escolar Alvorecer");
  });
});

describe("Auth Premium Multi-Tenant - Validação de Schemas e Rotas Públicas", () => {
  it("deve validar o schema de solicitação de redefinição de senha", () => {
    const valid = requestPasswordResetInputSchema.safeParse({
      email: "professor@colegio.com",
      hostname: "colegio.portal-siga.com",
    });
    expect(valid.success).toBe(true);

    const invalidEmail = requestPasswordResetInputSchema.safeParse({
      email: "nao-e-um-email",
    });
    expect(invalidEmail.success).toBe(false);
  });

  it("deve permitir acesso público às rotas /auth sem exigir autenticação prévia", () => {
    expect(isPublicAppPath("/auth/reset-password")).toBe(true);
    expect(isPublicAppPath("/auth")).toBe(true);
    expect(isPublicAppPath("/alterar-senha")).toBe(true);
    expect(isPublicAppPath("/convite/abc-123")).toBe(true);
    expect(isPublicAppPath("/matricula")).toBe(true);

    // Rotas autenticadas continuam protegidas
    expect(isPublicAppPath("/alunos")).toBe(false);
    expect(isPublicAppPath("/financeiro")).toBe(false);
    expect(isPublicAppPath("/pedagogica")).toBe(false);
  });
});

describe("Auth Premium Multi-Tenant - Demais Templates de E-mail Padronizados", () => {
  it("deve renderizar o template de convite institucional com branding", async () => {
    const { renderSchoolInvitationEmail } =
      await import("@/features/auth/email-templates/invitation.html");
    const rendered = renderSchoolInvitationEmail({
      schoolName: "Liceu Rainha Ginga",
      roleName: "Professor(a)",
      invitationUrl: "https://portal-siga.com/convite/token-123",
      recipientEmail: "professor@escola.ao",
    });

    expect(rendered.subject).toBe("Convite Institucional — Liceu Rainha Ginga");
    expect(rendered.html).toContain("Liceu Rainha Ginga");
    expect(rendered.html).toContain("Professor(a)");
    expect(rendered.html).toContain("Aceitar Convite e Entrar");
    expect(rendered.html).not.toContain("Supabase");
  });

  it("deve renderizar o template de magic link com branding", async () => {
    const { renderMagicLinkEmail } =
      await import("@/features/auth/email-templates/magic-link.html");
    const rendered = renderMagicLinkEmail({
      schoolName: "Colégio Futuro Brilhante",
      magicLinkUrl: "https://portal-siga.com/auth/callback#access_token=token-456",
    });

    expect(rendered.subject).toBe("Link de acesso seguro — Colégio Futuro Brilhante");
    expect(rendered.html).toContain("Colégio Futuro Brilhante");
    expect(rendered.html).toContain("Entrar no Portal");
  });

  it("deve renderizar o template de alteração de e-mail com branding", async () => {
    const { renderEmailChangeEmail } =
      await import("@/features/auth/email-templates/email-change.html");
    const rendered = renderEmailChangeEmail({
      schoolName: "Instituto Horizonte",
      newEmail: "novo@horizonte.ao",
      confirmUrl: "https://portal-siga.com/auth/confirm#token=789",
    });

    expect(rendered.subject).toBe("Confirmação de novo e-mail — Instituto Horizonte");
    expect(rendered.html).toContain("novo@horizonte.ao");
    expect(rendered.html).toContain("Confirmar Novo E-mail");
  });

  it("deve renderizar o template de confirmação de cadastro com branding", async () => {
    const { renderSignupConfirmationEmail } =
      await import("@/features/auth/email-templates/signup-confirm.html");
    const rendered = renderSignupConfirmationEmail({
      schoolName: "Escola Nova Geração",
      confirmUrl: "https://portal-siga.com/auth/confirm#token=101",
    });

    expect(rendered.subject).toBe("Confirmação de conta — Escola Nova Geração");
    expect(rendered.html).toContain("Escola Nova Geração");
    expect(rendered.html).toContain("Confirmar e Ativar Conta");
  });
});
