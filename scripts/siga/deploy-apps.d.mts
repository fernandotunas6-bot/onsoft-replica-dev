/**
 * Declarações para `deploy-apps.mjs` — JavaScript puro (usado por `deploy-all.mjs` e
 * `deploy-cf.mjs`), importado a partir de TypeScript em `tests/saas/deploy-apps.test.ts`.
 */
export declare const DEPLOY_APPS: string[];
export declare function selectDeployApps(raw: string | null | undefined): Set<string>;
export declare function usesWranglerLogin(env: Record<string, string | undefined>): boolean;
export declare function assertWranglerLoginAllowed(env: Record<string, string | undefined>): void;
