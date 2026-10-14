export function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, '');
}

export function buildSyntheticEmailFromPhone(phone: string, schoolId: string) {
  const digits = normalizePhone(phone).replace(/[^\d]/g, '');
  return `parent-${digits || 'user'}-${schoolId}@yft-school.local`;
}
