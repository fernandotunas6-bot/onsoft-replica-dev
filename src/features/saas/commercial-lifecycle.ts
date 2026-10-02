/**
 * Ciclo comercial no servidor: progresso do registo público, lembretes a quem
 * não o concluiu e avisos de fim do período experimental.
 *
 * Só com a chave de serviço: `saas_signup_leads` é fechada a anon/authenticated
 * (FORCE RLS, sem políticas), e `tenants`/`saas_audit_logs` só têm política para
 * a equipa da plataforma. Quem chama decide a autorização: as rotas públicas só
 * gravam o progresso da própria sessão do assistente, e a tarefa diária exige o
 * segredo `SIGA_CRON_SECRET` (/api/cron/saas-lifecycle).
 */
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { getAppName, getAppUrl } from "@/lib/app-config";
import { ECOSYSTEM_URLS } from "@/lib/ecosystem-urls";
import { reportSigaError, reportSigaEvent } from "@/lib/ops-report";
import { resolveSystemSender, sendResendEmail } from "@/features/integrations/resend-client";
import { leadUnsubscribeSignature } from "./signup-verification";
import {
  SIGNUP_STEP_LABELS,
  leadReminderDue,
  trialReminderDue,
  type LeadForReminder,
} from "./lifecycle-rules";
import { renderSignupReminderEmail, renderTrialEndingEmail } from "./lifecycle-emails";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
// Tabela nova (20260930180000): lida sem o tipo gerado, como as outras fora de types.ts.
type LooseDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function leadsDb(): Promise<LooseDb> {
  return (await loadSgaAdminClient()) as unknown as LooseDb;
}

export type SignupProgressInput = {
  sessionId: string;
  step: number;
  planCode?: string | null;
  schoolName?: string | null;
};

/**
 * Passo atingido no assistente, sem dados pessoais. Só avança (voltar atrás no
 * formulário não apaga o progresso) e conta como actividade para os lembretes.
 */
export async function recordSignupProgress(input: SignupProgressInput): Promise<void> {
  const db = await leadsDb();
  const { data: existing } = await db
    .from("saas_signup_leads")
    .select("id, last_step, completed_at")
    .eq("session_id", input.sessionId)
    .maybeSingle();
  const fields = {
    ...(input.planCode ? { plan_code: input.planCode } : {}),
    ...(input.schoolName ? { school_name: input.schoolName.slice(0, 160) } : {}),
  };
  if (!existing) {
    await db.from("saas_signup_leads").insert({
      session_id: input.sessionId,
      last_step: input.step,
      ...fields,
    });
    return;
  }
  if (existing.completed_at) return;
  await db
    .from("saas_signup_leads")
    .update({ last_step: Math.max(Number(existing.last_step) || 1, input.step), ...fields })
    .eq("id", existing.id);
}

/** E-mail confirmado por código: a partir daqui o registo pode ser lembrado. */
export async function markLeadEmailVerified(input: {
  sessionId?: string | null;
  email: string;
  contactName?: string | null;
  contactPhone?: string | null;
  schoolName?: string | null;
  planCode?: string | null;
}): Promise<void> {
  const db = await leadsDb();
  const values = {
    email: input.email.trim().toLowerCase(),
    email_verified_at: new Date().toISOString(),
    ...(input.contactName ? { contact_name: input.contactName.slice(0, 160) } : {}),
    ...(input.contactPhone ? { contact_phone: input.contactPhone.slice(0, 40) } : {}),
    ...(input.schoolName ? { school_name: input.schoolName.slice(0, 160) } : {}),
    ...(input.planCode ? { plan_code: input.planCode } : {}),
  };
  if (input.sessionId) {
    const { data: existing } = await db
      .from("saas_signup_leads")
      .select("id, last_step")
      .eq("session_id", input.sessionId)
      .maybeSingle();
    if (existing) {
      await db
        .from("saas_signup_leads")
        .update({ ...values, last_step: Math.max(Number(existing.last_step) || 1, 5) })
        .eq("id", existing.id);
      return;
    }
  }
  await db.from("saas_signup_leads").insert({
    session_id: input.sessionId ?? crypto.randomUUID(),
    last_step: 5,
    ...values,
  });
}

/** A escola nasceu: fecha o registo desta sessão e os outros do mesmo e-mail. */
export async function markLeadCompleted(input: {
  sessionId?: string | null;
  email: string;
  tenantId: string;
}): Promise<void> {
  try {
    const db = await leadsDb();
    const done = {
      completed_at: new Date().toISOString(),
      tenant_id: input.tenantId,
      last_step: 7,
    };
    if (input.sessionId) {
      await db.from("saas_signup_leads").update(done).eq("session_id", input.sessionId);
    }
    await db
      .from("saas_signup_leads")
      .update({ completed_at: done.completed_at, tenant_id: input.tenantId })
      .eq("email", input.email.trim().toLowerCase())
      .is("completed_at", null);
  } catch (error) {
    // Nunca falha o registo por causa do acompanhamento.
    reportSigaError("saas.signup_lead.complete_failed", error, { tenant_id: input.tenantId });
  }
}

export async function unsubscribeLead(leadId: string): Promise<boolean> {
  const db = await leadsDb();
  const { data } = await db
    .from("saas_signup_leads")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("id", leadId)
    .select("id");
  return Array.isArray(data) && data.length > 0;
}

export type SignupLeadRow = {
  id: string;
  lastStep: number;
  lastStepLabel: string;
  planCode: string | null;
  schoolName: string | null;
  email: string | null;
  contactName: string | null;
  contactPhone: string | null;
  emailVerifiedAt: string | null;
  completedAt: string | null;
  tenantId: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Para o ADMIN: registos recentes e o funil (até que passo chegam). */
export async function listSignupLeads(days = 30): Promise<{
  leads: SignupLeadRow[];
  funnel: Array<{ step: number; label: string; reached: number }>;
  completed: number;
  started: number;
}> {
  const db = await leadsDb();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db
    .from("saas_signup_leads")
    .select(
      "id, last_step, plan_code, school_name, email, contact_name, contact_phone, email_verified_at, completed_at, tenant_id, reminder_count, last_reminder_at, unsubscribed_at, created_at, updated_at",
    )
    .gte("created_at", since)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error("Não foi possível ler os registos.");
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const leads: SignupLeadRow[] = rows.map((r) => ({
    id: String(r["id"]),
    lastStep: Number(r["last_step"]),
    lastStepLabel: SIGNUP_STEP_LABELS[Number(r["last_step"])] ?? `Passo ${String(r["last_step"])}`,
    planCode: (r["plan_code"] as string | null) ?? null,
    schoolName: (r["school_name"] as string | null) ?? null,
    email: (r["email"] as string | null) ?? null,
    contactName: (r["contact_name"] as string | null) ?? null,
    contactPhone: (r["contact_phone"] as string | null) ?? null,
    emailVerifiedAt: (r["email_verified_at"] as string | null) ?? null,
    completedAt: (r["completed_at"] as string | null) ?? null,
    tenantId: (r["tenant_id"] as string | null) ?? null,
    reminderCount: Number(r["reminder_count"] ?? 0),
    lastReminderAt: (r["last_reminder_at"] as string | null) ?? null,
    unsubscribedAt: (r["unsubscribed_at"] as string | null) ?? null,
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  }));
  const funnel = Object.entries(SIGNUP_STEP_LABELS).map(([step, label]) => ({
    step: Number(step),
    label,
    reached: leads.filter((l) => l.lastStep >= Number(step) || l.completedAt).length,
  }));
  return {
    leads,
    funnel,
    started: leads.length,
    completed: leads.filter((l) => l.completedAt).length,
  };
}

// ─── Tarefa diária ──────────────────────────────────────────────────────────

async function sendEmail(to: string, message: { subject: string; html: string; text: string }) {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada.");
  await sendResendEmail({
    apiKey,
    from: resolveSystemSender("support", { displayName: getAppName() }),
    to: [to],
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

/** E-mails do administrador da escola: o dono da conta e o contacto do registo. */
async function schoolAdminEmails(db: Db, schoolId: string, contactEmail: string | null) {
  const emails = new Set<string>();
  if (contactEmail) emails.add(contactEmail.trim().toLowerCase());
  // Sem embeds: member_roles tem duas FKs para school_memberships e o
  // PostgREST recusa escolher. Três leituras simples.
  const { data: roles } = await db
    .from("roles")
    .select("id")
    .eq("school_id", schoolId)
    .in("code", ["owner", "admin"]);
  const roleIds = (roles ?? []).map((r) => r.id);
  if (!roleIds.length) return [...emails];
  const { data: links } = await db
    .from("member_roles")
    .select("membership_id")
    .eq("school_id", schoolId)
    .in("role_id", roleIds);
  const membershipIds = [...new Set((links ?? []).map((l) => l.membership_id))];
  if (!membershipIds.length) return [...emails];
  const { data: memberships } = await db
    .from("school_memberships")
    .select("user_id")
    .in("id", membershipIds)
    .eq("status", "active")
    .limit(20);
  for (const m of memberships ?? []) {
    const { data } = await db.auth.admin.getUserById(m.user_id);
    const email = data?.user?.email?.trim().toLowerCase();
    if (email) emails.add(email);
  }
  return [...emails];
}

async function runTrialReminders(db: Db, now: Date) {
  let sent = 0;
  const horizon = new Date(now.getTime() + 8 * 86_400_000).toISOString();
  const { data: tenants } = await db
    .from("tenants")
    .select("id, name, trial_ends_at, contact_email, status, plan_id, plans(name)")
    .eq("subscription_status", "trialing")
    .gte("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", horizon)
    .in("status", ["active", "trial"])
    .limit(500);
  for (const tenant of (tenants ?? []) as Array<Record<string, unknown>>) {
    const tenantId = String(tenant["id"]);
    const trialEndsAt = String(tenant["trial_ends_at"]);
    try {
      const { data: logs } = await db
        .from("saas_audit_logs")
        .select("metadata")
        .eq("tenant_id", tenantId)
        .eq("action", "trial_reminder_sent")
        .limit(20);
      const alreadySent = ((logs ?? []) as Array<{ metadata: unknown }>)
        .map((l) => (l.metadata ?? {}) as { days?: unknown; trial_ends_at?: unknown })
        .filter((m) => m.trial_ends_at === trialEndsAt && typeof m.days === "number")
        .map((m) => Number(m.days));
      const due = trialReminderDue(trialEndsAt, now, alreadySent);
      if (!due) continue;

      const { data: school } = await db
        .from("schools")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!school?.id) continue;
      const recipients = await schoolAdminEmails(
        db,
        String(school.id),
        (tenant["contact_email"] as string | null) ?? null,
      );
      if (!recipients.length) continue;
      const plan = (tenant["plans"] as { name?: string | null } | null) ?? null;
      const daysLeft = Math.max(
        1,
        Math.ceil((Date.parse(trialEndsAt) - now.getTime()) / 86_400_000),
      );
      const message = renderTrialEndingEmail({
        schoolName: String(school.name ?? tenant["name"] ?? "a escola"),
        daysLeft,
        trialEndsOn: new Date(trialEndsAt).toLocaleDateString("pt-PT", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        planName: plan?.name ?? null,
        subscriptionUrl: `${getAppUrl()}/configuracoes/assinatura`,
        platformName: getAppName(),
      });
      for (const to of recipients) await sendEmail(to, message);
      await db.from("saas_audit_logs").insert({
        tenant_id: tenantId,
        user_id: null,
        action: "trial_reminder_sent",
        entity: "subscription",
        entity_id: tenantId,
        metadata: { days: due, trial_ends_at: trialEndsAt, recipients: recipients.length },
      });
      sent += 1;
    } catch (error) {
      reportSigaError("saas.trial_reminder.failed", error, { tenant_id: tenantId });
    }
  }
  return sent;
}

async function runLeadReminders(now: Date) {
  const db = await leadsDb();
  let sent = 0;
  const { data } = await db
    .from("saas_signup_leads")
    .select(
      "id, email, contact_name, school_name, last_step, email_verified_at, completed_at, unsubscribed_at, reminder_count, updated_at, last_reminder_at",
    )
    .is("completed_at", null)
    .is("unsubscribed_at", null)
    .not("email_verified_at", "is", null)
    .lt("reminder_count", 3)
    .order("updated_at", { ascending: true })
    .limit(200);
  for (const lead of (data ?? []) as Array<LeadForReminder & Record<string, unknown>>) {
    if (!leadReminderDue(lead, now)) continue;
    const leadId = String(lead["id"]);
    try {
      const unsubscribeUrl = `${getAppUrl()}/api/saas/signup/unsubscribe?lead=${leadId}&sig=${leadUnsubscribeSignature(leadId)}`;
      const message = renderSignupReminderEmail({
        contactName: (lead["contact_name"] as string | null) ?? null,
        schoolName: (lead["school_name"] as string | null) ?? null,
        lastStepLabel: SIGNUP_STEP_LABELS[Number(lead["last_step"])] ?? "Conta",
        resumeUrl: `${ECOSYSTEM_URLS.web}/start?retomar=1`,
        unsubscribeUrl,
        reminderNumber: lead.reminder_count + 1,
        platformName: getAppName(),
      });
      await sendEmail(String(lead.email), message);
      await db
        .from("saas_signup_leads")
        .update({ reminder_count: lead.reminder_count + 1, last_reminder_at: now.toISOString() })
        .eq("id", leadId);
      sent += 1;
    } catch (error) {
      reportSigaError("saas.signup_reminder.failed", error, { entity_id: leadId });
    }
  }
  return sent;
}

export async function runCommercialLifecycle(now = new Date()) {
  const db = await loadSgaAdminClient();
  const trialReminders = await runTrialReminders(db, now);
  const signupReminders = await runLeadReminders(now);
  reportSigaEvent("saas.lifecycle.completed", { count: trialReminders + signupReminders });
  return { trialReminders, signupReminders };
}
