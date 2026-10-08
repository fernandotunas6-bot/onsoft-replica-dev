import type { Plan, Tenant } from "@/features/saas/types";

export interface StudentCapacitySnapshot {
  activeStudents: number;
  maxStudents: number | null;
  remaining: number | null;
  atLimit: boolean;
  nearLimit: boolean;
}

export type TenantCapacityInput =
  | { max_students?: number | null; plans?: { max_students?: number | null } | null }
  | Tenant
  | null
  | undefined;

export function resolveMaxStudents(tenant: TenantCapacityInput, plan?: Plan | null): number | null {
  const fromTenant = tenant?.max_students;
  const fromPlan = plan?.max_students ?? tenant?.plans?.max_students;
  const max = fromTenant ?? fromPlan;
  return typeof max === "number" && max > 0 ? max : null;
}

export function buildStudentCapacity(
  activeStudents: number,
  tenant: TenantCapacityInput,
  plan?: Plan | null,
  nearLimitRatio = 0.9,
): StudentCapacitySnapshot {
  const maxStudents = resolveMaxStudents(tenant, plan);
  if (maxStudents == null) {
    return {
      activeStudents,
      maxStudents: null,
      remaining: null,
      atLimit: false,
      nearLimit: false,
    };
  }
  const remaining = Math.max(0, maxStudents - activeStudents);
  const atLimit = activeStudents >= maxStudents;
  const nearLimit = !atLimit && activeStudents >= Math.floor(maxStudents * nearLimitRatio);
  return { activeStudents, maxStudents, remaining, atLimit, nearLimit };
}

export function assertStudentCapacity(snapshot: StudentCapacitySnapshot, adding = 1): void {
  if (snapshot.maxStudents == null) return;
  if (snapshot.activeStudents + adding > snapshot.maxStudents) {
    throw new Error(
      `Limite de alunos do plano atingido (${snapshot.maxStudents}). ` +
        "Actualize o plano no portal comercial SIGA Plus.",
    );
  }
}

const BYTES_PER_GB = 1024 ** 3;

/** Quota de arquivo do plano em GB; `null` = sem limite. Como os alunos: tenant, depois plano. */
export function resolveMaxStorageGb(
  tenant: { max_storage_gb?: number | null } | null | undefined,
  plan?: { max_storage_gb?: number | null } | null,
): number | null {
  const max = tenant?.max_storage_gb ?? plan?.max_storage_gb;
  return typeof max === "number" && max > 0 ? max : null;
}

/**
 * O plano promete X GB de arquivo; antes nada o verificava (auditoria 13, A3).
 * Recusa quando o ficheiro novo passaria a quota.
 */
export function assertStorageCapacity(
  usedBytes: number,
  addingBytes: number,
  maxStorageGb: number | null,
): void {
  if (maxStorageGb == null) return;
  if (usedBytes + addingBytes > maxStorageGb * BYTES_PER_GB) {
    const usedGb = (usedBytes / BYTES_PER_GB).toFixed(2).replace(".", ",");
    throw new Error(
      `Espaço de arquivo do plano esgotado (${usedGb} de ${maxStorageGb} GB usados). ` +
        "Apague ficheiros que já não precisa ou actualize o plano no portal comercial SIGA Plus.",
    );
  }
}
