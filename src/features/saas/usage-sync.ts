import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

export interface TenantUsageSyncRow {
  tenant_id: string;
  school_id: string;
  active_students_count: number;
  active_staff_count: number;
}

/** Contagens por escola ligada a um tenant (isolamento por `school_id`). */
export function buildTenantUsageRows(
  schools: Array<{ id: string; tenant_id: string | null }>,
  studentCounts: Map<string, number>,
  staffCounts: Map<string, number>,
): TenantUsageSyncRow[] {
  return schools
    .filter((school): school is { id: string; tenant_id: string } => Boolean(school.tenant_id))
    .map((school) => ({
      tenant_id: school.tenant_id,
      school_id: school.id,
      active_students_count: studentCounts.get(school.id) ?? 0,
      active_staff_count: staffCounts.get(school.id) ?? 0,
    }));
}

type UsageDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export async function countSchoolUsage(
  db: UsageDb,
  schoolId: string,
): Promise<{ active_students_count: number; active_staff_count: number }> {
  const { count: students, error: studentErr } = await db
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .neq("status", "inactive");
  if (studentErr) throw publicDatabaseError(studentErr, "Não foi possível contar alunos.");

  const { count: staff, error: staffErr } = await db
    .from("school_memberships")
    .select("*", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("status", "active");
  if (staffErr) throw publicDatabaseError(staffErr, "Não foi possível contar utilizadores.");

  return {
    active_students_count: students ?? 0,
    active_staff_count: staff ?? 0,
  };
}

export async function upsertTenantUsageRow(
  db: UsageDb,
  row: Pick<TenantUsageSyncRow, "tenant_id" | "active_students_count" | "active_staff_count">,
): Promise<void> {
  const { error } = await db.from("tenant_usage").upsert(
    {
      tenant_id: row.tenant_id,
      active_students_count: row.active_students_count,
      active_staff_count: row.active_staff_count,
      last_calculated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error)
    throw publicDatabaseError(error, "Não foi possível actualizar a utilização do tenant.");
}

/** Sincroniza um tenant logo após provisionamento ou manualmente. */
export async function syncTenantUsageForSchool(
  tenantId: string,
  schoolId: string,
): Promise<TenantUsageSyncRow> {
  const db = await loadSgaAdminClient();
  const counts = await countSchoolUsage(db, schoolId);
  const row: TenantUsageSyncRow = {
    tenant_id: tenantId,
    school_id: schoolId,
    ...counts,
  };
  await upsertTenantUsageRow(db, row);
  return row;
}

/** Resolve `tenant_id` a partir da escola e sincroniza (best-effort, não bloqueia UX). */
export async function syncTenantUsageForSchoolId(schoolId: string): Promise<void> {
  const db = await loadSgaAdminClient();
  const { data: school, error } = await db
    .from("schools")
    .select("tenant_id")
    .eq("id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível resolver o tenant da escola.");
  if (!school?.tenant_id) return;
  await syncTenantUsageForSchool(school.tenant_id as string, schoolId);
}

export function queueTenantUsageSync(schoolId: string): void {
  void syncTenantUsageForSchoolId(schoolId).catch((err) => {
    console.warn("[tenant_usage] Falha ao sincronizar utilização:", err);
  });
}

export async function syncAllTenantUsage(): Promise<{
  updated: number;
  rows: TenantUsageSyncRow[];
}> {
  const db = await loadSgaAdminClient();
  const { data: schools, error: schoolsErr } = await db
    .from("schools")
    .select("id, tenant_id")
    .not("tenant_id", "is", null);
  if (schoolsErr) throw publicDatabaseError(schoolsErr, "Não foi possível listar escolas.");

  const studentCounts = new Map<string, number>();
  const staffCounts = new Map<string, number>();

  for (const school of schools ?? []) {
    const counts = await countSchoolUsage(db, school.id);
    studentCounts.set(school.id, counts.active_students_count);
    staffCounts.set(school.id, counts.active_staff_count);
  }

  const rows = buildTenantUsageRows(schools ?? [], studentCounts, staffCounts);

  for (const row of rows) {
    await upsertTenantUsageRow(db, row);
  }

  return { updated: rows.length, rows };
}
