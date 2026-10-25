/**
 * Cobrança SaaS por escola — regras puras (sem base nem rede), para o ADMIN, o
 * servidor e os testes falarem da mesma coisa.
 *
 * Inspirado no que as plataformas de subscrição fazem por cliente (Stripe
 * Billing, Chargebee, Moodle Workplace/Google Workspace for Education):
 * - preço por lugar (aqui: aluno activo) com mínimo facturável, preço de tabela
 *   ou valor negociado;
 * - periodicidade com desconto por período mais longo;
 * - dia de vencimento fixo, prazo de pagamento e tolerância antes de suspender;
 * - pausa das cobranças com motivo e data de fim (Stripe «pause collection»);
 * - isenção para instituições do Estado depois de verificar a elegibilidade
 *   (o «Education verification» do Google Workspace for Education).
 *
 * Tabela: `tenant_billing_profiles` (20261015120000). O efeito no acesso vai
 * por `tenants.billing_exempt`, que o servidor mantém igual a `!charging`.
 */
import { z } from "zod";
import { schoolTodayIso } from "@/lib/school-date";

// ─── Catálogos ──────────────────────────────────────────────────────────────

export const INSTITUTION_TYPES = [
  { id: "private", label: "Privada" },
  { id: "public", label: "Pública (do Estado)" },
  { id: "public_private", label: "Público-privada (comparticipada)" },
  { id: "community", label: "Comunitária / religiosa" },
] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number]["id"];

export const PRICING_MODELS = [
  { id: "plan", label: "Tabela do plano", hint: "O preço mensal ou anual do plano contratado." },
  {
    id: "per_student",
    label: "Por aluno activo",
    hint: "Valor por aluno com matrícula activa, com um mínimo facturável.",
  },
  { id: "fixed", label: "Valor fixo negociado", hint: "Um valor mensal acordado com a escola." },
] as const;
export type PricingModel = (typeof PRICING_MODELS)[number]["id"];

export const BILLING_PERIODS = [
  { id: "monthly", label: "Mensal", months: 1, defaultDiscountPct: 0 },
  { id: "quarterly", label: "Trimestral", months: 3, defaultDiscountPct: 5 },
  { id: "semiannual", label: "Semestral", months: 6, defaultDiscountPct: 10 },
  { id: "yearly", label: "Anual", months: 12, defaultDiscountPct: 16.67 },
] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number]["id"];

export const PAYMENT_METHODS = [
  { id: "bank_transfer", label: "Transferência bancária (IBAN)" },
  { id: "multicaixa_express", label: "Multicaixa Express" },
  { id: "multicaixa_reference", label: "Pagamento por referência (Multicaixa)" },
  { id: "payflow", label: "PayFlow (link de pagamento)" },
  { id: "cash", label: "Numerário (balcão)" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["id"];

export const PUBLIC_REVIEW_STATUSES = [
  { id: "not_applicable", label: "Não aplicável" },
  { id: "pending", label: "Em revisão" },
  { id: "approved", label: "Aprovada — isenta do plano" },
  { id: "rejected", label: "Recusada" },
] as const;
export type PublicReviewStatus = (typeof PUBLIC_REVIEW_STATUSES)[number]["id"];

/**
 * O que confirmar antes de isentar uma escola pública. Não basta a escola
 * dizer que é do Estado: a isenção vale dinheiro e abre a porta a abusos.
 * `required` bloqueia a aprovação; os outros são recomendados.
 */
export const PUBLIC_SCHOOL_REQUIREMENTS = [
  {
    id: "creation_act",
    label: "Acto oficial de criação ou enquadramento",
    hint: "Decreto/despacho de criação, ou declaração da Direcção Municipal ou do Gabinete Provincial da Educação.",
    required: true,
  },
  {
    id: "official_code",
    label: "Código ou número oficial da escola",
    hint: "O identificador da escola junto do Ministério da Educação ou da tutela.",
    required: true,
  },
  {
    id: "supervising_body",
    label: "Órgão de tutela identificado",
    hint: "Direcção Municipal da Educação, Gabinete Provincial da Educação ou outro organismo do Estado.",
    required: true,
  },
  {
    id: "director_appointment",
    label: "Nomeação do director(a) ou credencial do responsável",
    hint: "Quem assina o pedido tem poderes para representar a escola.",
    required: true,
  },
  {
    id: "data_agreement",
    label: "Acordo de tratamento de dados assinado",
    hint: "Dados de menores: termos de tratamento conforme a Lei n.º 22/11 (Protecção de Dados Pessoais).",
    required: true,
  },
  {
    id: "institutional_contact",
    label: "Contacto institucional confirmado",
    hint: "E-mail ou telefone da escola ou da tutela, confirmado por chamada ou resposta.",
    required: false,
  },
  {
    id: "state_funding",
    label: "Financiamento pelo Estado confirmado",
    hint: "A escola é mantida pelo Orçamento Geral do Estado; não é uma privada com acordo.",
    required: false,
  },
  {
    id: "no_tuition",
    label: "Sem propinas cobradas aos alunos (ou só emolumentos legais)",
    hint: "Se cobra propinas como uma privada, não é caso de isenção.",
    required: false,
  },
] as const;
export type PublicRequirementId = (typeof PUBLIC_SCHOOL_REQUIREMENTS)[number]["id"];

// ─── Perfil ─────────────────────────────────────────────────────────────────

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

/** O que o ADMIN grava. Mesmas restrições da tabela, para o erro vir em português. */
export const tenantBillingProfileInputSchema = z
  .object({
    institutionType: z.enum(["private", "public", "public_private", "community"]),
    pricingModel: z.enum(["plan", "per_student", "fixed"]),
    pricePerStudentAoa: z.number().min(0).max(1_000_000).nullish(),
    minBillableStudents: z.number().int().min(0).max(100_000).default(0),
    fixedAmountAoa: z.number().min(0).max(1_000_000_000).nullish(),
    billingPeriod: z.enum(["monthly", "quarterly", "semiannual", "yearly"]),
    discountPct: z.number().min(0).max(100).default(0),
    dueDay: z
      .number()
      .int()
      .min(1, "Dia de vencimento entre 1 e 28")
      .max(28, "Dia de vencimento entre 1 e 28"),
    paymentTermsDays: z.number().int().min(0).max(90),
    graceDays: z.number().int().min(0).max(60),
    autoSuspend: z.boolean(),
    paymentMethods: z
      .array(
        z.enum(["bank_transfer", "multicaixa_express", "multicaixa_reference", "payflow", "cash"]),
      )
      .min(1, "Escolha pelo menos um modo de pagamento."),
    invoiceByEmail: z.boolean(),
    billingContactName: nullableText(160),
    billingEmail: z
      .string()
      .trim()
      .email("E-mail de facturação inválido.")
      .max(200)
      .nullish()
      .or(z.literal("").transform(() => null)),
    billingPhone: nullableText(40),
    billingNif: nullableText(40),
    billingAddress: nullableText(300),
    notes: nullableText(2000),
  })
  .superRefine((data, ctx) => {
    if (data.pricingModel === "per_student" && !(Number(data.pricePerStudentAoa) > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["pricePerStudentAoa"],
        message: "Indique o valor por aluno.",
      });
    }
    if (data.pricingModel === "fixed" && !(Number(data.fixedAmountAoa) > 0)) {
      ctx.addIssue({ code: "custom", path: ["fixedAmountAoa"], message: "Indique o valor fixo." });
    }
  });
export type TenantBillingProfileInput = z.infer<typeof tenantBillingProfileInputSchema>;

export type TenantBillingProfile = TenantBillingProfileInput & {
  tenantId: string;
  billingPaused: boolean;
  billingPausedReason: string | null;
  billingPausedUntil: string | null;
  billingPausedAt: string | null;
  publicReviewStatus: PublicReviewStatus;
  publicRequirements: Partial<Record<PublicRequirementId, boolean>>;
  publicOfficialCode: string | null;
  publicSupervisingBody: string | null;
  publicReviewedAt: string | null;
  publicReviewNotes: string | null;
  updatedAt: string | null;
};

export function defaultBillingProfile(tenantId: string): TenantBillingProfile {
  return {
    tenantId,
    institutionType: "private",
    pricingModel: "plan",
    pricePerStudentAoa: null,
    minBillableStudents: 0,
    fixedAmountAoa: null,
    billingPeriod: "monthly",
    discountPct: 0,
    dueDay: 10,
    paymentTermsDays: 15,
    graceDays: 7,
    autoSuspend: true,
    paymentMethods: ["bank_transfer"],
    invoiceByEmail: true,
    billingContactName: null,
    billingEmail: null,
    billingPhone: null,
    billingNif: null,
    billingAddress: null,
    notes: null,
    billingPaused: false,
    billingPausedReason: null,
    billingPausedUntil: null,
    billingPausedAt: null,
    publicReviewStatus: "not_applicable",
    publicRequirements: {},
    publicOfficialCode: null,
    publicSupervisingBody: null,
    publicReviewedAt: null,
    publicReviewNotes: null,
    updatedAt: null,
  };
}

// ─── Estado da cobrança ─────────────────────────────────────────────────────

export type BillingMode = "charging" | "paused" | "exempt";

export type BillingState = {
  mode: BillingMode;
  /** true quando a escola paga: só então o trial e os atrasos bloqueiam o acesso. */
  charging: boolean;
  label: string;
  reason: string | null;
  until: string | null;
};

/** AAAA-MM-DD de uma data construída em UTC (só aritmética de calendário). */
function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Se a escola está a ser cobrada. A pausa termina no fim do dia `until`
 * (inclusive); sem data, dura até alguém a retomar.
 */
export function billingStateOf(
  profile: Pick<
    TenantBillingProfile,
    | "institutionType"
    | "publicReviewStatus"
    | "billingPaused"
    | "billingPausedReason"
    | "billingPausedUntil"
  >,
  now: Date = new Date(),
): BillingState {
  if (profile.institutionType === "public" && profile.publicReviewStatus === "approved") {
    return {
      mode: "exempt",
      charging: false,
      label: "Isenta — escola pública",
      reason: "Escola pública aprovada: não paga o plano.",
      until: null,
    };
  }
  if (profile.billingPaused) {
    const until = profile.billingPausedUntil;
    // O dia é o da escola (Luanda), não o do servidor em UTC.
    if (!until || until >= schoolTodayIso(now)) {
      return {
        mode: "paused",
        charging: false,
        label: until ? `Cobranças pausadas até ${until}` : "Cobranças pausadas",
        reason: profile.billingPausedReason,
        until,
      };
    }
  }
  return { mode: "charging", charging: true, label: "A cobrar", reason: null, until: null };
}

/** Texto para `tenants.billing_exempt_reason` (o que o SIGA e o ADMIN mostram). */
export function exemptReasonOf(state: BillingState): string | null {
  if (state.charging) return null;
  if (state.mode === "exempt") return "Escola pública (isenta do plano)";
  const until = state.until ? ` até ${state.until}` : "";
  return `Cobranças pausadas${until}: ${state.reason ?? "sem motivo"}`.slice(0, 300);
}

// ─── Valor ──────────────────────────────────────────────────────────────────

export type PlanPrices = { price_aoa_monthly?: number | null; price_aoa_yearly?: number | null };

export type ChargeBreakdown = {
  chargeable: boolean;
  months: number;
  billedStudents: number | null;
  /** Valor de um mês antes de descontos. */
  monthlyBase: number;
  gross: number;
  periodDiscountPct: number;
  periodDiscount: number;
  customDiscountPct: number;
  customDiscount: number;
  total: number;
  lines: string[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const kz = (value: number) =>
  `${value.toLocaleString("pt-AO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kz`;

/**
 * Quanto a escola paga num período.
 *
 * Plano anual com preço anual de tabela usa esse preço (já traz o desconto). Nos
 * outros casos: valor mensal × meses, menos o desconto da periodicidade, menos o
 * desconto negociado da escola. Pausada ou isenta: zero.
 */
export function computeTenantCharge(input: {
  profile: Pick<
    TenantBillingProfile,
    | "pricingModel"
    | "pricePerStudentAoa"
    | "minBillableStudents"
    | "fixedAmountAoa"
    | "billingPeriod"
    | "discountPct"
  >;
  plan: PlanPrices | null;
  activeStudents: number;
  state?: BillingState;
  /** Descontos por periodicidade da plataforma (`saas_billing_settings.periods`). */
  periodDiscounts?: Partial<Record<BillingPeriod, number>>;
}): ChargeBreakdown {
  const { profile, plan } = input;
  const period = BILLING_PERIODS.find((p) => p.id === profile.billingPeriod) ?? BILLING_PERIODS[0];
  const months = period.months;
  const customDiscountPct = Math.min(100, Math.max(0, Number(profile.discountPct) || 0));
  const lines: string[] = [];

  if (input.state && !input.state.charging) {
    return {
      chargeable: false,
      months,
      billedStudents: null,
      monthlyBase: 0,
      gross: 0,
      periodDiscountPct: 0,
      periodDiscount: 0,
      customDiscountPct,
      customDiscount: 0,
      total: 0,
      lines: [input.state.label],
    };
  }

  let monthlyBase = 0;
  let billedStudents: number | null = null;
  let gross: number;
  let yearlyTablePrice = false;
  let periodDiscountPct =
    input.periodDiscounts?.[period.id] ?? (period.defaultDiscountPct as number);

  if (profile.pricingModel === "per_student") {
    const price = Number(profile.pricePerStudentAoa) || 0;
    billedStudents = Math.max(
      Math.max(0, Math.floor(input.activeStudents)),
      profile.minBillableStudents || 0,
    );
    monthlyBase = round2(price * billedStudents);
    lines.push(
      `${billedStudents} aluno(s) × ${kz(price)}` +
        (billedStudents > input.activeStudents
          ? ` (mínimo facturável ${profile.minBillableStudents})`
          : ""),
    );
    gross = monthlyBase * months;
  } else if (profile.pricingModel === "fixed") {
    monthlyBase = Number(profile.fixedAmountAoa) || 0;
    lines.push(`Valor fixo de ${kz(monthlyBase)} por mês`);
    gross = monthlyBase * months;
  } else {
    monthlyBase = Number(plan?.price_aoa_monthly) || 0;
    const yearly = Number(plan?.price_aoa_yearly) || 0;
    if (period.id === "yearly" && yearly > 0) {
      gross = yearly;
      periodDiscountPct = 0;
      yearlyTablePrice = true;
      lines.push(`Preço anual do plano: ${kz(yearly)}`);
    } else {
      gross = monthlyBase * months;
      lines.push(`Plano: ${kz(monthlyBase)} por mês`);
    }
  }

  if (months > 1 && !yearlyTablePrice)
    lines.push(`${months} meses (${period.label.toLowerCase()})`);
  gross = round2(gross);
  const periodDiscount = round2((gross * periodDiscountPct) / 100);
  if (periodDiscount > 0)
    lines.push(`Desconto ${period.label.toLowerCase()}: ${periodDiscountPct}%`);
  const afterPeriod = gross - periodDiscount;
  const customDiscount = round2((afterPeriod * customDiscountPct) / 100);
  if (customDiscount > 0) lines.push(`Desconto da escola: ${customDiscountPct}%`);
  const total = round2(Math.max(0, afterPeriod - customDiscount));

  return {
    chargeable: total > 0,
    months,
    billedStudents,
    monthlyBase,
    gross,
    periodDiscountPct,
    periodDiscount,
    customDiscountPct,
    customDiscount,
    total,
    lines,
  };
}

// ─── Prazos ─────────────────────────────────────────────────────────────────

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Próximo vencimento no dia `dueDay` (hoje conta, se for o dia). */
export function nextDueDate(now: Date, dueDay: number): string {
  const day = Math.min(28, Math.max(1, Math.floor(dueDay)));
  const [y, m, d] = schoolTodayIso(now).split("-").map(Number) as [number, number, number];
  const today = utcDate(y, m - 1, d);
  let due = utcDate(today.getUTCFullYear(), today.getUTCMonth(), day);
  if (due < today) due = utcDate(today.getUTCFullYear(), today.getUTCMonth() + 1, day);
  return dayKey(due);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dayKey(date);
}

/**
 * Calendário de uma cobrança: emite-se a factura `paymentTermsDays` antes do
 * vencimento; depois do vencimento há `graceDays` de tolerância; a seguir, se
 * `autoSuspend`, a escola fica só de consulta.
 */
export function billingSchedule(
  profile: Pick<TenantBillingProfile, "dueDay" | "paymentTermsDays" | "graceDays" | "autoSuspend">,
  now: Date = new Date(),
): { issueOn: string; dueOn: string; suspendAfter: string | null } {
  const dueOn = nextDueDate(now, profile.dueDay);
  return {
    issueOn: addDays(dueOn, -profile.paymentTermsDays),
    dueOn,
    suspendAfter: profile.autoSuspend ? addDays(dueOn, profile.graceDays) : null,
  };
}

/**
 * A escola passa a só consulta por falta de pagamento?
 *
 * Só quando tudo isto é verdade: a escola é cobrada (não está isenta nem
 * pausada), o ADMIN ligou «passar a só consulta», a assinatura está activa e
 * paga até uma data, e já passaram os dias de tolerância depois dessa data
 * (no dia da escola, Luanda). O fim do período experimental tem regra própria
 * (tenant-access.ts) e não entra aqui.
 */
export function overdueSuspensionDue(
  input: {
    profile: Pick<TenantBillingProfile, "graceDays" | "autoSuspend">;
    state: Pick<BillingState, "charging">;
    tenantStatus: string;
    subscription: { status: string | null; currentPeriodEnd: string | null } | null;
  },
  now: Date = new Date(),
): { due: boolean; suspendAfter: string | null } {
  const { profile, state, tenantStatus, subscription } = input;
  if (!state.charging || !profile.autoSuspend) return { due: false, suspendAfter: null };
  if (tenantStatus !== "active" || subscription?.status !== "active") {
    return { due: false, suspendAfter: null };
  }
  const end = subscription.currentPeriodEnd;
  if (!end || Number.isNaN(Date.parse(end))) return { due: false, suspendAfter: null };
  const paidUntil = schoolTodayIso(new Date(end));
  const suspendAfter = addDays(paidUntil, Math.max(0, Math.floor(profile.graceDays)));
  return { due: schoolTodayIso(now) > suspendAfter, suspendAfter };
}

// ─── Escola pública ─────────────────────────────────────────────────────────

/** O que falta para poder aprovar uma escola pública. */
export function publicReviewReadiness(
  profile: Pick<
    TenantBillingProfile,
    "institutionType" | "publicRequirements" | "publicOfficialCode" | "publicSupervisingBody"
  >,
): { canApprove: boolean; missing: string[]; recommendedMissing: string[] } {
  const missing: string[] = [];
  const recommendedMissing: string[] = [];
  if (profile.institutionType !== "public") {
    missing.push("Marcar a instituição como Pública (do Estado).");
  }
  if (!profile.publicOfficialCode?.trim()) missing.push("Código ou número oficial da escola.");
  if (!profile.publicSupervisingBody?.trim()) missing.push("Órgão de tutela.");
  for (const requirement of PUBLIC_SCHOOL_REQUIREMENTS) {
    if (profile.publicRequirements[requirement.id]) continue;
    if (requirement.required) missing.push(requirement.label);
    else recommendedMissing.push(requirement.label);
  }
  return { canApprove: missing.length === 0, missing: [...new Set(missing)], recommendedMissing };
}

// ─── Para a escola (SIGA → Configurações → Assinatura) ──────────────────────

/** O que a escola vê da sua cobrança. Sem perfil gravado: segue a tabela do plano. */
export function describeTenantBilling(
  profile: TenantBillingProfile | null,
  plan: PlanPrices | null,
  activeStudents: number,
  now: Date = new Date(),
  periodDiscounts?: Partial<Record<BillingPeriod, number>>,
) {
  const effective = profile ?? defaultBillingProfile("");
  const state = billingStateOf(effective, now);
  const custom = state.charging && effective.pricingModel !== "plan";
  const chargeFor = (billingPeriod: BillingPeriod) =>
    computeTenantCharge({
      profile: { ...effective, billingPeriod },
      plan,
      activeStudents,
      state,
      ...(periodDiscounts ? { periodDiscounts } : {}),
    });
  const charge = custom ? chargeFor(effective.billingPeriod) : null;
  return {
    mode: state.mode,
    label: state.label,
    reason: state.reason,
    until: state.until,
    customAmountKz: charge ? charge.total : null,
    /** Mesmas condições, pagas ao mês ou ao ano (o que o SIGA deixa escolher). */
    customByPeriodKz: custom
      ? { monthly: chargeFor("monthly").total, yearly: chargeFor("yearly").total }
      : null,
    customLines: charge ? charge.lines : [],
    period: BILLING_PERIODS.find((p) => p.id === effective.billingPeriod)?.label ?? "Mensal",
    dueDay: effective.dueDay,
    paymentMethods: effective.paymentMethods.map(
      (id) => PAYMENT_METHODS.find((m) => m.id === id)?.label ?? id,
    ),
  };
}

/**
 * Receita mensal recorrente (MRR) de uma escola, para o painel do ADMIN.
 *
 * Só conta o que vai ser facturado: escola activa e sem cobrança pausada nem
 * isenção. Trial, atraso, suspensão e escolas públicas aprovadas dão 0. Com
 * condições próprias (por aluno, valor fixo, descontos) usa o valor do período
 * dividido pelos meses; sem perfil, o preço mensal de tabela do plano.
 */
export function monthlyRevenueOf(
  input: {
    tenantStatus: string;
    /** Assinatura ainda em trial (escola «activa» mas sem pagar). */
    subscriptionStatus?: string | null;
    billingExempt: boolean;
    profile: TenantBillingProfile | null;
    plan: PlanPrices | null;
    activeStudents: number;
  },
  now: Date = new Date(),
): number {
  if (input.tenantStatus !== "active" || input.billingExempt) return 0;
  if (input.subscriptionStatus === "trialing") return 0;
  if (!input.profile) return Math.max(0, Number(input.plan?.price_aoa_monthly) || 0);
  const state = billingStateOf(input.profile, now);
  if (!state.charging) return 0;
  const charge = computeTenantCharge({
    profile: input.profile,
    plan: input.plan,
    activeStudents: input.activeStudents,
    state,
  });
  return round2(charge.total / Math.max(1, charge.months));
}

/**
 * A escola ainda não paga: estado `trial`, ou `active` com a assinatura em
 * `trialing` (as escolas criadas pelo WEB ficam assim). Contar estas como activas
 * punha o preço de tabela delas na receita mensal sem terem pago nada.
 */
export function isInTrial(tenant: { status: string; subscription_status?: string | null }) {
  return (
    tenant.status === "trial" ||
    (tenant.status === "active" && tenant.subscription_status === "trialing")
  );
}

/**
 * Soma meses sem transbordar: 31/01 + 1 mês é 28/02 (ou 29), não 03/03.
 * `Date#setMonth` transbordava e um mês pago virava um mês e três dias.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * Prolongar o trial só serve a quem ainda não paga. Numa escola com a assinatura
 * activa, a extensão punha-a de volta em `trialing` e, no fim desse trial, o
 * SIGA bloqueava uma escola que tinha pago.
 */
export function trialExtensionError(tenant: {
  status: string;
  subscription_status?: string | null;
}): string | null {
  if (tenant.status === "active" && tenant.subscription_status === "active") {
    return "Esta escola já paga: para dar mais tempo, registe o pagamento recebido (Gerir → Pagamento recebido) ou pause as cobranças.";
  }
  return null;
}

/** Trial terminado sem isenção: o SIGA bloqueia as gravações. */
export function isTrialExpired(
  tenant: {
    status: string;
    subscription_status?: string | null;
    trial_ends_at?: string | null;
    billing_exempt?: boolean | null;
  },
  now: Date = new Date(),
): boolean {
  if (tenant.billing_exempt) return false;
  if (tenant.status !== "trial" && tenant.subscription_status !== "trialing") return false;
  const end = tenant.trial_ends_at ? Date.parse(tenant.trial_ends_at) : NaN;
  return Number.isFinite(end) && end < now.getTime();
}

/**
 * Estado a gravar quando o ADMIN muda o estado de uma escola.
 *
 * - «Activar» uma escola em atraso não pode ser acesso grátis por esquecimento: a
 *   assinatura continuava `past_due` e a escola nunca mais voltava a ser suspensa.
 *   Pede-se o registo do pagamento (ou a pausa das cobranças).
 * - «Activar» uma escola suspensa durante o trial devolve-a ao trial, em vez de a
 *   passar a activa (e a contar como receita) sem ter pago.
 */
export function resolveStatusChange(
  current: { status: string; subscription_status?: string | null; billing_exempt?: boolean | null },
  requested: string,
): { status: string } | { error: string } {
  if (requested !== "active") return { status: requested };
  if (current.status === "past_due" && !current.billing_exempt) {
    return {
      error:
        "Escola em atraso: registe o pagamento recebido (Gerir → Pagamento recebido) ou pause as cobranças.",
    };
  }
  if (current.status === "suspended" && current.subscription_status === "trialing") {
    return { status: "trial" };
  }
  return { status: "active" };
}
