import type { SupabaseClient } from "@supabase/supabase-js";

/** Public subset used by the staging-only Playwright cleanup helper. */
export declare function cleanupE2ETenantBySlug(
  admin: SupabaseClient,
  slug: string,
  adminEmail?: string,
  approvedTenantId?: string | null,
): Promise<{ removed: boolean; tenantId?: string }>;
