/** Only missing-table codes allow the legacy module-not-installed fallback. */
export function isMissingHrTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
