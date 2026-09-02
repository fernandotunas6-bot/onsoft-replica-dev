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

export function assertStudentCapacity(
  snapshot: StudentCapacitySnapshot,
  adding = 1,
): void {
  if (snapshot.maxStudents == null) return;
  if (snapshot.activeStudents + adding > snapshot.maxStudents) {
    throw new Error(
      `Limite de alunos do plano atingido (${snapshot.maxStudents}). ` +
        "Actualize o plano no portal comercial SIGA Plus.",
    );
  }
}
