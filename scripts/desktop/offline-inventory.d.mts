export interface OfflineInventoryReport {
  format: string;
  schoolRuntime: {
    remoteWindow: boolean;
    allowedRemoteOrigins: string[];
    localEntrypoints: string[];
    schoolBundleEntry: boolean;
    frontendDistribution: string;
    webServerPresetCloudflare: boolean;
  };
  counts: {
    routeFiles: number;
    apiRoutes: number;
    otherRoutes: number;
    routeFilesWithDirectServerFn: number;
    routeFilesImportingServerModules: number;
    routeFilesWithServerHandlers: number;
    filesDefiningServerFunctions: number;
  };
  candidatesForAudit: string[];
  serverFunctionModules: string[];
}
export function inventoryOfflineReadiness(root?: string): OfflineInventoryReport;
export function verifyOfflineInventory(report: OfflineInventoryReport): string[];
