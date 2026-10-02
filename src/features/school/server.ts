import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ACADEMIC_ENTITY_TYPES,
  AUDIT_SCOPES,
  NOISY_ENTITY_TYPES,
  auditChangedFields,
  auditReason,
  describeAuditAction,
} from "@/features/audit/audit-view";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { isSchoolTypeId, schoolSettingDefaults } from "@/lib/school-config";
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

type JsonValue = string | number | boolean | null | JsonMap | JsonValue[];
interface JsonMap {
  [key: string]: JsonValue;
}
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
      .eq("school_id", schoolId)
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

export async function loadSchoolSettingsBundle(db: AdminDb, schoolId: string) {
  const { data: school, error } = await db
    .from("schools")
    .select(
      "id, name, nif, phone, email, address, currency_code, theme, province, municipality, commune, neighborhood, latitude, longitude, updated_at",
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
    institutionSettings,
    bankingSettings,
    agtSettings,
  ] = await Promise.all([
    db
      .from("academic_years")
      .select("name, status")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .order("starts_on", { ascending: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle(),
    readSettingDomain(db, schoolId, "academic"),
    readSettingDomain(db, schoolId, "preferences"),
    readSettingDomain(db, schoolId, "billing"),
    readSettingDomain(db, schoolId, "pedagogy"),
    readSettingDomain(db, schoolId, "branding"),
    readSettingDomain(db, schoolId, "institution"),
    readSettingDomain(db, schoolId, "banking"),
    readSettingDomain(db, schoolId, "agt"),
  ]);

  const brandingTableResult = await db
    .from("school_branding")
    .select("primary_color, secondary_color, portal_title, logo_url")
    .eq("school_id", schoolId)
    .maybeSingle();
  const schoolBrandingRow = brandingTableResult.error ? null : brandingTableResult.data;

  const academicValue = (academicSettings?.value ?? {}) as JsonMap;
  const preferencesValue = (preferenceSettings?.value ?? {}) as JsonMap;
  const billingValue = (billingSettings?.value ?? {}) as JsonMap;
  const brandingValue = (brandingSettings?.value ?? {}) as JsonMap;
  const institutionValue = (institutionSettings?.value ?? {}) as JsonMap;
  const bankingValue = (bankingSettings?.value ?? {}) as JsonMap;
  const agtValue = (agtSettings?.value ?? {}) as JsonMap;

  const brandingLogoFromSettings =
    typeof brandingValue["logo_url"] === "string" ? brandingValue["logo_url"] : null;
  const brandingLogoFromTable =
    typeof schoolBrandingRow?.logo_url === "string" ? schoolBrandingRow.logo_url : null;

  return {
    id: school.id as string,
    name: school.name as string,
    nif: (school.nif as string | null) ?? null,
    director_name: (academicValue["director_name"] as string | undefined) ?? null,
    phone: (school.phone as string | null) ?? null,
    email: (school.email as string | null) ?? null,
    address: (school.address as string | null) ?? null,
    // A consulta acima ja os trazia; o cabecalho da pauta oficial nomeia a
    // provincia e o municipio, e sem estes dois campos saia vazio.
    province: (school.province as string | null) ?? null,
    municipality: (school.municipality as string | null) ?? null,
    commune: (school.commune as string | null) ?? null,
    neighborhood: (school.neighborhood as string | null) ?? null,
    latitude: school.latitude == null ? null : Number(school.latitude),
    longitude: school.longitude == null ? null : Number(school.longitude),
    academic_year:
      (academicValue["academic_year"] as string | undefined) ??
      (activeYear?.name as string | undefined) ??
      schoolSettingDefaults.academicYear,
    currency: (school.currency_code as string | undefined) || schoolSettingDefaults.currency,
    evaluation_periods:
      Number(academicValue["evaluation_periods"] ?? schoolSettingDefaults.evaluationPeriods) ||
      schoolSettingDefaults.evaluationPeriods,
    passing_grade:
      Number(academicValue["passing_grade"] ?? schoolSettingDefaults.passingGrade) ||
      schoolSettingDefaults.passingGrade,
    preferences: preferencesValue,
    pedagogy: pedagogySettingsSchema.safeParse(pedagogySettings?.value ?? {}).data ?? {
      teachingLevels: [],
      courses: [],
      closedTerms: [],
      gradingProfile: null,
    },
    version: Number(academicSettings?.version ?? 1),
    billing: {
      id: billingSettings?.id ?? "billing",
      due_day: Number(billingValue["due_day"] ?? 10),
      late_fee_percent: Number(billingValue["late_fee_percent"] ?? 2),
      grace_days: Number(billingValue["grace_days"] ?? 5),
      sibling_discount_percent: Number(billingValue["sibling_discount_percent"] ?? 10),
      version: Number(billingSettings?.version ?? 1),
    },
    institution: {
      school_type: isSchoolTypeId(institutionValue["school_type"])
        ? institutionValue["school_type"]
        : null,
      philosophy:
        typeof institutionValue["philosophy"] === "string" ? institutionValue["philosophy"] : null,
    },
    branding: {
      logo_url: brandingLogoFromSettings || brandingLogoFromTable,
      motto: typeof brandingValue["motto"] === "string" ? brandingValue["motto"] : null,
      primary_color:
        typeof schoolBrandingRow?.primary_color === "string"
          ? schoolBrandingRow.primary_color
          : null,
      secondary_color:
        typeof schoolBrandingRow?.secondary_color === "string"
          ? schoolBrandingRow.secondary_color
          : null,
      portal_title:
        typeof schoolBrandingRow?.portal_title === "string" ? schoolBrandingRow.portal_title : null,
    },
    banking: {
      bank_name: typeof bankingValue["bank_name"] === "string" ? bankingValue["bank_name"] : "",
      account_holder:
        typeof bankingValue["account_holder"] === "string" ? bankingValue["account_holder"] : "",
      iban: typeof bankingValue["iban"] === "string" ? bankingValue["iban"] : "",
      swift: typeof bankingValue["swift"] === "string" ? bankingValue["swift"] : "",
      multicaixa_merchant:
        typeof bankingValue["multicaixa_merchant"] === "string"
          ? bankingValue["multicaixa_merchant"]
          : "",
    },
    agt: {
      software_certified:
        typeof agtValue["software_certified"] === "string" ? agtValue["software_certified"] : "",
      invoice_series:
        typeof agtValue["invoice_series"] === "string" ? agtValue["invoice_series"] : "",
      fiscal_notes: typeof agtValue["fiscal_notes"] === "string" ? agtValue["fiscal_notes"] : "",
    },
  };
}

export type SchoolSettingsBundle = Awaited<ReturnType<typeof loadSchoolSettingsBundle>>;

export type RecentAuditLog = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  summary: string;
  reason: string | null;
  changed_fields: string[];
  created_at: string;
};

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
      // A mesma ordem que o servidor usa para o ano activo: o browser escolhe o
      // primeiro "active" desta lista e tem de concordar com o servidor.
      .order("starts_on", { ascending: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw publicDatabaseError(error, "Não foi possível carregar os anos lectivos.");
    return (data ?? []).map((year: { id: string; name: string; status: string }) => ({
      id: year.id,
      code: year.name,
      name: year.name,
      status: year.status,
    }));
  });

export const listAcademicTerms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) return [];
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("terms")
      .select("id, name, sequence, starts_on, ends_on, academic_year_id")
      .eq("school_id", membership.schoolId)
      .order("sequence", { ascending: true });
    if (error) {
      // Tabela em falta / RLS: o selector de período fica vazio sem quebrar o shell.
      return [];
    }
    return (data ?? []).map(
      (term: {
        id: string;
        name: string;
        sequence: number | null;
        starts_on: string;
        ends_on: string;
        academic_year_id: string;
      }) => ({
        id: String(term.id),
        name: String(term.name),
        sequence: Number(term.sequence ?? 0),
        starts_on: String(term.starts_on),
        ends_on: String(term.ends_on),
        academic_year_id: String(term.academic_year_id),
      }),
    );
  });

export const updateSchoolSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSchoolSettingsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
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
        province: data.province || null,
        municipality: data.municipality || null,
        commune: data.commune || null,
        neighborhood: data.neighborhood || null,
        latitude: data.latitude ?? null,
        longitude: data.latitude == null ? null : (data.longitude ?? null),
        currency_code: data.currency,
        // `evaluation_periods` NÃO é escrito aqui: a coluna só existe na
        // migração 20260810130207, que nunca entrou nos APPLY_*.sql canónicos
        // nem no SGA — o UPDATE falhava com PGRST204 e partia o guardar inteiro
        // das definições da escola. O valor é persistido (e lido de volta por
        // loadSchoolSettingsBundle) em school_settings/academic, logo abaixo.
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
      { logo_url: data.logoUrl?.trim() || null, motto: data.motto?.trim() || null },
      context.userId,
    );
    await upsertSettingDomain(
      db,
      membership.schoolId,
      "institution",
      { school_type: data.schoolType ?? null, philosophy: data.philosophy?.trim() || null },
      context.userId,
    );

    const { data: year } = await db
      .from("academic_years")
      .select("id, name")
      .eq("school_id", membership.schoolId)
      .eq("name", data.academicYear)
      .maybeSingle();
    if (year?.id) {
      // Um ano activo de cada vez (como no Calendário Lectivo): o SIGA resolve o
      // ano corrente por estado. Antes activava sem fechar o anterior e a escola
      // podia ficar com vários anos activos.
      const { error: closeError } = await db
        .from("academic_years")
        .update({ status: "closed" })
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .neq("id", year.id);
      if (closeError) {
        throw publicDatabaseError(closeError, "Não foi possível fechar o ano lectivo anterior.");
      }
      const { error: activateError } = await db
        .from("academic_years")
        .update({ status: "active" })
        .eq("id", year.id)
        .eq("school_id", membership.schoolId);
      if (activateError) {
        throw publicDatabaseError(activateError, "Não foi possível activar o ano lectivo.");
      }
    }

    return loadSchoolSettingsBundle(db, membership.schoolId);
  });

export const listRecentAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ scope: z.enum(AUDIT_SCOPES).default("all") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<RecentAuditLog[]> => {
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    let query = db
      .from("audit_logs")
      .select("id, actor_user_id, action, entity_type, entity_id, metadata, occurred_at")
      .eq("school_id", membership.schoolId);
    query =
      data.scope === "academic"
        ? query.in("entity_type", [...ACADEMIC_ENTITY_TYPES])
        : query.not("entity_type", "in", `(${NOISY_ENTITY_TYPES.join(",")})`);
    const { data: rows, error } = await query.order("occurred_at", { ascending: false }).limit(40);
    if (error) throw publicDatabaseError(error, "Não foi possível consultar a auditoria.");

    // Nome de quem agiu: o cadastro da pessoa nesta escola.
    const actorIds = [
      ...new Set((rows ?? []).map((row) => row.actor_user_id).filter(Boolean)),
    ] as string[];
    const names = new Map<string, string>();
    if (actorIds.length) {
      const { data: people } = await db
        .from("people")
        .select("user_id, full_name")
        .eq("school_id", membership.schoolId)
        .in("user_id", actorIds);
      for (const person of people ?? []) {
        if (person.user_id && person.full_name) names.set(person.user_id, person.full_name);
      }
    }

    return (rows ?? []).map((row) => ({
      id: String(row.id),
      actor_id: row.actor_user_id,
      actor_name: row.actor_user_id ? (names.get(row.actor_user_id) ?? null) : null,
      action: row.action,
      entity_type: row.entity_type,
      summary: describeAuditAction(row.action, row.entity_type),
      reason: auditReason(row.metadata),
      changed_fields: auditChangedFields(row.metadata),
      created_at: row.occurred_at,
    }));
  });

export const updateBillingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateBillingSettingsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
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
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
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
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
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
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    await upsertSettingDomain(
      db,
      membership.schoolId,
      "pedagogy",
      {
        teachingLevels: data.teachingLevels,
        courses: data.courses,
        closedTerms: data.closedTerms,
        gradingProfile: data.gradingProfile,
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
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
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
