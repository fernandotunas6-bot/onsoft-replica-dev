import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderSchoolInvitationEmail } from "@/features/auth/email-templates/invitation.html";
import {
  renderResetPasswordEmail,
  safeImageUrl,
} from "@/features/auth/email-templates/reset-password.html";

const evil = 'Escola <a href="https://phish.example">Clique aqui</a>';

describe("e-mails: texto de utilizador não vira HTML", () => {
  it("nome da escola e cargo aparecem escapados no convite", () => {
    const { html, text } = renderSchoolInvitationEmail({
      schoolName: evil,
      roleName: "<b>Admin</b>",
      invitationUrl: "https://portal-siga.com/convite/abc?x=1&y=2",
    });
    expect(html).not.toContain('<a href="https://phish.example">');
    expect(html).toContain("&lt;a href=&quot;https://phish.example&quot;&gt;");
    expect(html).not.toContain("<b>Admin</b>");
    expect(html).toContain("x=1&amp;y=2");
    // O texto simples mantém o nome tal como é.
    expect(text).toContain(evil);
  });

  it("logótipo só por https", () => {
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl('https://x.ao/a.png" onerror="x')).toBe('https://x.ao/a.png" onerror="x');
    expect(safeImageUrl("http://x.ao/logo.png")).toBeNull();
    const { html } = renderResetPasswordEmail({
      schoolName: "Escola",
      logoUrl: 'https://x.ao/a.png" onerror="alert(1)',
      resetUrl: "https://portal-siga.com/r",
    } as Parameters<typeof renderResetPasswordEmail>[0]);
    expect(html).not.toContain('" onerror="alert(1)');
  });
});

describe("envio de e-mail com a chave da plataforma", () => {
  const source = readFileSync(join(process.cwd(), "src/features/integrations/server.ts"), "utf8");
  const start = source.indexOf("export const sendSchoolResendEmail ");
  const body = source.slice(start, source.indexOf("export const ", start + 1));

  it("não aceita HTML do cliente", () => {
    expect(source).not.toMatch(/html: z\.string\(\)/);
    expect(body).not.toMatch(/data\.html/);
  });

  it("limita envios, restringe destinatários à escola e força o remetente do sistema", () => {
    expect(body).toMatch(/PLATFORM_EMAIL_RATE_LIMIT/);
    expect(body).toMatch(/\.eq\("school_id", membership\.schoolId\)\s*\.in\("email", recipients\)/);
    expect(body).toMatch(/from = resolveSystemSender\(/);
  });
});
