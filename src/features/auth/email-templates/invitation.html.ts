import { getSchoolInitials, sanitizeHexColor } from "./reset-password.html";

export function renderSchoolInvitationEmail(params: {
  schoolName: string;
  roleName: string;
  invitationUrl: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  platformName?: string;
  platformUrl?: string;
  recipientEmail?: string;
  invitedByName?: string;
}): { subject: string; html: string; text: string } {
  const schoolName = params.schoolName?.trim() || "Instituição de Ensino";
  const roleName = params.roleName?.trim() || "Membro da Equipa";
  const platformName = params.platformName?.trim() || "SIGA Plus";
  const platformUrl = params.platformUrl?.trim() || "https://portal-siga.com";
  const initials = getSchoolInitials(schoolName);
  const logoUrl = params.logoUrl?.trim() || null;
  const brandColor = sanitizeHexColor(params.primaryColor, "#2563eb");

  const subject = `Convite Institucional — ${schoolName}`;

  const text = `
${schoolName.toUpperCase()}
Convite de Acesso à Plataforma

Olá,

Foi convidado(a) para se juntar à equipa de ${schoolName} com o perfil de ${roleName}.

Para aceitar o convite e configurar o seu acesso, utilize o link seguro:
${params.invitationUrl}

Este convite é pessoal e intransmissível.

---
${platformName} — Sistema Inteligente de Gestão Académica
${platformUrl}
`.trim();

  const logoMarkup = logoUrl
    ? `<img src="${logoUrl}" alt="${schoolName}" width="64" height="64" style="display:block; border-radius:12px; object-fit:contain; max-width:64px; max-height:64px; border:0; outline:none;" />`
    : `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td align="center" valign="middle" style="width:56px; height:56px; background-color:#1e293b; color:#ffffff; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:20px; font-weight:600; border-radius:14px; letter-spacing:1px; text-transform:uppercase;">
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
      .box-alert { background-color: #0f172a !important; border-color: #334155 !important; }
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
                          <p style="margin:0; font-size:12px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#64748b;" class="text-muted">
                            Convite Institucional
                          </p>
                          <h2 style="margin:2px 0 0 0; font-size:20px; font-weight:600; color:#0f172a;" class="text-title">
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
                    <h1 style="margin:0 0 16px 0; font-size:22px; font-weight:600; color:#0f172a;" class="text-title">
                      Junte-se à equipa
                    </h1>
                    <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#475569;" class="text-body">
                      Foi convidado(a) para aceder à plataforma de gestão escolar de <strong>${schoolName}</strong> com o perfil de <strong>${roleName}</strong>.
                    </p>
                    <p style="margin:0 0 28px 0; font-size:15px; line-height:1.6; color:#475569;" class="text-body">
                      Clique no botão abaixo para aceitar o convite e iniciar a sua sessão com segurança:
                    </p>

                    <!-- CTA Button -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:24px 0 32px 0;">
                      <tr>
                        <td align="center">
                          <a href="${params.invitationUrl}" target="_blank" style="display:inline-block; background-color:${brandColor}; color:#ffffff; font-size:15px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:12px; box-shadow:0 2px 4px rgba(37,99,235,0.25); text-align:center;">
                            Aceitar Convite e Entrar
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Fallback Link -->
                    <p style="margin:24px 0 0 0; font-size:12px; line-height:1.5; color:#94a3b8; word-break:break-all;" class="text-muted">
                      Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                      <a href="${params.invitationUrl}" style="color:#2563eb; text-decoration:underline;">${params.invitationUrl}</a>
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
                Gerido com segurança por <span style="color:#0f172a; font-weight:600;" class="text-title">${platformName}</span>
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
