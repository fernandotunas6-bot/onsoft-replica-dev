export declare function isBuildSecretName(name: string): boolean;
export declare function buildEnvWithoutSecrets(
  env: Record<string, string | undefined>,
): Record<string, string>;
