export declare const REQUIRED_WORKER_SECRETS: string[];
export declare const OPTIONAL_WORKER_SECRETS: string[];
export declare const NOT_WORKER_SECRETS: Record<string, string>;
export declare function collectWorkerSecrets(
  envVars: Record<string, string | undefined>,
  processEnv: Record<string, string | undefined>,
): Array<[string, string]>;
