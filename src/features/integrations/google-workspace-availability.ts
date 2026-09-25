/**
 * These catalog entries require separate Workspace OAuth consent and a
 * server-side encrypted token vault. They cannot be "connected" from a
 * merchant ID or a login via Supabase Auth.
 */
export function isPendingWorkspaceProvider(provider: string): boolean {
  return provider === "gmail_workspace" || provider === "google_calendar";
}
