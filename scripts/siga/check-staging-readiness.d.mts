/** Preflight do E2E autenticado. Nunca imprime credenciais. */
export function assertStagingReady(
  env?: Record<string, string | undefined>,
): { projectRef: string };
