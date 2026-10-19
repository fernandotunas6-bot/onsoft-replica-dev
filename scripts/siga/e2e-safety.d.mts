export function readE2EEnvironment(
  env?: Record<string, string | undefined>,
): Record<string, string | undefined>;
export function assertSafeE2ETarget(env?: Record<string, string | undefined>): {
  projectRef: string;
};
export function assertSafeCleanupTarget(env?: Record<string, string | undefined>): {
  projectRef: string;
  production?: boolean;
};
