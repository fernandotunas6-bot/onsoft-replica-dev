/** Inventário E2E de leitura, sem deleção e sem autorização para produção. */
export declare function isSyntheticE2EAccount(email: unknown): boolean;
export declare function summarizeE2EResidue(
  tenants: Array<{ slug?: string | null }>,
  authUsers: Array<{ email?: string | null }>,
): { schoolCount: number; userCount: number; clean: boolean };
export declare function readAllPages<T>(
  fetchPage: (
    page: number,
    size: number,
  ) => Promise<{ data: T[] | undefined | null; error: unknown }>,
  label: string,
): Promise<T[]>;
export declare function checkE2EStagingResidue(
  admin: import("@supabase/supabase-js").SupabaseClient,
): Promise<{ schoolCount: number; userCount: number; clean: boolean }>;
