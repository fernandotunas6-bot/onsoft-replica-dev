import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

describe("SQL SGA checklist", () => {
  it("print-apply-sql lista os 3 ficheiros canónicos e existem no disco", () => {
    const catalog = JSON.parse(
      readFileSync(resolve("scripts/siga/modules.json"), "utf8"),
    );
    expect(catalog.sqlApply).toEqual([
      "supabase/APPLY_IN_SQL_EDITOR.sql",
      "supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql",
      "supabase/APPLY_SAAS_PLATFORM.sql",
      "supabase/APPLY_DIGITAL_IDENTITY.sql",
      "supabase/APPLY_ALUMNI_MODULE.sql",
    ]);
    for (const file of catalog.sqlApply) {
      expect(existsSync(resolve(file)), file).toBe(true);
    }
  });

  it("DOC sql-sga e script --verify existem", () => {
    expect(existsSync(resolve("painel/docs/guide/sql-sga.md"))).toBe(true);
    expect(existsSync(resolve("supabase/APPLY_MISSING_FROM_VERIFY.sql"))).toBe(true);
    const script = readFileSync(resolve("scripts/siga/print-apply-sql.mjs"), "utf8");
    expect(script).toContain("--verify");
    expect(script).toContain("enrollment_forms");
    expect(script).toContain("platform_admins");
    expect(script).toContain("APPLY_MISSING_FROM_VERIFY");
  });

  it("DOC_PATHS inclui guideSqlSga", () => {
    const urls = readFileSync(resolve("src/lib/ecosystem-urls.ts"), "utf8");
    expect(urls).toContain("guideSqlSga");
    expect(urls).toContain("/guide/sql-sga.html");
  });
});
