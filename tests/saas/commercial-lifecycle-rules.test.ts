import { describe, expect, it } from "vitest";
import {
  leadReminderDue,
  trialReminderDue,
  type LeadForReminder,
} from "@/features/saas/lifecycle-rules";
import {
  isReservedTestEmail,
  issueSignupVerificationToken,
  leadUnsubscribeSignature,
  verifyLeadUnsubscribeSignature,
  verifySignupVerificationToken,
} from "@/features/saas/signup-verification";
import {
  renderSignupReminderEmail,
  renderTrialEndingEmail,
} from "@/features/saas/lifecycle-emails";

process.env["SUPABASE_SECRET_KEY"] = "chave-de-servico-de-teste-com-comprimento";

const now = new Date("2026-10-01T08:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe("aviso de fim do período experimental", () => {
  it("avisa a 7, 3 e 1 dia(s), uma vez cada", () => {
    expect(trialReminderDue(inDays(10), now, [])).toBeNull();
    expect(trialReminderDue(inDays(7), now, [])).toBe(7);
    expect(trialReminderDue(inDays(6), now, [7])).toBeNull();
    expect(trialReminderDue(inDays(3), now, [7])).toBe(3);
    expect(trialReminderDue(inDays(1), now, [7, 3])).toBe(1);
    expect(trialReminderDue(inDays(1), now, [7, 3, 1])).toBeNull();
  });

  it("se a tarefa falhou dias, o aviso em falta ainda sai (e não se perde)", () => {
    // Faltou o dos 7 dias; já faltam 5 → sai agora o dos 7.
    expect(trialReminderDue(inDays(5), now, [])).toBe(7);
    // Já faltam 2 sem nenhum aviso → sai o dos 3 (o mais apertado atingido).
    expect(trialReminderDue(inDays(2), now, [])).toBe(3);
  });

  it("sem período experimental, ou já acabado, não avisa", () => {
    expect(trialReminderDue(null, now, [])).toBeNull();
    expect(trialReminderDue(inDays(-1), now, [])).toBeNull();
  });
});

describe("lembretes de registo por concluir", () => {
  const base: LeadForReminder = {
    email: "director@escola.ao",
    email_verified_at: inDays(-2),
    completed_at: null,
    unsubscribed_at: null,
    reminder_count: 0,
    updated_at: inDays(-2),
    last_reminder_at: null,
  };

  it("1.º lembrete um dia depois da última actividade", () => {
    expect(leadReminderDue({ ...base, updated_at: inDays(-0.5) }, now)).toBe(false);
    expect(leadReminderDue({ ...base, updated_at: inDays(-1) }, now)).toBe(true);
  });

  it("2.º aos 3 dias e 3.º aos 7; depois pára", () => {
    const after1 = {
      ...base,
      reminder_count: 1,
      last_reminder_at: inDays(-1),
      updated_at: inDays(-1),
    };
    expect(leadReminderDue(after1, now)).toBe(false);
    expect(
      leadReminderDue({ ...after1, last_reminder_at: inDays(-2), updated_at: inDays(-2) }, now),
    ).toBe(true);
    const after2 = {
      ...base,
      reminder_count: 2,
      last_reminder_at: inDays(-4),
      updated_at: inDays(-4),
    };
    expect(leadReminderDue(after2, now)).toBe(true);
    expect(leadReminderDue({ ...base, reminder_count: 3, updated_at: inDays(-30) }, now)).toBe(
      false,
    );
  });

  it("nunca para quem não confirmou o e-mail, concluiu ou pediu para parar", () => {
    const old = { ...base, updated_at: inDays(-5) };
    expect(leadReminderDue({ ...old, email_verified_at: null }, now)).toBe(false);
    expect(leadReminderDue({ ...old, email: null }, now)).toBe(false);
    expect(leadReminderDue({ ...old, completed_at: inDays(-1) }, now)).toBe(false);
    expect(leadReminderDue({ ...old, unsubscribed_at: inDays(-1) }, now)).toBe(false);
  });
});

describe("comprovativo de e-mail confirmado", () => {
  it("vale para o mesmo e-mail, sem distinguir maiúsculas", () => {
    const token = issueSignupVerificationToken("Director@Escola.AO");
    expect(verifySignupVerificationToken(token, "director@escola.ao")).toBe(true);
    expect(verifySignupVerificationToken(token, "outro@escola.ao")).toBe(false);
  });

  it("não aceita comprovativo alterado, expirado ou vazio", () => {
    const token = issueSignupVerificationToken("a@b.ao", Date.now());
    const [v, payload, sig] = token.split(".");
    const forged = `${v}.${Buffer.from(JSON.stringify({ e: "x@y.ao", x: Date.now() + 1e9 })).toString("base64url")}.${sig}`;
    expect(verifySignupVerificationToken(forged, "x@y.ao")).toBe(false);
    expect(verifySignupVerificationToken(`${v}.${payload}.${sig}x`, "a@b.ao")).toBe(false);
    expect(verifySignupVerificationToken(token, "a@b.ao", Date.now() + 3 * 3_600_000)).toBe(false);
    expect(verifySignupVerificationToken("", "a@b.ao")).toBe(false);
    expect(verifySignupVerificationToken(undefined, "a@b.ao")).toBe(false);
  });

  it("só domínios reservados dispensam o código", () => {
    expect(isReservedTestEmail("e2e+1@siga-plus.test")).toBe(true);
    expect(isReservedTestEmail("x@exemplo.example")).toBe(true);
    expect(isReservedTestEmail("director@escola.ao")).toBe(false);
    expect(isReservedTestEmail("alguem@test.com")).toBe(false);
  });

  it("a ligação de cancelar lembretes não se forja", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(verifyLeadUnsubscribeSignature(id, leadUnsubscribeSignature(id))).toBe(true);
    expect(verifyLeadUnsubscribeSignature(id, "a".repeat(32))).toBe(false);
    expect(
      verifyLeadUnsubscribeSignature(
        "44444444-4444-4444-8444-444444444444",
        leadUnsubscribeSignature(id),
      ),
    ).toBe(false);
  });
});

describe("e-mails do ciclo comercial", () => {
  it("fim do período experimental: quando termina e onde pagar", () => {
    const mail = renderTrialEndingEmail({
      schoolName: "Colégio <Esperança>",
      daysLeft: 3,
      trialEndsOn: "4 de outubro de 2026",
      planName: "Professional",
      subscriptionUrl: "https://portal-siga.com/configuracoes/assinatura",
      platformName: "SIGA Plus",
    });
    expect(mail.subject).toContain("daqui a 3 dias");
    expect(mail.html).toContain("Colégio &lt;Esperança&gt;");
    expect(mail.html).not.toContain("<Esperança>");
    expect(mail.text).toContain("/configuracoes/assinatura");
  });

  it("lembrete de registo: passo onde parou e ligação para deixar de receber", () => {
    const mail = renderSignupReminderEmail({
      contactName: "Ana Maria",
      schoolName: "Colégio Luz",
      lastStepLabel: "Conta",
      resumeUrl: "https://portal-siga.com/start?retomar=1",
      unsubscribeUrl: "https://portal-siga.com/api/saas/signup/unsubscribe?lead=x&sig=y",
      reminderNumber: 3,
      platformName: "SIGA Plus",
    });
    expect(mail.subject).toMatch(/Último lembrete/);
    expect(mail.text).toContain("Olá, Ana");
    expect(mail.text).toContain("«Conta»");
    expect(mail.html).toContain("Deixar de receber lembretes");
  });
});
