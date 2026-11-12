/**
 * Candidatos para a atribuição de um cargo escolar. A selecção opera apenas
 * sobre as contas da escola activa, já filtradas no servidor por membership.
 * Nunca procurar identidades Auth de outras escolas através deste controlo.
 */

export type CandidateScope = "unassigned" | "without_staff";

const NON_STAFF_ROLES = new Set(["Utilizador", "Aluno", "Encarregado"]);

export function isUnassignedStaffCandidate(
  account: { cargo?: string | null; is_self: boolean },
  scope: CandidateScope,
): boolean {
  if (account.is_self) return false;
  if (scope === "unassigned") return !account.cargo || account.cargo === "Utilizador";
  return !account.cargo || NON_STAFF_ROLES.has(account.cargo);
}
