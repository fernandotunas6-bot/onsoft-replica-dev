import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Cada ficheiro de `supabase/migrations` tem uma versão (o prefixo numérico) que o
 * registo da produção (`supabase_migrations.schema_migrations`) usa como chave. Dois
 * ficheiros com a mesma versão fazem as ferramentas darem um por aplicado quando foi
 * o outro que correu: a 2026-10-05, `20261004140000_late_fee_one_rule` (na main) e
 * `20261004140000_student_special_statuses` (na produção) partilhavam a versão, e a
 * multa parecia aplicada sem a função `private.late_fee_due` existir. A da multa
 * passou a `20261004135000`.
 *
 * As cinco abaixo são anteriores e foram aplicadas por pacotes no SQL Editor, não
 * por versão (não estão no registo com estes números). Ficam como excepção conhecida;
 * uma colisão nova falha aqui.
 */
const COLISOES_ANTIGAS = new Set([
  "20260924160000",
  "20260924180000",
  "20260925090000",
  "20260929230000",
  "20260930090000",
]);

describe("versões das migrações", () => {
  it("nenhuma versão nova é usada por dois ficheiros", () => {
    const porVersao = new Map<string, string[]>();
    for (const name of readdirSync("supabase/migrations")) {
      const version = /^(\d{14})_/.exec(name)?.[1];
      if (!version) continue;
      porVersao.set(version, [...(porVersao.get(version) ?? []), name]);
    }
    const colisoes = [...porVersao.entries()]
      .filter(([version, files]) => files.length > 1 && !COLISOES_ANTIGAS.has(version))
      .map(([, files]) => files.join(" + "));
    expect(colisoes).toEqual([]);
  });

  it("as excepções antigas continuam a ser colisões reais (senão saem da lista)", () => {
    const files = readdirSync("supabase/migrations");
    for (const version of COLISOES_ANTIGAS) {
      expect(files.filter((name) => name.startsWith(`${version}_`)).length, version).toBe(2);
    }
  });
});
