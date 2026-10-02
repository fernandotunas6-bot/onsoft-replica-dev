/**
 * Quando avisar — regras puras, sem base nem e-mail, para serem testadas.
 *
 * Fim do período experimental: 7, 3 e 1 dia(s) antes, uma vez cada. Se a tarefa
 * diária falhar um dia, o aviso seguinte ainda sai no seguinte limiar em vez de
 * se perder (ex.: faltou o dos 7 dias e já faltam 5 → sai o dos 7 no dia 5, e o
 * dos 3 continua para depois).
 *
 * Registo por concluir: só para quem confirmou o e-mail (é aí que o temos) e não
 * pediu para deixar de receber. Três lembretes, espaçados pela inactividade:
 * 1 dia, 3 dias e 7 dias depois da última actividade.
 */

const DAY = 86_400_000;

export const TRIAL_REMINDER_DAYS = [7, 3, 1] as const;
export type TrialReminderDay = (typeof TRIAL_REMINDER_DAYS)[number];

/** Dias inteiros que faltam até ao fim (arredondado para cima; 0 = acaba hoje). */
export function daysUntil(endIso: string, now: Date): number {
  return Math.ceil((Date.parse(endIso) - now.getTime()) / DAY);
}

/**
 * Qual aviso enviar agora, ou null. `alreadySent` são os limiares já avisados
 * para este período experimental.
 */
export function trialReminderDue(
  trialEndsAt: string | null,
  now: Date,
  alreadySent: readonly number[],
): TrialReminderDay | null {
  if (!trialEndsAt) return null;
  const left = daysUntil(trialEndsAt, now);
  if (left < 0) return null;
  // O limiar mais apertado que já foi atingido e ainda não foi avisado.
  const due = [...TRIAL_REMINDER_DAYS]
    .filter((threshold) => left <= threshold && !alreadySent.includes(threshold))
    .sort((a, b) => a - b)[0];
  return due ?? null;
}

export const LEAD_REMINDER_AFTER_DAYS = [1, 3, 7] as const;

export type LeadForReminder = {
  email: string | null;
  email_verified_at: string | null;
  completed_at: string | null;
  unsubscribed_at: string | null;
  reminder_count: number;
  updated_at: string;
  last_reminder_at: string | null;
};

/** true quando está na hora do próximo lembrete para retomar o registo. */
export function leadReminderDue(lead: LeadForReminder, now: Date): boolean {
  if (!lead.email || !lead.email_verified_at) return false;
  if (lead.completed_at || lead.unsubscribed_at) return false;
  const next = LEAD_REMINDER_AFTER_DAYS[lead.reminder_count];
  if (next === undefined) return false;
  // Conta a partir da última actividade ou do último lembrete, o que for mais recente.
  const lastTouch = Math.max(
    Date.parse(lead.updated_at),
    lead.last_reminder_at ? Date.parse(lead.last_reminder_at) : 0,
  );
  const previous =
    lead.reminder_count === 0 ? 0 : LEAD_REMINDER_AFTER_DAYS[lead.reminder_count - 1]!;
  const wait = lead.reminder_count === 0 ? next : next - previous;
  return now.getTime() - lastTouch >= wait * DAY;
}

/** Passos do assistente WEB /start, para o funil no ADMIN. */
export const SIGNUP_STEP_LABELS: Record<number, string> = {
  1: "Instituição",
  2: "Localização",
  3: "Responsável",
  4: "Plano",
  5: "Conta",
  6: "Endereço",
  7: "Revisão",
};
