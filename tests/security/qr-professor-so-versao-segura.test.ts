import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Presença do professor por QR (20261005143409): o cliente só pode chamar
 * `hr_redeem_teacher_qr_secure`, que avalia a confiança antes de gastar o token.
 * As funções internas, se voltassem a ser chamáveis, deixavam marcar presença (e
 * receber a aula) sem estar na escola.
 */

const REPO = resolve(__dirname, "../..");
const MIGRATIONS = resolve(REPO, "supabase/migrations");
const INNER = ["hr_redeem_teacher_qr", "hr_evaluate_teacher_attendance_assurance"];
const FIX = "20261005143409_teacher_qr_inner_functions_not_callable.sql";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("QR do professor: só a versão endurecida", () => {
  it("a migração retira o EXECUTE das funções internas a authenticated e anon", () => {
    const sql = readFileSync(resolve(MIGRATIONS, FIX), "utf8");
    for (const fn of INNER) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`,
        ),
      );
    }
  });

  it("nenhuma migração posterior devolve o EXECUTE a authenticated, anon ou PUBLIC", () => {
    const later = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql") && name > FIX)
      .map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS, name), "utf8") }));
    for (const { name, sql } of later) {
      for (const fn of INNER) {
        const regrant = new RegExp(
          `GRANT[^;]*ON FUNCTION public\\.${fn}\\([^)]*\\)[^;]*TO[^;]*\\b(authenticated|anon|PUBLIC)\\b`,
          "i",
        );
        expect(regrant.test(sql), `${name} volta a abrir ${fn}`).toBe(false);
      }
    }
  });

  it("o código da app não chama as funções internas com o JWT", () => {
    const calls = sourceFiles(resolve(REPO, "src"))
      .filter((file) => !file.endsWith("integrations/supabase/types.ts"))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return INNER.filter((fn) => new RegExp(`rpc\\(\\s*"${fn}"`).test(source)).map(
          (fn) => `${file}: ${fn}`,
        );
      });
    expect(calls).toEqual([]);
  });

  it("a app usa a versão endurecida", () => {
    const source = readFileSync(resolve(REPO, "src/features/hr/teacher-lessons.ts"), "utf8");
    expect(source).toMatch(/rpc\(\s*"hr_redeem_teacher_qr_secure"/);
  });
});
