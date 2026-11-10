/**
 * Contrato de tipos do preflight E2E @live.
 * O módulo .mjs valida variáveis e não abre ligações ao Supabase.
 */
export type ReleaseStagingEnvironment = Readonly<Record<string, string | undefined>>;

export declare function checkReleaseStagingEnvironment(
  env: ReleaseStagingEnvironment,
): { projectRef: string };
