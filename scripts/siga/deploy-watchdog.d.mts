/**
 * Declarações para `deploy-watchdog.mjs` — JavaScript puro (corrido pelo
 * `deploy-watchdog.yml`), importado a partir de TypeScript em
 * `tests/saas/deploy-watchdog.test.ts`.
 */
export type Release = { sha: string; dirty: boolean };
export type DeployRun = {
  id: number;
  run_number?: number;
  run_attempt?: number;
  status: string;
  conclusion: string | null;
  head_sha: string;
  updated_at?: string;
  html_url?: string;
};
export type Decision = {
  state: "ok" | "a-publicar" | "parado";
  retry: "rerun" | "dispatch" | null;
};

export declare const DEPLOY_WORKFLOW: string;
export declare const ISSUE_LABEL: string;
export declare const ISSUE_TITLE: string;
export declare const RETRY_AFTER_MS: number;
export declare const MAX_ATTEMPTS_PER_RUN: number;
export declare function isDeployIgnoredPath(file: string): boolean;
export declare function parseRelease(value: string | null | undefined): Release | null;
export declare function isInSync(input: {
  release: Release | null;
  mainSha: string;
  changedFiles: string[] | null;
}): boolean;
export declare function failureHint(job: string | null, step: string | null): string;
export declare function decide(input: {
  inSync: boolean;
  run: DeployRun | null;
  mainSha: string;
  event: string;
  now: number;
  failedJob?: string | null;
}): Decision;
export declare function issueBody(input: {
  mainSha: string;
  release: Release | null;
  run: DeployRun | null;
  failedJob: string | null;
  failedStep: string | null;
  retry: Decision["retry"];
  checkedAt: string;
}): string;
