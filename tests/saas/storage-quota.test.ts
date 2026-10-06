import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertStorageCapacity, resolveMaxStorageGb } from "@/features/saas/tenant-limits";

const GB = 1024 ** 3;

describe("quota de arquivo do plano (auditoria 13, A3)", () => {
  it("usa a quota do tenant e, sem ela, a do plano", () => {
    expect(resolveMaxStorageGb({ max_storage_gb: 20 }, { max_storage_gb: 10 })).toBe(20);
    expect(resolveMaxStorageGb({ max_storage_gb: null }, { max_storage_gb: 10 })).toBe(10);
    expect(resolveMaxStorageGb(null, null)).toBeNull();
    expect(resolveMaxStorageGb({ max_storage_gb: 0 }, null)).toBeNull();
  });

  it("aceita até ao limite e recusa o que o passa", () => {
    expect(() => assertStorageCapacity(9 * GB, GB, 10)).not.toThrow();
    expect(() => assertStorageCapacity(9 * GB, GB + 1, 10)).toThrow(
      /Espaço de arquivo do plano esgotado/,
    );
    expect(() => assertStorageCapacity(500 * GB, GB, null)).not.toThrow();
  });

  it("registerSchoolFile verifica a quota antes de gravar e tira o objecto enviado", () => {
    const source = readFileSync("src/features/arquivos/server.ts", "utf8");
    const start = source.indexOf("export const registerSchoolFile");
    const body = source.slice(start, source.indexOf("export const", start + 1));
    const quota = body.indexOf("assertCanStoreBytesForSchool(");
    expect(quota).toBeGreaterThan(-1);
    expect(quota).toBeLessThan(body.indexOf('from("siga_files").insert'));
    expect(body.slice(quota)).toContain(".remove([data.storagePath])");
  });
});
