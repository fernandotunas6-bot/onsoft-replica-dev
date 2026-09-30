import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Desde 20260929240000 o papel `anon` (sem sessão) só tem as permissões que as
 * políticas públicas usam. Uma migração nova que dê mais a `anon` tem de
 * entrar nesta lista de propósito — é aqui que a revisão a vê.
 */
const ALLOWED_ANON_GRANTS = new Set([
  "SELECT public.enrollment_forms",
  "INSERT public.enrollment_applications",
  "SELECT public.reserved_subdomains",
  "SELECT public.school_branding",
]);

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const REVOKE_MIGRATION = "20260929240000_revoke_default_anon_table_grants.sql";

describe("permissões do papel anon", () => {
  it("a migração retira tudo e repõe só as quatro permissões públicas", () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, REVOKE_MIGRATION), "utf8");
    expect(sql).toMatch(/REVOKE ALL ON public\.%I FROM anon/);
    const grants = [...sql.matchAll(/GRANT (\w+) ON (public\.\w+) TO anon;/g)].map(
      ([, priv, table]) => `${priv} ${table}`,
    );
    expect(new Set(grants)).toEqual(ALLOWED_ANON_GRANTS);
  });

  it("nenhuma migração posterior dá a anon permissões fora da lista", () => {
    const later = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql") && file > REVOKE_MIGRATION)
      .sort();
    for (const file of later) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(/--.*$/gm, "");
      for (const [, privs, table] of sql.matchAll(
        /GRANT\s+([\w\s,]+?)\s+ON\s+(?:TABLE\s+)?(public\.\w+)\s+TO\s+[^;]*\banon\b/gi,
      )) {
        for (const priv of privs.split(",").map((p) => p.trim().toUpperCase())) {
          expect(ALLOWED_ANON_GRANTS.has(`${priv} ${table}`), `${file}: ${priv} ${table}`).toBe(
            true,
          );
        }
      }
    }
  });
});
