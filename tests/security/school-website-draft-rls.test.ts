import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261020213000_school_website_draft_read_guard.sql"),
  "utf8",
).replace(/--[^\n]*/g, "");

describe("school_website — RLS dos rascunhos institucionais", () => {
  it("acrescenta guarda de SELECT RESTRICTIVE em school_settings", () => {
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS school_website_drafts_admin_read_guard ON public\.school_settings/i,
    );
    expect(sql).toMatch(
      /CREATE POLICY school_website_drafts_admin_read_guard\s+ON public\.school_settings\s+AS RESTRICTIVE\s+FOR SELECT\s+TO authenticated/i,
    );
  });

  it("preserva os outros domínios e exige permissão administrativa para o site", () => {
    expect(sql).toMatch(/domain IS DISTINCT FROM 'school_website'/i);
    expect(sql).toMatch(/private\.has_permission\(school_id,\s*'schools\.settings\.create'\)/i);
  });

  it("não abre a leitura a público nem substitui políticas existentes", () => {
    expect(sql).not.toMatch(/FOR SELECT TO anon/i);
    expect(sql).not.toMatch(/AS PERMISSIVE/i);
    expect(sql).not.toMatch(/DROP POLICY IF EXISTS settings_select_member/i);
    expect(sql).not.toMatch(/DROP POLICY IF EXISTS settings_insert_authorized/i);
    expect(sql).not.toMatch(/GRANT SELECT|GRANT ALL|DISABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(
      /UPDATE\s+public\.school_settings|DELETE\s+FROM\s+public\.school_settings/i,
    );
  });
});
