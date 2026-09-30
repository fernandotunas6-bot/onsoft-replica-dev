/** Calendar caches belong to one school and one academic year. */
export const academicCalendarKey = (schoolId: string | null, yearId?: string | null) =>
  ["calendar", "academic-calendar", schoolId, yearId ?? "active"] as const;

export function configuredTrimesters(terms: Array<{ sequence: number }>) {
  const expected = [1, 2, 3];
  const missing = expected.filter((sequence) => !terms.some((term) => term.sequence === sequence));
  const duplicated = expected.filter(
    (sequence) => terms.filter((term) => term.sequence === sequence).length > 1,
  );
  return { count: expected.length - missing.length, missing, duplicated };
}
