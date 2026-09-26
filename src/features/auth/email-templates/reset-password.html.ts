/**
 * Design System de E-mails Transacionais do SIGA Plus
 *
 * Regras:
 * - HTML inline, tabelas e tipografia segura (compatível com Gmail, Outlook, Apple Mail, Android/iOS)
 * - Nível 1: Identidade da Escola (Logo ou Iniciais)
 * - Nível 2: SIGA Plus como infraestrutura institucional
 * - Suporte dark mode
 * - Máximo 600px de largura, espaçamento consistente
 */

export interface SchoolBrandingContext {
  schoolName: string;
  logoUrl?: string | null;
  platformName?: string;
  platformUrl?: string;
}

/** Texto de utilizador (nome da escola, cargo, e-mail) dentro do HTML do e-mail. */
export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Logótipo só por https: nada de `javascript:`, `data:` ou aspas a fugir do atributo. */
export function safeImageUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

export function getSchoolInitials(name: string): string {
  if (!name) return "SP";
  const words = name
    .trim()
    .split(/\s+/)
    .filter(
      (w) => w.length > 0 && !["de", "da", "do", "das", "dos", "e"].includes(w.toLowerCase()),
    );
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + (words[1] ? words[1][0] : "")).toUpperCase();
}

/** Só aceita hex de 3/6 dígitos — evita injeção de CSS/HTML via campo configurável pela escola. */
export function sanitizeHexColor(color: string | null | undefined, fallback: string): string {
  const trimmed = color?.trim() || "";
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : fallback;
}

export function renderResetPasswordEmail(params: {
  schoolName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  resetUrl: string;
  platformName?: string;
  platformUrl?: string;
  recipientEmail?: string;
}): { subject: string; html: string; text: string } {
  const schoolName = params.schoolName?.trim() || "Instituição de Ensino";
  const platformName = params.platformName?.trim() || "SIGA Plus";
  const platformUrl = params.platformUrl?.trim() || "https://portal-siga.com";
  const initials = getSchoolInitials(schoolName);
  const logoUrl = safeImageUrl(params.logoUrl);
  const brandColor = sanitizeHexColor(params.primaryColor, "#2563eb");

  const subject = `Redefina a sua senha — ${schoolName}`;

  const text = `
${schoolName.toUpperCase()}
Redefinição de Senha

Olá,

Recebemos uma solicitação para redefinir a senha da sua conta institucional associada a ${params.recipientEmail || "este endereço"}.

Para criar uma nova senha, utilize o link seguro abaixo:
${params.resetUrl}

Este link é pessoal, intransmissível e expira em breve.
Se não solicitou esta alteração, ignore esta mensagem com segurança. A sua senha atual permanecerá inalterada.

---
Proteção de Conta: Nunca partilhe a sua senha ou este link com ninguém.
${platformName} — Sistema Inteligente de Gestão Académica
${platformUrl}
`.trim();

  const logoMarkup = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(schoolName)}" width="64" height="64" style="display:block; border-radius:12px; object-fit:contain; max-width:64px; max-height:64px; border:0; outline:none; text-decoration:none;" />`
    : `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td align="center" valign="middle" style="width:56px; height:56px; background-color:#1e293b; color:#ffffff; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:20px; font-weight:600; border-radius:14px; letter-spacing:1px; text-transform:uppercase;">
            ${escapeHtml(initials)}
          </td>
        </tr>
      </table>`;

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #0f172a !important; }
      .card-bg { background-color: #1e293b !important; border-color: #334155 !important; }
      .text-title { color: #f8fafc !important; }
      .text-body { color: #cbd5e1 !important; }
      .text-muted { color: #94a3b8 !important; }
      .box-alert { background-color: #0f172a !important; border-color: #334155 !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; color:#334155;" class="email-bg">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; background-color:#f1f5f9; padding:24px 12px;" class="email-bg">
    <tr>
      <td align="center" valign="top">
        <!-- Container 600px -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px; width:100%; border-collapse:collapse;">
          
          <!-- Top Spacing -->
          <tr><td height="24" style="font-size:24px; line-height:24px;">&nbsp;</td></tr>

          <!-- Main Card -->
          <tr>
            <td style="background-color:#ffffff; border:1px solid #e2e8f0; border-radius:20px; padding:40px 36px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05);" class="card-bg">
              
              <!-- Header: School Branding -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td align="left" valign="middle" style="padding-bottom:28px; border-bottom:1px solid #f1f5f9;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td valign="middle" style="padding-right:16px;">
                          ${logoMarkup}
                        </td>
                        <td valign="middle">
                          <p style="margin:0; font-size:12px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#64748b;" class="text-muted">
                            Conta Institucional
                          </p>
                          <h2 style="margin:2px 0 0 0; font-size:20px; font-weight:600; color:#0f172a; line-height:1.25;" class="text-title">
                            ${escapeHtml(schoolName)}
                          </h2>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Main Content -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-top:28px;">
                <tr>
                  <td>
                    <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:600; color:#0f172a; line-height:1.3;" class="text-title">
                      Redefina a sua senha
                    </h1>
                    <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#475569;" class="text-body">
                      Recebemos uma solicitação para redefinir a senha de acesso à plataforma de gestão escolar associada à sua conta.
                    </p>
                    <p style="margin:0 0 28px 0; font-size:15px; line-height:1.6; color:#475569;" class="text-body">
                      Clique no botão seguro abaixo para escolher uma nova senha de acesso:
                    </p>

                    <!-- CTA Button -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:24px 0 32px 0;">
                      <tr>
                        <td align="center">
                          <a href="${escapeHtml(params.resetUrl)}" target="_blank" style="display:inline-block; background-color:${brandColor}; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:12px; box-shadow:0 2px 4px rgba(37,99,235,0.25); text-align:center; min-width:200px;">
                            Redefinir Minha Senha
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Security Alert Box -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin-top:8px;" class="box-alert">
                      <tr>
                        <td style="padding:16px 20px;">
                          <p style="margin:0 0 6px 0; font-size:13px; font-weight:600; color:#0f172a;" class="text-title">
                            🔒 Proteção e Privacidade
                          </p>
                          <p style="margin:0; font-size:13px; line-height:1.5; color:#64748b;" class="text-muted">
                            Este link é de uso pessoal e intransmissível. Se não solicitou a redefinição, nenhuma acção é necessária: a sua conta permanece protegida e a senha atual não foi alterada.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Fallback Link -->
                    <p style="margin:24px 0 0 0; font-size:12px; line-height:1.5; color:#94a3b8; word-break:break-all;" class="text-muted">
                      Caso o botão acima não funcione, copie e cole o seguinte endereço no seu navegador:<br>
                      <a href="${escapeHtml(params.resetUrl)}" style="color:${brandColor}; text-decoration:underline;">${escapeHtml(params.resetUrl)}</a>
                    </p>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 12px 16px 12px; text-align:center;">
              <p style="margin:0 0 6px 0; font-size:13px; font-weight:600; color:#64748b;" class="text-muted">
                Gerido com segurança por <span style="color:#0f172a; font-weight:600;" class="text-title">${escapeHtml(platformName)}</span>
              </p>
              <p style="margin:0 0 12px 0; font-size:12px; color:#94a3b8;" class="text-muted">
                Sistema Inteligente de Gestão Académica
              </p>
              <p style="margin:0; font-size:12px;">
                <a href="${escapeHtml(platformUrl)}" target="_blank" style="color:#64748b; text-decoration:none; font-weight:500;" class="text-muted">
                  ${platformUrl.replace(/^https?:\/\//, "")}
                </a>
              </p>
            </td>
          </tr>

          <!-- Bottom Spacing -->
          <tr><td height="24" style="font-size:24px; line-height:24px;">&nbsp;</td></tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
