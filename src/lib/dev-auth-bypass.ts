/**
 * Development login shortcuts must remain impossible in a published runtime.
 * Keep this pure so the production guard is directly testable.
 */
export function isDevAuthBypassEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.NODE_ENV === "production") return false;
  return environment.AUTH_BYPASS === "true" || environment.VITE_AUTH_DISABLED === "true";
}
