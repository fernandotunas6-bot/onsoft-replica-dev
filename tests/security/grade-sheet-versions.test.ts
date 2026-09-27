import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Versões da pauta oficial (migração 20260929130000): a versão homologada ou
// publicada fica guardada antes de a rectificação refazer as linhas.
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260929130000_grade_sheet_versions.sql"),
  "utf8",
);
const build = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION private.build_grade_sheet("));

describe("versões da pauta", () => {
  it("a geração arquiva a versão antes de apagar as linhas e de voltar a rascunho", () => {
    const archive = build.indexOf("perform private.archive_grade_sheet_version(");
    expect(archive).toBeGreaterThan(-1);
    expect(archive).toBeLessThan(build.indexOf("delete from public.grade_sheet_rows"));
    expect(archive).toBeLessThan(build.indexOf("set status = 'draft'"));
  });

  it("só arquiva pautas já homologadas ou publicadas", () => {
    expect(sql).toMatch(/homologated_at is null and sheet\.published_at is null\) then\s+return;/);
  });

  it("a tabela é só do servidor e as versões não se alteram", () => {
    expect(sql).toMatch(/grade_sheet_versions FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(
      /REVOKE ALL ON public\.grade_sheet_versions FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.grade_sheet_versions/);
  });
});
