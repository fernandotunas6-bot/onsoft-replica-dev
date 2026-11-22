export declare function pendingFunctions(source: string): string[];
export declare function exposedFunctions(openapi: unknown): Set<string>;
export declare function checkSchemaContract(options: {
  url: string;
  key: string;
  expected: string[];
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean | null; missing: string[]; reason?: string }>;
