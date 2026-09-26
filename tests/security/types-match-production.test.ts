import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `src/integrations/supabase/types.ts` tem de descrever a base de PRODUÇÃO do
 * SIGA (retrato em supabase/PRODUCTION_SNAPSHOT.json). Em 2026-09-26 o Lovable
 * regenerou-o a partir de outra base: 90 tabelas da produção desapareceram e
 * surgiram tabelas que não existem no SIGA. O código deixou de compilar.
 * Se este teste falhar, reponha o types.ts anterior (git) em vez de o aceitar.
 */
describe("types.ts descreve a base de produção", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const snapshot = JSON.parse(read("supabase/PRODUCTION_SNAPSHOT.json")) as {
    tabelas: Array<{ tabela: string }>;
  };
  const types = read("src/integrations/supabase/types.ts");
  const typed = new Set([...types.matchAll(/\n {6}(\w+): \{\n {8}Row: \{/g)].map((m) => m[1]));

  it("todas as tabelas da produção existem nos tipos", () => {
    const missing = snapshot.tabelas.map((t) => t.tabela).filter((name) => !typed.has(name));
    expect(missing).toEqual([]);
  });
});
