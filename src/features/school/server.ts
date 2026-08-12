import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { schoolSettingDefaults } from "@/lib/school-config";
import {
  pedagogySettingsSchema,
  setTermLockInputSchema,
  updateBillingSettingsInputSchema,
  updateSchoolAgtInputSchema,
  updateSchoolBankingInputSchema,
  updateSchoolSettingsInputSchema,
} from "./schemas";
import { normalizeAngolaIban } from "@/lib/angola-banking";
import { validateSchoolNif } from "@/lib/angola-identity";

type JsonMap = Record<string, unknown>;
type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

async function readSettingDomain(db: AdminDb, schoolId: string, domain: string) {
  const { data, error } = await db
    .from("school_settings")
    .select("id, domain, version, value")
    .eq("school_id", schoolId)
    .eq("domain", domain)
    .maybeSingle();
  if (error && !/schema cache|does not exist|42P01|PGRST/i.test(error.message)) {
    throw publicDatabaseError(error, `Não foi possível ler settings:${domain}.`);
  }
  return data as { id: string; domain: string; version: number; value: JsonMap } | null;
}

async function upsertSettingDomain(
  db: AdminDb,
  schoolId: string,
  domain: string,
  value: JsonMap,
  userId: string,
) {
  const existing = await readSettingDomain(db, schoolId, domain);
  if (existing?.id) {
    const { data, error } = await db
      .from("school_settings")
      .update({
        value,
        version: Number(existing.version ?? 1) + 1,
        changed_by: userId,
      })
      .eq("id", existing.id)
      .select("id, domain, version, value")
      .single();
    if (error) throw publicDatabaseError(error, `Não foi possível guardar settings:${domain}.`);
    return data;
  }

  const { data, error } = await db
    .from("school_settings")
    .insert({
      school_id: schoolId,
      domain,
      version: 1,
      value,
      changed_by: userId,
    })
    .select("id, domain, version, value")
    .single();
  if (error) throw publicDatabaseError(error, `Não foi possível criar settings:${domain}.`);
  return data;
}

async function loadSchoolSettingsBundle(db: AdminDb, schoolId: string) {
  const { data: school, error } = await db
    .from("schools")
    .select(
      "id, name, nif, phone, email, address, currency_code, theme, province, municipality, updated_at",
    )
    .eq("id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível carregar a escola.");
  if (!school) throw new Error("Escola não encontrada.");

  const [
    { data: activeYear },
    academicSettings,
    preferenceSettings,
    billingSettings,
    pedagogySettings,
    brandingSettings,
    bankingSettings,
    agtSettings,
  ] = await Promise.all([
      db
        .from("academic_years")
        .select("name, status")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      readSettingDomain(db, schoolId, "academic"),
      readSettingDomain(db, schoolId, "preferences"),
      readSettingDomain(db, schoolId, "billing"),
      readSettingDomain(db, schoolId, "pedagogy"),
      readSettingDomain(db, schoolId, "branding"),
      readSettingDomain(db, schoolId, "banking"),
      readSettingDomain(db, schoolId, "agt"),
    ]);

  const academicValue = (academicSettings?.value ?? {}) as JsonMap;
  const preferencesValue = (preferenceSettings?.value ?? {}) as JsonMap;
  const billingValue = (billingSettings?.value ?? {}) as JsonMap;
  const brandingValue = (brandingSettings?.value ?? {}) as JsonMap;
  const bankingValue = (bankingSettings?.value ?? {}) as JsonMap;
  const agtValue = (agtSettings?.value ?? {}) as JsonMap;

  return {
    id: school.id as string,
    name: school.name as string,
    nif: (school.nif as string | null) ?? null,
    director_name: (academicValue.director_name as string | undefined) ?? null,
    phone: (school.phone as string | null) ?? null,
    email: (school.email as string | null) ?? null,
    address: (school.address as string | null) ?? null,
    academic_year:
      (academicValue.academic_year as string | undefined) ??
      (activeYear?.name as string | undefined) ??
      schoolSettingDefaults.academicYear,
    currency: (school.currency_code as string | undefined) || schoolSettingDefaults.currency,
    evaluation_periods:
      Number(academicValue.evaluation_periods ?? schoolSettingDefaults.evaluationPeriods) ||
      schoolSettingDefaults.evaluationPeriods,
    passing_grade:
      Number(academicValue.passing_grade ?? schoolSettingDefaults.passingGrade) ||
      schoolSettingDefaults.passingGrade,
    preferences: preferencesValue,
    pedagogy: pedagogySettingsSchema.safeParse(pedagogySettings?.value ?? {}).data ?? {
      teachingLevels: [],
      courses: [],
    },
    version: Number(academicSettings?.version ?? 1),
    billing: {
      id: billingSettings?.id ?? "billing",
      due_day: Number(billingValue.due_day ?? 10),
      late_fee_percent: Number(billingValue.late_fee_percent ?? 2),
      grace_days: Number(billingValue.grace_days ?? 5),
      sibling_discount_percent: Number(billingValue.sibling_discount_percent ?? 10),
      version: Number(billingSettings?.version ?? 1),
    },
    branding: {
      logo_url: typeof brandingValue.logo_url === "string" ? brandingValue.logo_url : null,
    },
    banking: {
      bank_name: typeof bankingValue.bank_name === "string" ? bankingValue.bank_name : "",
      account_holder:
        typeof bankingValue.account_holder === "string" ? bankingValue.account_holder : "",
      iban: typeof bankingValue.iban === "string" ? bankingValue.iban : "",
      swift: typeof bankingValue.swift === "string" ? bankingValue.swift : "",
      multicaixa_merchant:
        typeof bankingValue.multicaixa_merchant === "string"
          ? bankingValue.multicaixa_merchant
          : "",
    },
    agt: {
      software_certified:
        typeof agtValue.software_certified === "string" ? agtValue.software_certified : "",
      invoice_series: typeof agtValue.invoice_series === "string" ? agtValue.invoice_series : "",
      fiscal_notes: typeof agtValue.fiscal_notes === "string" ? agtValue.fiscal_notes : "",
    },
  };
}

export const getSchoolSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    return loadSchoolSettingsBundle(db, membership.schoolId);
  });

export const listAcademicYears = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("academic_years")
      .select("id, name, status, starts_on, ends_on")
      .eq("school_id", membership.schoolId)
      .order("starts_on", { ascending: false });
    if (error) throw publicDatabaseError(error, "Não foi possível carregar os anos lectivos.");
    return (data ?? []).map((year: { id: string; name: string; status: string }) => ({
      id: year.id,
      code: year.name,
      name: year.name,
      status: year.status,
    }));
  });

export const updateSchoolSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSchoolSettingsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();
    const normalizedNif = validateSchoolNif(data.nif).compact ?? data.nif.trim();

    const { data: school, error } = await db
      .from("schools")
      .update({
        name: data.name,
        nif: normalizedNif,
        phone: data.phone,
        email: data.email,
        address: data.address,
        currency_code: data.currency,
      })
      .eq("id", membership.schoolId)
      .select("id")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a escola.");
    if (!school) throw new Error("Escola não encontrada.");

    await upsertSettingDomain(
      db,
      membership.schoolId,
      "academic",
      {
        director_name: data.directorName,
        academic_year: data.academicYear,
        evaluation_periods: data.evaluationPeriods,
        passing_grade: data.passingGrade,
      },
      context.userId,
    );
    await upsertSettingDomain(
      db,
      membership.schoolId,
      "preferences",
      data.preferences,
      context.userId,
    );
    await upsertSettingDomain(
      db,
      membership.schoolId,
      "branding",
      { logo_url: data.logoUrl?.trim() || null },
      context.userId,
    );

    const { data: year } = await db
      .from("academic_years")
      .select("id, name")
      .eq("school_id", membership.schoolId)
      .eq("name", data.academicYear)
      .maybeSingle();
    if (year?.id) {
      await db
        .from("academic_years")
        .update({ status: "active" })
        .eq("id", year.id)
        .eq("school_id", membership.schoolId);
    }

    return loadSchoolSettingsBundle(db, membership.schoolId);
  });

export const listRecentAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("audit_logs")
      .select("id, actor_user_id, action, entity_type, entity_id, metadata, occurred_at")
      .eq("school_id", membership.schoolId)
      .order("occurred_at", { ascending: false })
      .limit(20);
    if (error) throw publicDatabaseError(error, "Não foi possível consultar a auditoria.");
    return (data ?? []).map(
      (row: {
        id: number | string;
        actor_user_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string | null;
        metadata: unknown;
        occurred_at: string;
      }) => ({
        id: String(row.id),
        actor_id: row.actor_user_id,
        action: row.action,
        entity_type: row.entity_type,
        reason: null,
        created_at: row.occurred_at,
      }),
    );
  });

export const updateBillingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateBillingSettingsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    await upsertSettingDomain(
      db,
      membership.schoolId,
      "billing",
      {
        due_day: data.dueDay,
        late_fee_percent: data.lateFeePercent,
        grace_days: data.graceDays,
        sibling_discount_percent: data.siblingDiscountPercent,
      },
      context.userId,
    );
    const settings = await loadSchoolSettingsBundle(db, membership.schoolId);
    return settings.billing;
  });

export const updateSchoolBanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSchoolBankingInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
      "Tesouraria",
    ]);
    const db = await loadSgaAdminClient();
    const iban = normalizeAngolaIban(data.iban);
    await upsertSettingDomain(
      db,
      membership.schoolId,
      "banking",
      {
        bank_name: data.bankName.trim(),
        account_holder: data.accountHolder.trim(),
        iban,
        swift: data.swift?.trim() || "",
        multicaixa_merchant: data.multicaixaMerchant?.trim() || "",
      },
      context.userId,
    );
    const settings = await loadSchoolSettingsBundle(db, membership.schoolId);
    return settings.banking;
  });

export const updateSchoolAgt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSchoolAgtInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();
    await upsertSettingDomain(
      db,
      membership.schoolId,
      "agt",
      {
        software_certified: data.softwareCertified?.trim() || "",
        invoice_series: data.invoiceSeries?.trim() || "",
        fiscal_notes: data.fiscalNotes?.trim() || "",
      },
      context.userId,
    );
    const settings = await loadSchoolSettingsBundle(db, membership.schoolId);
    return settings.agt;
  });

export const updatePedagogySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => pedagogySettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();
    await upsertSettingDomain(
      db,
      membership.schoolId,
      "pedagogy",
      {
        teachingLevels: data.teachingLevels,
        courses: data.courses,
        closedTerms: data.closedTerms,
      },
      context.userId,
    );
    const settings = await loadSchoolSettingsBundle(db, membership.schoolId);
    return settings.pedagogy;
  });

export const setTermLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setTermLockInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();
    const current = await readSettingDomain(db, membership.schoolId, "pedagogy");
    const pedagogy = pedagogySettingsSchema.safeParse(current?.value ?? {}).data ?? {
      teachingLevels: [],
      courses: [],
      closedTerms: [],
    };
    const closedTerms = data.closed
      ? Array.from(new Set([...pedagogy.closedTerms, data.term])).sort()
      : pedagogy.closedTerms.filter((term) => term !== data.term);
    await upsertSettingDomain(
      db,
      membership.schoolId,
      "pedagogy",
      { ...pedagogy, closedTerms },
      context.userId,
    );
    const settings = await loadSchoolSettingsBundle(db, membership.schoolId);
    return settings.pedagogy;
  });
