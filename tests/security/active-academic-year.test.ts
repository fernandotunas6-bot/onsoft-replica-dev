import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// O SIGA resolve o ano corrente pelo estado `active`. A 2026-09-29 uma escola
// tinha quatro anos activos com a mesma data de início, e cada consulta
// escolhia à sua maneira (umas por `starts_on`, outras sem ordem): turmas,
// pautas, propinas e calendário podiam ficar em anos diferentes.

const ORDEM =
  /\.order\("starts_on", \{ ascending: false \}\)\s*\.order\("created_at", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.limit\(1\)/;

function consultasDoAnoActivo() {
  const files = execSync("git ls-files src", { encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(ts|tsx)$/.test(file));
  const found: Array<{ file: string; chain: string }> = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\.from\("academic_years"\)/g)) {
      const end = source.indexOf(".maybeSingle()", match.index);
      if (end === -1) continue;
      const chain = source.slice(match.index, end);
      if (chain.includes(";")) continue;
      if (chain.includes('"status", "active"') && chain.includes(".limit(1)")) {
        found.push({ file, chain });
      }
    }
  }
  return found;
}

describe("ano lectivo activo", () => {
  const consultas = consultasDoAnoActivo();

  it("encontra as consultas do ano activo", () => {
    expect(consultas.length).toBeGreaterThanOrEqual(10);
  });

  it("todas escolhem da mesma maneira (data de início, depois o mais antigo)", () => {
    expect(consultas.filter(({ chain }) => !ORDEM.test(chain)).map(({ file }) => file)).toEqual([]);
  });

  it("a lista do browser vem pela mesma ordem", () => {
    const source = readFileSync("src/features/school/server.ts", "utf8");
    const start = source.indexOf("export const listAcademicYears ");
    const fn = source.slice(start, source.indexOf("export const ", start + 1));
    expect(fn).toMatch(
      /\.order\("starts_on", \{ ascending: false \}\)\s*(\/\/[^\n]*\n\s*)*\.order\("created_at", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)/,
    );
  });

  it("migração: índice único parcial, sem fechar anos por conta própria", () => {
    const migration = readFileSync(
      "supabase/migrations/20260930090000_one_active_academic_year.sql",
      "utf8",
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_active_per_school\s+ON public\.academic_years \(school_id\)\s+WHERE status = 'active'/,
    );
    expect(migration).not.toMatch(/\bUPDATE\b|\bDELETE\b/i);
    expect(migration).toMatch(/RAISE EXCEPTION/);
  });
});
