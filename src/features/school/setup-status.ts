/**
 * Estado real da configuração da escola, para o assistente de arranque
 * (/configuracoes/inicio). Só contagens e presença de dados — nada de dados
 * pessoais sai daqui. Só o Administrador.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { readSettingsDomain } from "./settings-domains";
import { planSchoolStructure } from "@/features/academic/school-structure-plan";
import {
  countPendingStructure,
  loadSchoolTeachingContext,
  seedSchoolStructure,
} from "@/features/academic/school-structure-seed";
import {
  buildSetupSteps,
  summarizeSetup,
  type SchoolSetupSnapshot,
  type SetupStep,
} from "./setup-steps";
import { HIGHER_ED_FEES } from "@/features/higher-ed/fees";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

const filled = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** Contagem exacta sem trazer linhas. Uma tabela em falta conta como 0. */
async function countRows(
  query: PromiseLike<{ count: number | null; error: { message?: string } | null }>,
) {
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

export async function loadSchoolSetupSnapshot(
  db: Db,
  schoolId: string,
  userId: string,
  hasTwoFactor: boolean,
): Promise<SchoolSetupSnapshot> {
  const head = { count: "exact" as const, head: true };

  const [{ data: school }, { data: branding }, { data: activeYear }] = await Promise.all([
    db
      .from("schools")
      .select("name, nif, phone, email, address, logo_url")
      .eq("id", schoolId)
      .maybeSingle(),
    db.from("school_branding").select("logo_url").eq("school_id", schoolId).maybeSingle(),
    db
      .from("academic_years")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .order("starts_on", { ascending: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const yearId = activeYear?.id ? String(activeYear.id) : null;

  const { data: groups } = yearId
    ? await db
        .from("class_groups")
        .select("id")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        // Estados válidos: active, draft, archived, closed — arquivadas e fechadas não contam.
        .in("status", ["active", "draft"])
        .limit(1000)
    : { data: [] as Array<{ id: string }> };
  const groupIds = (groups ?? []).map((row) => String(row.id));

  const { data: feePlans } = yearId
    ? await db
        .from("fee_plans")
        .select("id")
        .eq("school_id", schoolId)
        .eq("academic_year_id", yearId)
        .eq("status", "active")
    : { data: [] as Array<{ id: string }> };
  const feePlanIds = (feePlans ?? []).map((row) => String(row.id));

  const [
    termsInActiveYear,
    gradeLevels,
    classSubjects,
    classSubjectsWithTeacher,
    activeTeachers,
    activeRules,
    pricedFeeItems,
    activeMembers,
    openForms,
    students,
    banking,
    structure,
  ] = await Promise.all([
    yearId
      ? countRows(
          db
            .from("terms")
            .select("id", head)
            .eq("school_id", schoolId)
            .eq("academic_year_id", yearId),
        )
      : 0,
    countRows(
      db.from("grade_levels").select("id", head).eq("school_id", schoolId).eq("is_active", true),
    ),
    groupIds.length
      ? countRows(
          db
            .from("class_subjects")
            .select("id", head)
            .eq("school_id", schoolId)
            .eq("status", "active")
            .in("class_group_id", groupIds),
        )
      : 0,
    groupIds.length
      ? countRows(
          db
            .from("class_subjects")
            .select("id", head)
            .eq("school_id", schoolId)
            .eq("status", "active")
            .in("class_group_id", groupIds)
            .not("teacher_id", "is", null),
        )
      : 0,
    countRows(
      db.from("teachers").select("id", head).eq("school_id", schoolId).eq("status", "active"),
    ),
    countRows(
      db
        .from("assessment_rule_sets")
        .select("id", head)
        .eq("school_id", schoolId)
        .eq("status", "active"),
    ),
    feePlanIds.length
      ? countRows(
          db
            .from("fee_items")
            .select("id", head)
            .eq("school_id", schoolId)
            .eq("is_active", true)
            .in("fee_plan_id", feePlanIds)
            .gt("amount", 0),
        )
      : 0,
    countRows(
      db
        .from("school_memberships")
        .select("id", head)
        .eq("school_id", schoolId)
        .eq("status", "active")
        .neq("user_id", userId),
    ),
    countRows(
      db
        .from("enrollment_forms")
        .select("id", head)
        .eq("school_id", schoolId)
        .eq("is_open", true)
        .is("deleted_at", null),
    ),
    countRows(db.from("students").select("id", head).eq("school_id", schoolId)),
    readSettingsDomain(db, schoolId, "banking"),
    countPendingStructure(db, schoolId),
  ]);

  return {
    school: {
      name: filled(school?.name) ?? "Escola",
      nif: filled(school?.nif),
      phone: filled(school?.phone),
      email: filled(school?.email),
      address: filled(school?.address),
      hasLogo: Boolean(filled(branding?.logo_url) ?? filled(school?.logo_url)),
    },
    activeYearName: activeYear ? (filled(activeYear.name) ?? "Ano lectivo") : null,
    teachingLevels: structure.teachingLevels,
    pendingStructureGrades: structure.pendingGrades,
    higherEd: structure.teachingLevels.includes("superior")
      ? await loadHigherEdSetup(db, schoolId)
      : undefined,
    termsInActiveYear,
    gradeLevels,
    classGroupsInActiveYear: groupIds.length,
    classSubjects,
    classSubjectsWithTeacher,
    activeTeachers,
    hasActiveAssessmentRule: activeRules > 0,
    pricedFeeItems,
    hasBankIban: Boolean(banking.iban),
    otherActiveMembers: activeMembers,
    adminHasTwoFactor: hasTwoFactor,
    enrollmentFormOpen: openForms > 0,
    students,
  };
}

async function loadHigherEdSetup(db: Db, schoolId: string) {
  const [{ data: settings }, { data: programs }] = await Promise.all([
    db
      .from("school_settings")
      .select("id")
      .eq("school_id", schoolId)
      .eq("domain", "higher_ed")
      .maybeSingle(),
    db
      .from("programs")
      .select("id")
      .eq("school_id", schoolId)
      .in("kind", ["undergraduate", "postgraduate"])
      .eq("is_active", true),
  ]);
  const programIds = (programs ?? []).map((row) => String(row.id));
  const { data: units } = programIds.length
    ? await db
        .from("program_subjects")
        .select("program_id")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .is("deleted_at", null)
        .in("program_id", programIds)
    : { data: [] as Array<{ program_id: string }> };
  const { data: fees } = await db
    .from("fee_items")
    .select("id")
    .eq("school_id", schoolId)
    .eq("kind", "service")
    .eq("is_active", true)
    .in(
      "code",
      HIGHER_ED_FEES.map((fee) => fee.code),
    )
    .gt("amount", 0)
    .limit(1);
  return {
    regulationConfigured: Boolean(settings?.id),
    programs: programIds.length,
    programsWithPlan: new Set((units ?? []).map((row) => String(row.program_id))).size,
    feesConfigured: (fees ?? []).length > 0,
  };
}

export type SchoolSetupStatus = {
  steps: SetupStep[];
  summary: ReturnType<typeof summarizeSetup>;
};

export const getSchoolSetupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SchoolSetupStatus> => {
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const snapshot = await loadSchoolSetupSnapshot(
      db,
      membership.schoolId,
      context.userId,
      context.claims["aal"] === "aal2",
    );
    const steps = buildSetupSteps(snapshot);
    return { steps, summary: summarizeSetup(steps) };
  });

/**
 * Aplicar à base a estrutura académica do contexto da escola (níveis e cursos
 * guardados em Definições → Pedagógico). Usado pelo assistente e pelo painel
 * Pedagógico depois de mudar os níveis. Só acrescenta o que falta.
 */
export const applySchoolStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const teaching = await loadSchoolTeachingContext(db, membership.schoolId);
    if (!teaching.teachingLevels.length) {
      throw new Error("Escolha primeiro os níveis de ensino da escola em Definições → Pedagógico.");
    }
    const plan = planSchoolStructure(teaching.teachingLevels, teaching.courses);
    const { seeded } = await seedSchoolStructure(
      db,
      { schoolId: membership.schoolId, userId: context.userId, plan },
      { strict: true },
    );
    return { seeded };
  });
