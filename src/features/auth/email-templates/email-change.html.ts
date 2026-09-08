import { getSchoolInitials, sanitizeHexColor } from "./reset-password.html";

export function renderEmailChangeEmail(params: {
  schoolName: string;
  newEmail: string;
  confirmUrl: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  platformName?: string;
  platformUrl?: string;
}): { subject: string; html: string; text: string } {
  const schoolName = params.schoolName?.trim() || "Instituição de Ensino";
  const platformName = params.platformName?.trim() || "SIGA Plus";
  const platformUrl = params.platformUrl?.trim() || "https://portal-siga.com";
  const initials = getSchoolInitials(schoolName);
  const logoUrl = params.logoUrl?.trim() || null;
  const brandColor = sanitizeHexColor(params.primaryColor, "#2563eb");

  const subject = `Confirmação de novo e-mail — ${schoolName}`;

  const text = `
${schoolName.toUpperCase()}
Confirmação de Alteração de E-mail

Olá,

Recebemos um pedido para alterar o endereço de e-mail da sua conta institucional para ${params.newEmail}.

Para confirmar esta alteração, utilize o link seguro:
${params.confirmUrl}

Se não solicitou esta alteração, contacte imediatamente a direcção da sua instituição.

---
${platformName} — Sistema Inteligente de Gestão Académica
${platformUrl}
`.trim();

  const logoMarkup = logoUrl
    ? `<img src="${logoUrl}" alt="${schoolName}" width="64" height="64" style="display:block; border-radius:12px; object-fit:contain; max-width:64px; max-height:64px; border:0; outline:none;" />`
    : `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td align="center" valign="middle" style="width:56px; height:56px; background-color:#1e293b; color:#ffffff; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:20px; font-weight:700; border-radius:14px; letter-spacing:1px; text-transform:uppercase;">
            ${initials}
          </td>
        </tr>
      </table>`;

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #0f172a !important; }
      .card-bg { background-color: #1e293b !important; border-color: #334155 !important; }
      .text-title { color: #f8fafc !important; }
      .text-body { color: #cbd5e1 !important; }
      .text-muted { color: #94a3b8 !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased; color:#334155;" class="email-bg">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; background-color:#f1f5f9; padding:24px 12px;" class="email-bg">
    <tr>
      <td align="center" valign="top">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px; width:100%; border-collapse:collapse;">
          
          <tr><td height="24">&nbsp;</td></tr>

          <tr>
            <td style="background-color:#ffffff; border:1px solid #e2e8f0; border-radius:20px; padding:40px 36px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);" class="card-bg">
              
              <!-- Header -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td align="left" valign="middle" style="padding-bottom:28px; border-bottom:1px solid #f1f5f9;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td valign="middle" style="padding-right:16px;">
                          ${logoMarkup}
                        </td>
                        <td valign="middle">
                          <p style="margin:0; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#64748b;" class="text-muted">
                            Segurança da Conta
                          </p>
                          <h2 style="margin:2px 0 0 0; font-size:20px; font-weight:800; color:#0f172a;" class="text-title">
                            ${schoolName}
                          </h2>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-top:28px;">
                <tr>
                  <td>
                    <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#0f172a;" class="text-title">
                      Confirmar novo e-mail
                    </h1>
                    <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#475569;" class="text-body">
                      Recebemos uma solicitação para alterar o endereço de e-mail associado à sua conta na instituição <strong>${schoolName}</strong> para:
                    </p>
                    <p style="margin:0 0 24px 0; font-size:16px; font-weight:600; color:#2563eb;">
                      ${params.newEmail}
                    </p>
                    <p style="margin:0 0 28px 0; font-size:15px; line-height:1.6; color:#475569;" class="text-body">
                      Para validar esta alteração, clique no botão abaixo:
                    </p>

                    <!-- CTA Button -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:24px 0 32px 0;">
                      <tr>
                        <td align="center">
                          <a href="${params.confirmUrl}" target="_blank" style="display:inline-block; background-color:${brandColor}; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:12px; box-shadow:0 2px 4px rgba(37,99,235,0.25); text-align:center;">
                            Confirmar Novo E-mail
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 0 0; font-size:12px; line-height:1.5; color:#94a3b8; word-break:break-all;" class="text-muted">
                      Se não solicitou esta alteração, ignore esta mensagem e a sua conta continuará segura.
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
                Gerido com segurança por <span style="color:#0f172a; font-weight:700;" class="text-title">${platformName}</span>
              </p>
              <p style="margin:0; font-size:12px;">
                <a href="${platformUrl}" target="_blank" style="color:#64748b; text-decoration:none;" class="text-muted">
                  ${platformUrl.replace(/^https?:\/\//, "")}
                </a>
              </p>
            </td>
          </tr>

          <tr><td height="24">&nbsp;</td></tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
