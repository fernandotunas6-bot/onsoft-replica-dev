/**
 * Cobrança SaaS por escola — servidor (chave de serviço).
 *
 * Quem chama decide a autorização: a rota do ADMIN exige `platform_admins` + aal2
 * (`/api/saas/tenants/billing`), o provisionamento corre no próprio registo e a
 * tarefa diária exige o segredo do cron. As regras estão em tenant-billing-rules.ts.
 *
 * `tenant_billing_profiles` (20261015120000) pode ainda não existir na base: lê-se
 * com `*`, e sem a tabela devolve-se o perfil por omissão com `tableReady: false`
 * e as gravações respondem com a migração que falta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BILLING_PERIODS,
  INSTITUTION_TYPES,
  PAYMENT_METHODS,
  PRICING_MODELS,
  PUBLIC_REVIEW_STATUSES,
  PUBLIC_SCHOOL_REQUIREMENTS,
  billingSchedule,
  billingStateOf,
  computeTenantCharge,
  defaultBillingProfile,
  exemptReasonOf,
  publicReviewReadiness,
  type BillingPeriod,
  type BillingState,
  type InstitutionType,
  type PlanPrices,
  type PublicRequirementId,
  type TenantBillingProfile,
  type TenantBillingProfileInput,
} from "@/features/saas/tenant-billing-rules";
import { planPriceKz } from "@/features/saas/subscription-view";
import { schoolTodayIso } from "@/lib/school-date";

// Tabela nova: lida sem o tipo gerado, como as outras fora de types.ts.
type LooseDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const BILLING_MIGRATION = "20261015120000_tenant_billing_profiles.sql";
export const PUBLIC_REVIEW_PAUSE_REASON = "Escola pública em revisão";

function loose(db: SupabaseClient): LooseDb {
  return db as unknown as LooseDb;
}

export function isMissingTableError(error: { code?: string | null; message?: string } | null) {
  const code = error?.code ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation .* does not exist|Could not find the table/i.test(error?.message ?? "")
  );
}

function migrationMissing(): Error {
  return new Error(
    `A cobrança por escola precisa da migração ${BILLING_MIGRATION} (SQL Editor, pacote docs/agents/SIGA_aplicar_cobranca_escolas.sql).`,
  );
}

const num = (value: unknown): number | null =>
  value === null || value === undefined || value === "" ? null : Number(value);

export function profileFromRow(row: Record<string, unknown>): TenantBillingProfile {
  const base = defaultBillingProfile(String(row["tenant_id"]));
  const methods = Array.isArray(row["payment_methods"])
    ? (row["payment_methods"] as TenantBillingProfile["paymentMethods"])
    : base.paymentMethods;
  const requirements =
    row["public_requirements"] && typeof row["public_requirements"] === "object"
      ? (row["public_requirements"] as TenantBillingProfile["publicRequirements"])
      : {};
  return {
    ...base,
    institutionType: (row["institution_type"] as InstitutionType) ?? base.institutionType,
    pricingModel: (row["pricing_model"] as TenantBillingProfile["pricingModel"]) ?? "plan",
    pricePerStudentAoa: num(row["price_per_student_aoa"]),
    minBillableStudents: Number(row["min_billable_students"] ?? 0),
    fixedAmountAoa: num(row["fixed_amount_aoa"]),
    billingPeriod: (row["billing_period"] as BillingPeriod) ?? "monthly",
    discountPct: Number(row["discount_pct"] ?? 0),
    dueDay: Number(row["due_day"] ?? base.dueDay),
    paymentTermsDays: Number(row["payment_terms_days"] ?? base.paymentTermsDays),
    graceDays: Number(row["grace_days"] ?? base.graceDays),
    autoSuspend: row["auto_suspend"] !== false,
    paymentMethods: methods.length ? methods : base.paymentMethods,
    invoiceByEmail: row["invoice_by_email"] !== false,
    billingContactName: (row["billing_contact_name"] as string | null) ?? null,
    billingEmail: (row["billing_email"] as string | null) ?? null,
    billingPhone: (row["billing_phone"] as string | null) ?? null,
    billingNif: (row["billing_nif"] as string | null) ?? null,
    billingAddress: (row["billing_address"] as string | null) ?? null,
    notes: (row["notes"] as string | null) ?? null,
    billingPaused: row["billing_paused"] === true,
    billingPausedReason: (row["billing_paused_reason"] as string | null) ?? null,
    billingPausedUntil: (row["billing_paused_until"] as string | null) ?? null,
    billingPausedAt: (row["billing_paused_at"] as string | null) ?? null,
    publicReviewStatus:
      (row["public_review_status"] as TenantBillingProfile["publicReviewStatus"]) ??
      "not_applicable",
    publicRequirements: requirements,
    publicOfficialCode: (row["public_official_code"] as string | null) ?? null,
    publicSupervisingBody: (row["public_supervising_body"] as string | null) ?? null,
    publicReviewedAt: (row["public_reviewed_at"] as string | null) ?? null,
    publicReviewNotes: (row["public_review_notes"] as string | null) ?? null,
    updatedAt: (row["updated_at"] as string | null) ?? null,
  };
}

function rowFromInput(input: TenantBillingProfileInput) {
  return {
    institution_type: input.institutionType,
    pricing_model: input.pricingModel,
    price_per_student_aoa: input.pricePerStudentAoa ?? null,
    min_billable_students: input.minBillableStudents ?? 0,
    fixed_amount_aoa: input.fixedAmountAoa ?? null,
    billing_period: input.billingPeriod,
    discount_pct: input.discountPct ?? 0,
    due_day: input.dueDay,
    payment_terms_days: input.paymentTermsDays,
    grace_days: input.graceDays,
    auto_suspend: input.autoSuspend,
    payment_methods: input.paymentMethods,
    invoice_by_email: input.invoiceByEmail,
    billing_contact_name: input.billingContactName ?? null,
    billing_email: input.billingEmail ?? null,
    billing_phone: input.billingPhone ?? null,
    billing_nif: input.billingNif ?? null,
    billing_address: input.billingAddress ?? null,
    notes: input.notes ?? null,
  };
}

/** Natureza escolhida no registo (Definições → Escola) → tipo de cobrança. */
export function institutionTypeFromSchoolType(schoolType: unknown): InstitutionType {
  switch (String(schoolType ?? "").toLowerCase()) {
    case "publica":
    case "pública":
    case "public":
      return "public";
    case "comparticipada":
      return "public_private";
    case "confessional":
    case "comunitaria":
      return "community";
    default:
      return "private";
  }
}

export async function loadTenantBillingProfile(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ profile: TenantBillingProfile; stored: boolean; tableReady: boolean }> {
  const { data, error } = await loose(db)
    .from("tenant_billing_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) {
      return { profile: defaultBillingProfile(tenantId), stored: false, tableReady: false };
    }
    throw new Error("Não foi possível ler a cobrança da escola.");
  }
  if (!data) return { profile: defaultBillingProfile(tenantId), stored: false, tableReady: true };
  return {
    profile: profileFromRow(data as Record<string, unknown>),
    stored: true,
    tableReady: true,
  };
}

/**
 * Mantém `tenants.billing_exempt` igual a «não cobrar». É esta coluna que o
 * SIGA lê para não bloquear por trial ou atraso (tenant-access.ts).
 */
export async function syncBillingExemption(
  db: SupabaseClient,
  tenantId: string,
  profile: TenantBillingProfile,
  now: Date = new Date(),
): Promise<BillingState> {
  const state = billingStateOf(profile, now);
  const { error } = await db
    .from("tenants")
    .update({
      billing_exempt: !state.charging,
      billing_exempt_reason: exemptReasonOf(state),
      updated_at: now.toISOString(),
    })
    .eq("id", tenantId);
  if (error) throw new Error("Não foi possível actualizar o estado de cobrança da escola.");
  return state;
}

async function audit(
  db: SupabaseClient,
  tenantId: string,
  userId: string | null,
  action: string,
  metadata: Record<string, unknown>,
) {
  await db.from("saas_audit_logs").insert({
    tenant_id: tenantId,
    user_id: userId,
    action,
    entity: "tenant_billing",
    entity_id: tenantId,
    metadata: metadata as never,
  });
}

async function upsertProfile(
  db: SupabaseClient,
  tenantId: string,
  values: Record<string, unknown>,
  userId: string | null,
): Promise<TenantBillingProfile> {
  const { data, error } = await loose(db)
    .from("tenant_billing_profiles")
    .upsert({ tenant_id: tenantId, ...values, updated_by: userId }, { onConflict: "tenant_id" })
    .select("*")
    .single();
  if (error) {
    if (isMissingTableError(error)) throw migrationMissing();
    throw new Error(`Não foi possível gravar a cobrança: ${error.message ?? "erro da base"}`);
  }
  return profileFromRow(data as Record<string, unknown>);
}

/**
 * Grava o modelo de cobrança. Mudar para «Pública» abre a revisão e pausa as
 * cobranças enquanto se revê; sair de «Pública» fecha a revisão e retira essa
 * pausa automática (uma pausa manual fica).
 */
export async function saveTenantBillingProfile(
  db: SupabaseClient,
  tenantId: string,
  input: TenantBillingProfileInput,
  userId: string,
): Promise<{ profile: TenantBillingProfile; state: BillingState }> {
  const { profile: current, tableReady } = await loadTenantBillingProfile(db, tenantId);
  if (!tableReady) throw migrationMissing();
  const values: Record<string, unknown> = rowFromInput(input);
  const becamePublic = input.institutionType === "public" && current.institutionType !== "public";
  const leftPublic = input.institutionType !== "public" && current.institutionType === "public";
  if (becamePublic && current.publicReviewStatus !== "approved") {
    values["public_review_status"] = "pending";
    if (!current.billingPaused) {
      Object.assign(values, {
        billing_paused: true,
        billing_paused_reason: PUBLIC_REVIEW_PAUSE_REASON,
        billing_paused_until: null,
        billing_paused_at: new Date().toISOString(),
        billing_paused_by: userId,
      });
    }
  }
  if (leftPublic) {
    values["public_review_status"] = "not_applicable";
    if (current.billingPausedReason === PUBLIC_REVIEW_PAUSE_REASON) {
      Object.assign(values, {
        billing_paused: false,
        billing_paused_reason: null,
        billing_paused_until: null,
      });
    }
  }
  const profile = await upsertProfile(db, tenantId, values, userId);
  const state = await syncBillingExemption(db, tenantId, profile);
  await audit(db, tenantId, userId, "TENANT_BILLING_PROFILE_UPDATED", {
    pricing_model: profile.pricingModel,
    billing_period: profile.billingPeriod,
    institution_type: profile.institutionType,
    discount_pct: profile.discountPct,
    payment_methods: profile.paymentMethods,
    billing_mode: state.mode,
  });
  return { profile, state };
}

export async function pauseTenantBilling(
  db: SupabaseClient,
  tenantId: string,
  input: { reason: string; until: string | null },
  userId: string,
): Promise<{ profile: TenantBillingProfile; state: BillingState }> {
  const { tableReady } = await loadTenantBillingProfile(db, tenantId);
  if (!tableReady) throw migrationMissing();
  const today = schoolTodayIso();
  if (input.until && input.until < today) throw new Error("A data de fim da pausa já passou.");
  const profile = await upsertProfile(
    db,
    tenantId,
    {
      billing_paused: true,
      billing_paused_reason: input.reason,
      billing_paused_until: input.until,
      billing_paused_at: new Date().toISOString(),
      billing_paused_by: userId,
    },
    userId,
  );
  const state = await syncBillingExemption(db, tenantId, profile);
  await audit(db, tenantId, userId, "TENANT_BILLING_PAUSED", {
    reason: input.reason,
    until: input.until,
  });
  return { profile, state };
}

export async function resumeTenantBilling(
  db: SupabaseClient,
  tenantId: string,
  userId: string | null,
  why = "manual",
): Promise<{ profile: TenantBillingProfile; state: BillingState }> {
  const { tableReady } = await loadTenantBillingProfile(db, tenantId);
  if (!tableReady) throw migrationMissing();
  const profile = await upsertProfile(
    db,
    tenantId,
    { billing_paused: false, billing_paused_reason: null, billing_paused_until: null },
    userId,
  );
  const state = await syncBillingExemption(db, tenantId, profile);
  await audit(db, tenantId, userId, "TENANT_BILLING_RESUMED", { why });
  return { profile, state };
}

export type PublicReviewInput = {
  requirements: Partial<Record<PublicRequirementId, boolean>>;
  officialCode: string | null;
  supervisingBody: string | null;
  notes: string | null;
  decision: "save" | "approve" | "reject";
};

/**
 * Revisão de escola pública. Aprovar exige os requisitos obrigatórios e deixa a
 * escola isenta (sem pausa: a isenção não acaba). Recusar volta a cobrar, a não
 * ser que haja uma pausa manual.
 */
export async function reviewPublicSchool(
  db: SupabaseClient,
  tenantId: string,
  input: PublicReviewInput,
  userId: string,
): Promise<{ profile: TenantBillingProfile; state: BillingState }> {
  const { profile: current, tableReady } = await loadTenantBillingProfile(db, tenantId);
  if (!tableReady) throw migrationMissing();
  const draft: TenantBillingProfile = {
    ...current,
    publicRequirements: input.requirements,
    publicOfficialCode: input.officialCode,
    publicSupervisingBody: input.supervisingBody,
  };
  const values: Record<string, unknown> = {
    public_requirements: input.requirements,
    public_official_code: input.officialCode,
    public_supervising_body: input.supervisingBody,
    public_review_notes: input.notes,
  };
  if (input.decision === "approve") {
    const readiness = publicReviewReadiness(draft);
    if (!readiness.canApprove) {
      throw new Error(`Falta para aprovar: ${readiness.missing.join("; ")}.`);
    }
    Object.assign(values, {
      public_review_status: "approved",
      public_reviewed_by: userId,
      public_reviewed_at: new Date().toISOString(),
    });
    if (current.billingPausedReason === PUBLIC_REVIEW_PAUSE_REASON) {
      Object.assign(values, { billing_paused: false, billing_paused_reason: null });
    }
  } else if (input.decision === "reject") {
    if (!input.notes?.trim()) throw new Error("Diga porque recusa: a escola vai querer saber.");
    Object.assign(values, {
      public_review_status: "rejected",
      public_reviewed_by: userId,
      public_reviewed_at: new Date().toISOString(),
    });
    if (current.billingPausedReason === PUBLIC_REVIEW_PAUSE_REASON) {
      Object.assign(values, { billing_paused: false, billing_paused_reason: null });
    }
  } else if (
    current.institutionType === "public" &&
    current.publicReviewStatus === "not_applicable"
  ) {
    values["public_review_status"] = "pending";
  }
  const profile = await upsertProfile(db, tenantId, values, userId);
  const state = await syncBillingExemption(db, tenantId, profile);
  await audit(db, tenantId, userId, "TENANT_PUBLIC_REVIEW", {
    decision: input.decision,
    status: profile.publicReviewStatus,
    requirements: input.requirements,
    official_code: input.officialCode,
    supervising_body: input.supervisingBody,
  });
  return { profile, state };
}

/**
 * Escola criada no registo como pública: perfil «Pública», revisão aberta e
 * cobranças pausadas enquanto se revê. Nunca falha o registo.
 */
export async function initBillingProfileForNewSchool(
  db: SupabaseClient,
  tenantId: string,
  schoolType: unknown,
): Promise<void> {
  const institutionType = institutionTypeFromSchoolType(schoolType);
  const isPublic = institutionType === "public";
  const { data, error } = await loose(db)
    .from("tenant_billing_profiles")
    .upsert(
      {
        tenant_id: tenantId,
        institution_type: institutionType,
        public_review_status: isPublic ? "pending" : "not_applicable",
        billing_paused: isPublic,
        billing_paused_reason: isPublic ? PUBLIC_REVIEW_PAUSE_REASON : null,
        billing_paused_at: isPublic ? new Date().toISOString() : null,
      },
      { onConflict: "tenant_id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  if (error || !data) return;
  if (isPublic) await syncBillingExemption(db, tenantId, profileFromRow(data));
}

/** Tarefa diária: pausas com data que já passou voltam a cobrar. */
export async function endExpiredBillingPauses(
  db: SupabaseClient,
  now = new Date(),
): Promise<number> {
  const today = schoolTodayIso(now);
  const { data, error } = await loose(db)
    .from("tenant_billing_profiles")
    .select("tenant_id")
    .eq("billing_paused", true)
    .lt("billing_paused_until", today)
    .limit(500);
  if (error) return 0;
  let ended = 0;
  for (const row of (data ?? []) as Array<{ tenant_id: string }>) {
    try {
      await resumeTenantBilling(db, row.tenant_id, null, "pause_ended");
      ended += 1;
    } catch {
      // Fica para a próxima corrida.
    }
  }
  return ended;
}

// ─── Visão completa para o ADMIN ────────────────────────────────────────────

export type TenantOverview = Awaited<ReturnType<typeof loadTenantOverview>>;

/** Tudo o que a página da escola no ADMIN mostra, numa só leitura. */
export async function loadTenantOverview(db: SupabaseClient, tenantId: string) {
  const { data: tenant, error } = await db
    .from("tenants")
    .select("*, plans(*)")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível ler a escola.");
  if (!tenant) return null;

  const [
    schoolRes,
    usageRes,
    subscriptionRes,
    domainsRes,
    auditRes,
    plansRes,
    settingsRes,
    billing,
  ] = await Promise.all([
    db
      .from("schools")
      .select(
        "id, name, commercial_name, nif, email, phone, address, city, province, municipality, director_name, status, public_code, created_at",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from("tenant_usage")
      .select("active_students_count, active_staff_count, storage_bytes_used, last_calculated_at")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    db
      .from("subscriptions")
      .select(
        "id, status, billing_period, current_period_start, current_period_end, plans(name, code)",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("tenant_domains")
      .select("hostname, type, status, ssl_status, verified_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    db
      .from("saas_audit_logs")
      .select("action, metadata, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(15),
    db
      .from("plans")
      .select("id, code, name, price_aoa_monthly, price_aoa_yearly, max_students, is_active")
      .order("price_aoa_monthly", { ascending: true }),
    loose(db).from("saas_billing_settings").select("periods").eq("id", 1).maybeSingle(),
    loadTenantBillingProfile(db, tenantId),
  ]);

  const school = schoolRes.data ?? null;
  let suggestedInstitutionType: InstitutionType | null = null;
  if (school?.id) {
    const { data: institution } = await db
      .from("school_settings")
      .select("value")
      .eq("school_id", school.id)
      .eq("domain", "institution")
      .maybeSingle();
    const schoolType = (institution?.value as { school_type?: unknown } | null)?.school_type;
    if (schoolType) suggestedInstitutionType = institutionTypeFromSchoolType(schoolType);
  }
  // Sem perfil gravado, o tipo vem do que a escola disse no registo.
  const profile =
    !billing.stored && suggestedInstitutionType
      ? { ...billing.profile, institutionType: suggestedInstitutionType }
      : billing.profile;

  const periodDiscounts: Partial<Record<BillingPeriod, number>> = {};
  const periods = (settingsRes?.data?.periods ?? []) as Array<{
    code?: string;
    enabled?: boolean;
    discount_pct?: number;
  }>;
  for (const p of Array.isArray(periods) ? periods : []) {
    if (p.code && typeof p.discount_pct === "number") {
      periodDiscounts[p.code as BillingPeriod] = p.discount_pct;
    }
  }

  const activeStudents = Number(usageRes.data?.active_students_count ?? 0);
  const plan =
    (tenant as { plans?: { price_aoa_monthly?: number; price_aoa_yearly?: number } }).plans ?? null;
  const state = billingStateOf(profile);
  const charge = computeTenantCharge({ profile, plan, activeStudents, state, periodDiscounts });

  return {
    tenant,
    school,
    usage: {
      students: activeStudents,
      staff: Number(usageRes.data?.active_staff_count ?? 0),
      storageBytes: Number(usageRes.data?.storage_bytes_used ?? 0),
      calculatedAt: (usageRes.data?.last_calculated_at as string | null) ?? null,
    },
    subscription: subscriptionRes.data ?? null,
    domains: domainsRes.data ?? [],
    audit: auditRes.data ?? [],
    plans: plansRes.data ?? [],
    billing: {
      profile,
      stored: billing.stored,
      tableReady: billing.tableReady,
      migration: BILLING_MIGRATION,
      suggestedInstitutionType,
      state,
      charge,
      schedule: billingSchedule(profile),
      publicReadiness: publicReviewReadiness(profile),
      periodDiscounts,
    },
    // As listas vêm daqui para o ADMIN não ter uma cópia que se desactualiza.
    catalog: {
      institutionTypes: INSTITUTION_TYPES,
      pricingModels: PRICING_MODELS,
      periods: BILLING_PERIODS,
      paymentMethods: PAYMENT_METHODS,
      reviewStatuses: PUBLIC_REVIEW_STATUSES,
      publicRequirements: PUBLIC_SCHOOL_REQUIREMENTS,
    },
  };
}

/**
 * Valor que a escola paga ao escolher um plano e periodicidade no SIGA. Com
 * condições próprias (por aluno ou valor fixo) é esse valor; senão, a tabela.
 */
export async function amountForSchool(
  db: SupabaseClient,
  tenantId: string,
  plan: PlanPrices & { price_aoa_monthly?: number | null },
  billing: "monthly" | "yearly",
  profile: TenantBillingProfile | null,
): Promise<number> {
  if (!profile || profile.pricingModel === "plan") return planPriceKz(plan as never, billing);
  const { data: usage } = await db
    .from("tenant_usage")
    .select("active_students_count")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return computeTenantCharge({
    profile: { ...profile, billingPeriod: billing },
    plan,
    activeStudents: Number(usage?.active_students_count ?? 0),
  }).total;
}
