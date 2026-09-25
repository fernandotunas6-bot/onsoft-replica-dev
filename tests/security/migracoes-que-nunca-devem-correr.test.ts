import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `supabase db push` aplica tudo o que está em `supabase/migrations/` e não consta de
 * `supabase_migrations.schema_migrations`.
 *
 * Na auditoria da área 10 mediu-se o desfasamento contra a base: 110 versões registadas,
 * 145 ficheiros na pasta, **126 por registar** — e os 27 de Agosto, que descrevem o modelo
 * de dados antigo do Lovable e que `supabase/DO_NOT_APPLY_TO_SGA.txt` diz que nunca devem
 * ser aplicados, estavam **todos** entre eles.
 *
 * Um `db push` — comando corrente, que qualquer pessoa ou agente corre de boa-fé —
 * criaria um modelo paralelo vazio ao lado do que está em uso. O que o impedia era um
 * ficheiro de texto que nenhuma ferramenta lê.
 *
 * Foram movidos para `supabase/migrations-lovable-nao-aplicar/`. Este teste existe para
 * que não voltem: um aviso que um teste verifica deixa de depender de alguém o ler.
 */

const REPO = resolve(__dirname, "../..");
const MIGRACOES = resolve(REPO, "supabase/migrations");
const QUARENTENA = resolve(REPO, "supabase/migrations-lovable-nao-aplicar");

/** As do modelo Lovable substituído. Tudo o que comece por `202608` é dessa geração. */
const PREFIXO_LOVABLE = /^202608\d{8}_/;

describe("migrações que nunca devem correr", () => {
  it("nenhuma migração do modelo antigo está no caminho do `db push`", () => {
    const intrusas = readdirSync(MIGRACOES).filter((f) => PREFIXO_LOVABLE.test(f));

    expect(
      intrusas,
      "estas descrevem o modelo Lovable substituído. Em `supabase/migrations/` um " +
        "`supabase db push` aplica-as e cria um modelo paralelo vazio — ver " +
        "supabase/DO_NOT_APPLY_TO_SGA.txt e migrations-lovable-nao-aplicar/README.md",
    ).toEqual([]);
  });

  it("a quarentena continua a existir e não foi esvaziada", () => {
    expect(existsSync(QUARENTENA), "a pasta de quarentena desapareceu").toBe(true);

    const ficheiros = readdirSync(QUARENTENA).filter((f) => f.endsWith(".sql"));
    expect(
      ficheiros.length,
      "apagá-las perde o historial do modelo antigo; a quarentena é para as guardar, " +
        "não para as esconder",
    ).toBeGreaterThanOrEqual(27);
  });

  it("a quarentena explica-se a si própria", () => {
    expect(
      existsSync(resolve(QUARENTENA, "README.md")),
      "sem o README, daqui a seis meses alguém move-as de volta por não saber porquê",
    ).toBe(true);
  });
});
