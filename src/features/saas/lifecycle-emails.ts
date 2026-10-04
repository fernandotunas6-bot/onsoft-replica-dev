/**
 * E-mails do ciclo comercial: fim do período experimental e registo por concluir.
 * Texto curto, uma acção, e o que acontece se a pessoa não fizer nada.
 */
import { escapeHtml } from "@/features/auth/email-templates/reset-password.html";

type Email = { subject: string; html: string; text: string };

function layout(input: {
  title: string;
  paragraphs: string[];
  cta: { label: string; url: string };
  footer: string;
  platformName: string;
}): string {
  const body = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px; font-size:15px; line-height:1.55; color:#334155;">${escapeHtml(p)}</p>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0; padding:24px 12px; background:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; overflow:hidden;">
      <tr><td style="height:8px; line-height:8px; font-size:0; background-color:#6d5dfc; background-image:linear-gradient(90deg, #4f7cff, #8b5cf6, #c4b5fd);">&nbsp;</td></tr>
      <tr><td style="padding:28px 28px 8px;">
        <p style="margin:0 0 6px; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:#64748b;">${escapeHtml(input.platformName)}</p>
        <h1 style="margin:0 0 18px; font-size:20px; line-height:1.3; color:#0f172a;">${escapeHtml(input.title)}</h1>
        ${body}
        <p style="margin:22px 0 26px;"><a href="${escapeHtml(input.cta.url)}" style="display:inline-block; padding:12px 20px; background:#2563eb; color:#ffffff; text-decoration:none; border-radius:8px; font-size:15px; font-weight:600;">${escapeHtml(input.cta.label)}</a></p>
      </td></tr>
      <tr><td style="padding:14px 28px 22px; border-top:1px solid #f1f5f9; font-size:12px; line-height:1.5; color:#94a3b8;">${input.footer}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function renderTrialEndingEmail(input: {
  schoolName: string;
  daysLeft: number;
  trialEndsOn: string;
  planName: string | null;
  subscriptionUrl: string;
  platformName: string;
}): Email {
  const when = input.daysLeft <= 1 ? "amanhã" : `daqui a ${input.daysLeft} dias`;
  const subject = `O período experimental de ${input.schoolName} termina ${when}`;
  const paragraphs = [
    `O período experimental do SIGA Plus para ${input.schoolName} termina ${when} (${input.trialEndsOn}).`,
    input.planName
      ? `Para continuar sem interrupção no plano ${input.planName}, pague a assinatura em Configurações → Assinatura e plano: transferência com referência própria e envio do comprovativo no mesmo ecrã.`
      : "Para continuar sem interrupção, escolha e pague o plano em Configurações → Assinatura e plano.",
    "Os dados da escola não se perdem no fim do período experimental.",
  ];
  const text = [...paragraphs, `Pagar a assinatura: ${input.subscriptionUrl}`].join("\n\n");
  return {
    subject,
    text,
    html: layout({
      title: subject,
      paragraphs,
      cta: { label: "Pagar a assinatura", url: input.subscriptionUrl },
      footer: `Recebe este aviso por ser o administrador de ${escapeHtml(input.schoolName)} no ${escapeHtml(input.platformName)}.`,
      platformName: input.platformName,
    }),
  };
}

export function renderSignupReminderEmail(input: {
  contactName: string | null;
  schoolName: string | null;
  lastStepLabel: string;
  resumeUrl: string;
  unsubscribeUrl: string;
  reminderNumber: number;
  platformName: string;
}): Email {
  const who = input.contactName?.trim().split(/\s+/)[0] || "Olá";
  const school = input.schoolName?.trim() || "a sua escola";
  const subject =
    input.reminderNumber >= 3
      ? `Último lembrete: ${school} ainda não foi criada`
      : `Falta pouco para criar ${school} no ${input.platformName}`;
  const paragraphs = [
    `${who === "Olá" ? "Olá" : `Olá, ${who}`}. Começou a registar ${school} e parou no passo «${input.lastStepLabel}».`,
    "O resto demora poucos minutos, e a escola fica pronta a usar com período experimental gratuito.",
    "Se encontrou alguma dificuldade, responda a este e-mail e ajudamos a concluir.",
  ];
  const text = [
    ...paragraphs,
    `Retomar o registo: ${input.resumeUrl}`,
    `Deixar de receber estes lembretes: ${input.unsubscribeUrl}`,
  ].join("\n\n");
  return {
    subject,
    text,
    html: layout({
      title: subject,
      paragraphs,
      cta: { label: "Retomar o registo", url: input.resumeUrl },
      footer: `Recebe este e-mail porque confirmou este endereço ao registar uma escola. <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#64748b;">Deixar de receber lembretes</a>.`,
      platformName: input.platformName,
    }),
  };
}
