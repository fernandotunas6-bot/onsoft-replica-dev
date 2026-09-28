/**
 * Configuração inicial: o que a escola já tem e o que ficou para depois.
 *
 * O registo só pede o essencial para a escola existir; o resto (ensino, salas,
 * turmas, propinas, logótipo, equipa) pode ser feito depois da criação e da
 * aprovação. Esta lista mostra ao Administrador o que falta, e deixa aplicar o
 * perfil de ensino (níveis, turnos, salas) numa escola que já existe — só
 * acrescenta, nunca apaga.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { recordAccessAudit } from "@/features/audit/record-audit";
import { applyInstitutionPlan } from "./institution-bootstrap";
import { buildInstitutionPlan, institutionProfileSchema } from "./institution-profile";
import { setupChecklist, type SetupFacts, type SetupItem } from "./institution-setup";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

type Filter = { eq?: Record<string, string>; isNull?: string };

async function countRows(db: Db, table: string, schoolId: string, filter: Filter = {}) {
  let query = db
    .from(table as "students")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);
  for (const [column, value] of Object.entries(filter.eq ?? {}))
    query = query.eq(column as "id", value);
  if (filter.isNull) query = query.is(filter.isNull as "id", null);
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

async function activeYear(db: Db, schoolId: string) {
  const { data } = await db
    .from("academic_years")
    .select("id, starts_on")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data as { id: string; starts_on: string | null } | null;
}

async function readFacts(db: Db, schoolId: string): Promise<SetupFacts> {
  const year = await activeYear(db, schoolId);
  const [school, branding, pedagogy, terms, rooms, shifts, classGroups, feePlans, staff, students] =
    await Promise.all([
      db
        .from("schools")
        .select("province, municipality, logo_url")
        .eq("id", schoolId)
        .maybeSingle(),
      db.from("school_branding").select("logo_url").eq("school_id", schoolId).maybeSingle(),
      db
        .from("school_settings")
        .select("value")
        .eq("school_id", schoolId)
        .eq("domain", "pedagogy")
        .maybeSingle(),
      year ? countRows(db, "terms", schoolId, { eq: { academic_year_id: year.id } }) : 0,
      countRows(db, "rooms", schoolId, { isNull: "deleted_at" }),
      countRows(db, "school_shifts", schoolId, { isNull: "deleted_at" }),
      year ? countRows(db, "class_groups", schoolId, { eq: { academic_year_id: year.id } }) : 0,
      countRows(db, "fee_plans", schoolId, { eq: { status: "active" } }),
      countRows(db, "school_memberships", schoolId, { eq: { status: "active" } }),
      countRows(db, "students", schoolId),
    ]);
  const levels = (pedagogy.data?.value as { teachingLevels?: unknown } | null)?.teachingLevels;
  return {
    teachingLevels: Array.isArray(levels) ? levels.map(String) : [],
    hasActiveYear: Boolean(year),
    terms,
    hasLocation: Boolean(school.data?.province && school.data?.municipality),
    hasLogo: Boolean(branding.data?.logo_url || school.data?.logo_url),
    rooms,
    shifts,
    classGroups,
    feePlans,
    staff,
    students,
  };
}

export type InstitutionSetupOverview = { items: SetupItem[]; teachingLevels: string[] };

export const getInstitutionSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InstitutionSetupOverview> => {
    const membership = await requireSgaWriterFor("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const facts = await readFacts(db, membership.schoolId);
    return { items: setupChecklist(facts), teachingLevels: facts.teachingLevels };
  });

export const applyInstitutionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => institutionProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite("gestao", context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const year = await activeYear(db, membership.schoolId);
    const yearStart = year?.starts_on
      ? Number(year.starts_on.slice(0, 4))
      : new Date().getFullYear();
    const plan = buildInstitutionPlan(data, yearStart);
    const warnings: string[] = [];
    const { seeded } = await applyInstitutionPlan(
      db,
      { schoolId: membership.schoolId, adminUserId: context.userId, plan },
      (part, message) => {
        console.warn(`[institution-setup] ${part}:`, message);
        warnings.push(part);
      },
    );
    await recordAccessAudit({
      schoolId: membership.schoolId,
      actorUserId: context.userId,
      action: "school.institution_profile_applied",
      entityType: "schools",
      entityId: membership.schoolId,
      metadata: { levels: data.levels, shifts: data.shifts, rooms: data.rooms, seeded, warnings },
    });
    return { seeded, warnings, hasActiveYear: Boolean(year) };
  });
