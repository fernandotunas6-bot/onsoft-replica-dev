export declare function assertProductionE2ECleanupIdentity(
  adminEmail: string | null | undefined,
  tenantContactEmail: string | null | undefined,
): void;
export declare function parseE2ECleanupArgs(args: string[]): {
  execute: boolean;
  tenantId: string | null;
};
export declare function assertProductionArtifactCount(
  table: string,
  count: number | null | undefined,
): void;
