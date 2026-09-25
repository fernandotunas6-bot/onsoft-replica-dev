/**
 * Google Gmail API Service for SIGA
 * Provides automated welcome emails with student enrollment information and credentials.
 */

import { sendGmailNotification } from "@/integrations/google/server-workspace";

export interface StudentEnrollmentWelcomeData {
  studentId?: string;
  studentName: string;
  studentEmail: string;
  studentNumber: string; // Nº de Processo
  schoolName: string;
  courseName?: string;
  gradeName?: string;
  turmaName?: string;
  shift?: string;
  academicYear?: string;
  temporaryPassword?: string;
  portalUrl?: string;
  schoolPhone?: string;
  schoolEmail?: string;
}

export interface GmailSendResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Builds HTML template for new student welcome email.
 */
export function buildStudentWelcomeTemplate(data: StudentEnrollmentWelcomeData): {
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
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .content { padding: 28px 24px; }
    .card { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 20px 0; border: 1px solid #e2e8f0; }
    .card-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #edf2f7; font-size: 14px; }
    .card-row:last-child { border-bottom: none; }
    .card-label { color: #64748b; font-weight: 500; }
    .card-value { color: #0f172a; font-weight: 600; }
    .creds-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin: 16px 0; }
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
      <p>Confirmamos com sucesso a sua matrícula na nossa instituição de ensino.</p>
      
      <div class="card">
        <div class="card-row">
          <span class="card-label">Nº de Processo:</span>
          <span class="card-value">${data.studentNumber}</span>
        </div>
        ${data.turmaName ? `<div class="card-row"><span class="card-label">Turma:</span><span class="card-value">${data.turmaName}</span></div>` : ""}
        ${data.courseName ? `<div class="card-row"><span class="card-label">Curso:</span><span class="card-value">${data.courseName}</span></div>` : ""}
        ${data.gradeName ? `<div class="card-row"><span class="card-label">Classe / Ano:</span><span class="card-value">${data.gradeName}</span></div>` : ""}
        ${data.shift ? `<div class="card-row"><span class="card-label">Turno:</span><span class="card-value">${data.shift}</span></div>` : ""}
        ${data.academicYear ? `<div class="card-row"><span class="card-label">Ano Lectivo:</span><span class="card-value">${data.academicYear}</span></div>` : ""}
      </div>

      ${
        data.temporaryPassword
          ? `
      <div class="creds-box">
        <h4 style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px;">Dados de Acesso ao Portal:</h4>
        <p style="margin: 0; font-size: 13px;"><strong>Utilizador:</strong> ${data.studentEmail}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px;"><strong>Senha Temporária:</strong> <code style="background:#dbeafe; padding:2px 6px; border-radius:4px;">${data.temporaryPassword}</code></p>
        <p style="margin: 6px 0 0 0; font-size: 11px; color: #64748b;">(Recomendamos alterar a sua senha no primeiro acesso ao sistema.)</p>
      </div>`
          : ""
      }

      <div style="text-align: center;">
        <a href="${portalUrl}" class="btn">Aceder ao Portal SIGA</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0;">${data.schoolName} • ${data.schoolPhone || data.schoolEmail || "Secretaria Escolar"}</p>
      <p style="margin: 4px 0 0 0;">Mensagem automática gerada pelo SIGA através do Gmail.</p>
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
${data.temporaryPassword ? `Acesso ao Portal:\n- Utilizador: ${data.studentEmail}\n- Senha Temporária: ${data.temporaryPassword}\n` : ""}
Aceda ao portal do aluno para consultar horários, notas e pagamentos: ${portalUrl}

${data.schoolName}
  `.trim();

  return { subject, html, text };
}

/**
 * Sends a welcome message through the authenticated SIGA server-side Gmail
 * integration. Any legacy custom token parameter is ignored by design.
 */
export async function sendWelcomeEmailOnStudentEnrolled(
  studentData: StudentEnrollmentWelcomeData,
  _customAccessToken?: string,
): Promise<GmailSendResponse> {
  if (!studentData.studentEmail || !studentData.studentEmail.includes("@")) {
    return {
      success: false,
      error: "O aluno não possui um endereço de e-mail válido para envio da mensagem.",
    };
  }

  const { subject, html } = buildStudentWelcomeTemplate(studentData);
  try {
    const result = await sendGmailNotification({
      data: { to: studentData.studentEmail, subject, bodyHtml: html },
    });
    return { success: result.success, messageId: result.messageId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao enviar e-mail pelo Gmail",
    };
  }
}
