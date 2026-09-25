/** Server-owned SIGA records only. Never authorize from Google profile data. */
export interface InstitutionalAccessInput {
  activeMembershipSchoolIds: readonly string[];
  activeSchoolIds: readonly string[];
  isPlatformAdmin: boolean;
}

/** Requires both an active membership and its active school; platform admins
 * are authorized at the identity gate, but route/data permissions still apply.
 */
export function hasInstitutionalAccess({
  activeMembershipSchoolIds,
  activeSchoolIds,
  isPlatformAdmin,
}: InstitutionalAccessInput): boolean {
  if (isPlatformAdmin) return true;
  if (activeMembershipSchoolIds.length === 0 || activeSchoolIds.length === 0) return false;
  const allowed = new Set(activeSchoolIds);
  return activeMembershipSchoolIds.some((schoolId) => allowed.has(schoolId));
}
