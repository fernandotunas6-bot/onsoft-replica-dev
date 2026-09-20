import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("dashboard and documents realtime contracts", () => {
  it("reads dashboard announcements from the canonical communications table", () => {
    const server = source("src/features/dashboard/server.ts");

    expect(server).toContain('.from("school_announcements")');
    expect(server).toContain("status.eq.sent");
    expect(server).toContain('.is("deleted_at", null)');
    expect(server).not.toContain('.from("announcements")');
  });

  it("invalidates the dashboard for every announcement change", () => {
    const route = source("src/routes/index.tsx");

    expect(route).toMatch(
      /\{\s*event:\s*"\*",\s*schema:\s*"public",\s*table:\s*"school_announcements"\s*\}/,
    );
  });

  it("subscribes documents to the same table used by its server", () => {
    const route = source("src/routes/documentos.tsx");

    expect(route).toContain('table: "document_requests"');
    expect(route).not.toContain('table: "siga_document_requests"');
  });

  it("keeps the approved SGA SQL aligned with the runtime contract", () => {
    const sql = source("supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql");
    const checklist = source("scripts/siga/print-apply-sql.mjs");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.school_announcements");
    expect(sql).toContain(
      "ALTER PUBLICATION supabase_realtime ADD TABLE public.school_announcements",
    );
    expect(sql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.document_requests");
    expect(checklist).toContain('"school_announcements"');
  });
});
