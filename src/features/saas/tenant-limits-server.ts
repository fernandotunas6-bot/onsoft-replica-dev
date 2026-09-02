import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  assertStudentCapacity,
  buildStudentCapacity,
  type StudentCapacitySnapshot,
} from "@/features/saas/tenant-limits";
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
