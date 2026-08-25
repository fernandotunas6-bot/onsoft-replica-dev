/**
 * Gmail API Service for SIGA
 * Handles official school communication, notices, and automatic student welcome emails.
 */

import { getStoredGoogleOAuthToken } from "./oauth";

export interface StudentWelcomeEmailData {
  recipientEmail: string;
  studentName: string;
  studentNumber: string;
  schoolName: string;
  courseName?: string;
  gradeName?: string;
  turmaName?: string;
  shift?: string;
  academicYear?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  portalUrl?: string;
  temporaryPassword?: string;
}

export interface GmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me/messages";

/**
 * Encodes string to RFC 4648 Base64URL without padding
 */
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Builds the official SIGA student welcome email HTML template.
 */
export function buildStudentWelcomeTemplate(data: StudentWelcomeEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `🎓 Confirmação de Matrícula: ${data.studentName} - ${data.schoolName}`;
  const portalUrl =
    data.portalUrl ||
    (typeof window !== "undefined" ? window.location.origin : "https://portal-siga.com");

  const html = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #1d4ed8; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 28px 24px; }
    .card { background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 20px 0; border: 1px solid #cbd5e1; }
    .card-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .card-row:last-child { border-bottom: none; }
    .card-label { color: #64748b; font-weight: 500; }
    .card-value { color: #0f172a; font-weight: 600; }
    .btn { display: inline-block; background: #1d4ed8; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; margin-top: 16px; text-align: center; }
    .footer { padding: 20px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${data.schoolName}</h1>
      <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Sistema Integrado de Gestão Académica (SIGA)</p>
    </div>
    <div class="content">
      <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Bem-vindo(a), ${data.studentName}!</h2>
      <p>Temos o prazer de confirmar que a sua matrícula foi realizada com sucesso no nosso sistema.</p>
      
      <div class="card">
        <div class="card-row">
          <span class="card-label">Nº de Processo:</span>
          <span class="card-value">${data.studentNumber}</span>
        </div>
        ${data.turmaName ? `<div class="card-row"><span class="card-label">Turma:</span><span class="card-value">${data.turmaName}</span></div>` : ""}
        ${data.courseName ? `<div class="card-row"><span class="card-label">Curso / Programa:</span><span class="card-value">${data.courseName}</span></div>` : ""}
        ${data.gradeName ? `<div class="card-row"><span class="card-label">Classe / Ano:</span><span class="card-value">${data.gradeName}</span></div>` : ""}
        ${data.shift ? `<div class="card-row"><span class="card-label">Turno:</span><span class="card-value">${data.shift}</span></div>` : ""}
        ${data.academicYear ? `<div class="card-row"><span class="card-label">Ano Lectivo:</span><span class="card-value">${data.academicYear}</span></div>` : ""}
      </div>

      <p style="font-size: 14px;">Pode consultar os seus horários, pautas, comunicados e pagamentos no portal do aluno:</p>
      <div style="text-align: center;">
        <a href="${portalUrl}" class="btn">Aceder ao Portal do Estudante</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0;">${data.schoolName} • Contacto: ${data.schoolPhone || data.schoolEmail || "Secretaria Escolar"}</p>
      <p style="margin: 4px 0 0 0;">Esta é uma mensagem automática enviada pelo SIGA através do Gmail.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
Bem-vindo(a), ${data.studentName}!

A sua matrícula foi confirmada com sucesso em ${data.schoolName}.

Dados da Matrícula:
- Nº de Processo: ${data.studentNumber}
${data.turmaName ? `- Turma: ${data.turmaName}\n` : ""}${data.courseName ? `- Curso: ${data.courseName}\n` : ""}${data.academicYear ? `- Ano Lectivo: ${data.academicYear}\n` : ""}
Aceda ao portal do aluno para consultar horários e notas: ${portalUrl}

${data.schoolName}
  `.trim();

  return { subject, html, text };
}

/**
 * Sends a raw email via the Gmail API
 */
export async function sendGmailMessage(
  to: string,
  subject: string,
  bodyHtml: string,
  bodyText?: string,
  customAccessToken?: string,
): Promise<GmailSendResult> {
  const token = customAccessToken || getStoredGoogleOAuthToken()?.access_token;
  if (!token) {
    return {
      success: false,
      error: "Google Workspace / Gmail não está autenticado.",
    };
  }

  // Construct MIME message
  const boundary = `siga_boundary_${Date.now()}`;
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  const rawMessage = [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    bodyText || bodyHtml.replace(/<[^>]*>?/gm, ""),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    bodyHtml,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  const encodedRaw = base64UrlEncode(rawMessage);

  try {
    const response = await fetch(`${GMAIL_API_BASE}/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedRaw }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Erro na Gmail API (${response.status}): ${errorText}`,
      };
    }

    const json = await response.json();
    return {
      success: true,
      messageId: json.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro inesperado ao enviar mensagem pelo Gmail",
    };
  }
}

/**
 * Triggers official welcome email when a student is enrolled.
 */
export async function sendStudentWelcomeEmail(
  data: StudentWelcomeEmailData,
  customAccessToken?: string,
): Promise<GmailSendResult> {
  if (!data.recipientEmail || !data.recipientEmail.includes("@")) {
    return {
      success: false,
      error: "O aluno não possui um endereço de e-mail válido configurado.",
    };
  }

  const { subject, html, text } = buildStudentWelcomeTemplate(data);
  return sendGmailMessage(data.recipientEmail, subject, html, text, customAccessToken);
}
