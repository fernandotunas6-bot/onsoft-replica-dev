/**
 * Authentication is handled by Supabase; authorization is exclusively based
 * on server-controlled SIGA records, never email or Google profile metadata.
 */
export function hasInstitutionalAccess(
  activeSchoolMembershipCount: number,
  platformAdminCount: number,
): boolean {
  return activeSchoolMembershipCount > 0 || platformAdminCount > 0;
}
