import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  assertStorageCapacity,
  assertStudentCapacity,
  buildStudentCapacity,
  resolveMaxStorageGb,
  type StudentCapacitySnapshot,
} from "@/features/saas/tenant-limits";
import { selectAllPages } from "@/features/import/engine/paged";
import { countSchoolUsage } from "@/features/saas/usage-sync";

export async function getStudentCapacityForSchool(
  schoolId: string,
): Promise<StudentCapacitySnapshot> {
  const db = await loadSgaAdminClient();
  const { data: school, error: schoolErr } = await db
    .from("schools")
    .select("tenant_id")
    .eq("id", schoolId)
    .maybeSingle();
  if (schoolErr) throw publicDatabaseError(schoolErr, "Não foi possível resolver a escola.");

  const counts = await countSchoolUsage(db, schoolId);

  if (!school?.tenant_id) {
    return buildStudentCapacity(counts.active_students_count, null, null);
  }

  const { data: tenant, error: tenantErr } = await db
    .from("tenants")
    .select("max_students, plans(max_students)")
    .eq("id", school.tenant_id)
    .maybeSingle();
  if (tenantErr) throw publicDatabaseError(tenantErr, "Não foi possível carregar o plano.");

  return buildStudentCapacity(
    counts.active_students_count,
    tenant as { max_students?: number; plans?: { max_students?: number } },
    null,
  );
}

export async function assertCanAddStudentForSchool(schoolId: string, adding = 1): Promise<void> {
  const capacity = await getStudentCapacityForSchool(schoolId);
  assertStudentCapacity(capacity, adding);
}

/** Bytes ocupados pelos ficheiros da escola no armazenamento do SIGA (sem pastas nem apagados). */
export async function sumSchoolStorageBytes(schoolId: string): Promise<number> {
  const db = await loadSgaAdminClient();
  type Row = { size_bytes: number | null };
  const rows = await selectAllPages<Row>(
    (from, to) =>
      db
        .from("siga_files")
        .select("size_bytes")
        .eq("school_id", schoolId)
        .eq("storage_backend", "sga")
        .eq("is_folder", false)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: Row[] | null;
        error: { message: string } | null;
      }>,
    "Não foi possível calcular o espaço de arquivo",
  );
  return rows.reduce((total, row) => total + Math.max(Number(row.size_bytes ?? 0), 0), 0);
}

export async function assertCanStoreBytesForSchool(
  schoolId: string,
  adding: number,
): Promise<void> {
  const db = await loadSgaAdminClient();
  const { data: school, error: schoolErr } = await db
    .from("schools")
    .select("tenant_id")
    .eq("id", schoolId)
    .maybeSingle();
  if (schoolErr) throw publicDatabaseError(schoolErr, "Não foi possível resolver a escola.");
  if (!school?.tenant_id) return;
  const { data: tenant, error: tenantErr } = await db
    .from("tenants")
    .select("max_storage_gb, plans(max_storage_gb)")
    .eq("id", school.tenant_id)
    .maybeSingle();
  if (tenantErr) throw publicDatabaseError(tenantErr, "Não foi possível carregar o plano.");
  const typed = tenant as {
    max_storage_gb?: number | null;
    plans?: { max_storage_gb?: number | null } | null;
  } | null;
  const maxGb = resolveMaxStorageGb(typed, typed?.plans ?? null);
  if (maxGb == null) return;
  assertStorageCapacity(await sumSchoolStorageBytes(schoolId), adding, maxGb);
}
