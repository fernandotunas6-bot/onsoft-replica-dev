/**
 * Estado do arranque da escola da sessão — ver `setup-guide.ts`.
 *
 * Só o Administrador o recebe: é ele quem configura a escola, e a resposta
 * inclui o estado da assinatura. A escola vem sempre da membership resolvida
 * no servidor, nunca de um identificador enviado pelo browser, e só se lêem
 * contagens — nenhum dado de alunos ou pessoas sai daqui.
 *
 * As contagens usam `context.supabase` (JWT, respeita RLS): na produção, a
 * 2026-09-30, todas estas tabelas têm política SELECT por permissão do papel
 * (`academic.structure.read`, `finance.settings.read`, `rbac.memberships.read`,
 * `students.records.read`…) que o papel owner/admin tem. Só `tenants` fica no
 * cliente privilegiado — a política é apenas `is_platform_admin()` —, como em
 * subscription-server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { buildSetupGuide, type SetupCounts, type SetupGuide } from "./setup-guide";
import { loadSchoolTeachingContext } from "@/features/academic/school-structure-seed";

export type SchoolSetupOverview = SetupGuide & {
  schoolName: string;
  subscription: {
    planName: string | null;
    status: string | null;
    trialEndsAt: string | null;
  } | null;
};

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
/** Cliente do utilizador (RLS) ou privilegiado: as consultas são as mesmas. */
type ReadDb = Pick<Db, "from">;
type CountQuery = PromiseLike<{ count: number | null; error: unknown }>;

/** Contagem que nunca rebenta o guia: uma tabela ilegível conta como 0. */
async function count(query: CountQuery): Promise<number> {
  const { count: total, error } = await query;
  return error ? 0 : (total ?? 0);
}

const head = { count: "exact", head: true } as const;

export async function loadSetupCounts(
  db: ReadDb,
  schoolId: string,
  adminUserId: string,
): Promise<{ counts: SetupCounts; tenantId: string | null; schoolName: string }> {
  const [schoolRes, yearRes] = await Promise.all([
    db
      .from("schools")
      .select("name, nif, director_name, phone, email, logo_url, tenant_id")
      .eq("id", schoolId)
      .maybeSingle(),
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
  const school = schoolRes.data;
  const year = yearRes.data;

  const activeFeePlans = year
    ? await db
        .from("fee_plans")
        .select("id")
        .eq("school_id", schoolId)
        .eq("academic_year_id", year.id)
        .eq("status", "active")
    : { data: [] as Array<{ id: string }> };
  const feePlanIds = (activeFeePlans.data ?? []).map((plan) => plan.id);

  const [
    terms,
    programs,
    gradeLevels,
    subjects,
    classGroups,
    rooms,
    assessmentModels,
    feeItems,
    otherMembers,
    pendingInvitations,
    students,
    openForms,
  ] = await Promise.all([
    year
      ? count(
          db
            .from("terms")
            .select("*", head)
            .eq("school_id", schoolId)
            .eq("academic_year_id", year.id)
            .not("starts_on", "is", null)
            .not("ends_on", "is", null),
        )
      : 0,
    count(db.from("programs").select("*", head).eq("school_id", schoolId).eq("is_active", true)),
    count(
      db.from("grade_levels").select("*", head).eq("school_id", schoolId).eq("is_active", true),
    ),
    count(
      db
        .from("subjects")
        .select("*", head)
        .eq("school_id", schoolId)
        .eq("status", "active")
        .is("deleted_at", null),
    ),
    year
      ? count(
          db
            .from("class_groups")
            .select("*", head)
            .eq("school_id", schoolId)
            .eq("academic_year_id", year.id)
            .in("status", ["draft", "active"]),
        )
      : 0,
    count(db.from("rooms").select("*", head).eq("school_id", schoolId).is("deleted_at", null)),
    count(
      db
        .from("assessment_rule_sets")
        .select("*", head)
        .eq("school_id", schoolId)
        .eq("code", "DEFAULT")
        .eq("status", "active"),
    ),
    feePlanIds.length
      ? count(
          db
            .from("fee_items")
            .select("*", head)
            .eq("school_id", schoolId)
            .in("fee_plan_id", feePlanIds)
            .eq("is_active", true),
        )
      : 0,
    count(
      db
        .from("school_memberships")
        .select("*", head)
        .eq("school_id", schoolId)
        .eq("status", "active")
        .neq("user_id", adminUserId),
    ),
    count(
      db
        .from("school_invitations")
        .select("*", head)
        .eq("school_id", schoolId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString()),
    ),
    count(db.from("students").select("*", head).eq("school_id", schoolId).is("deleted_at", null)),
    count(
      db
        .from("enrollment_forms")
        .select("*", head)
        .eq("school_id", schoolId)
        .eq("is_open", true)
        .is("deleted_at", null),
    ),
  ]);

  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;

  return {
    schoolName: String(school?.name ?? ""),
    tenantId: (school?.tenant_id as string | null) ?? null,
    counts: {
      school: {
        nif: text(school?.nif),
        director: text(school?.director_name),
        contact: text(school?.phone) || text(school?.email),
        logo: text(school?.logo_url),
      },
      activeYear: year ? { name: String(year.name) } : null,
      termsInActiveYear: terms,
      programs,
      gradeLevels,
      subjects,
      classGroupsInActiveYear: classGroups,
      rooms,
      assessmentModel: assessmentModels > 0,
      activeFeePlanWithItems: feeItems > 0,
      otherMembers,
      pendingInvitations,
      students,
      publicEnrollmentOpen: openForms > 0,
      teachingLevels: (await loadSchoolTeachingContext(db as never, schoolId)).teachingLevels,
    },
  };
}

async function loadSubscription(db: Db, tenantId: string | null) {
  if (!tenantId) return null;
  const { data: tenant } = await db
    .from("tenants")
    .select("subscription_status, trial_ends_at, plans(name)")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return null;
  const plan = (tenant as { plans?: { name?: string | null } | null }).plans;
  return {
    planName: plan?.name ?? null,
    status: (tenant.subscription_status as string | null) ?? null,
    trialEndsAt: (tenant.trial_ends_at as string | null) ?? null,
  };
}

/** `null` para quem não é Administrador: o guia não lhes diz respeito. */
export const getSchoolSetupGuide = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SchoolSetupOverview | null> => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership || membership.appRole !== "Administrador") return null;
    const { counts, tenantId, schoolName } = await loadSetupCounts(
      context.supabase as unknown as ReadDb,
      membership.schoolId,
      context.userId,
    );
    const subscription = await loadSubscription(await loadSgaAdminClient(), tenantId);
    return { ...buildSetupGuide(counts), schoolName, subscription };
  });
