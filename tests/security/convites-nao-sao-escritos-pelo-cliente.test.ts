import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Um convite é uma concessão de papel. `school_invitations.role_code` é lido na aceitação
 * (`access/server.ts:909-926`: procura `roles.code = role_code` e insere em `member_roles`),
 * pelo que quem conseguir escrever nesta tabela consegue dar-se o papel que quiser.
 *
 * Com a política `ALL → is_school_member(school_id)` que a produção tinha, a cadeia
 * fechava-se: um membro cujo único papel é Aluno inseria um convite com o **seu próprio**
 * email — o que faz a verificação anti-sequestro passar — `role_code = 'admin'` e um
 * `token_hash` à sua escolha, e aceitava-o a seguir. Verificado contra a produção numa
 * transacção revertida: a inserção passava.
 *
 * Fechado por 20260924170000 (ALL → SELECT) e apertado por 20260924210000 (leitura só com
 * `rbac.memberships.read`, e GRANT de escrita retirado).
 *
 * Este teste mede o **retrato da produção**, não o SQL do repositório: é o SQL que se
 * escreve, mas é a base que decide.
 */

type Politica = {
  cmd: string;
  papeis: string;
  politica: string;
  tabela: string;
  usando: string | null;
  verificando: string | null;
};

type Retrato = {
  politicas: Politica[];
  tabelas: Array<{ tabela: string; politicas: number }>;
};

const retrato: Retrato = JSON.parse(
  readFileSync(resolve(__dirname, "../../supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
);

const daTabela = retrato.politicas.filter((p) => p.tabela === "school_invitations");

describe("convites de escola", () => {
  it("nenhuma política deixa o cliente autenticado escrever", () => {
    const deEscrita = daTabela.filter((p) =>
      ["ALL", "INSERT", "UPDATE", "DELETE"].includes(p.cmd.toUpperCase()),
    );

    expect(
      deEscrita.map((p) => `${p.cmd} ${p.politica}`),
      "escrever aqui é conceder um papel: a escrita só pode vir de service_role",
    ).toEqual([]);
  });

  it("a leitura não se abre a qualquer membro da escola", () => {
    const leitura = daTabela.filter((p) => p.cmd.toUpperCase() === "SELECT");

    expect(leitura.length, "sem política de leitura ninguém vê os convites").toBeGreaterThan(0);

    for (const politica of leitura) {
      expect(
        politica.usando ?? "",
        `"${politica.politica}" volta a expor emails e papéis por conceder a toda a escola`,
      ).not.toMatch(/^\s*is_school_member\(school_id\)\s*$/);
    }
  });

  it("a tabela continua a ter RLS e pelo menos uma política", () => {
    const tabela = retrato.tabelas.find((t) => t.tabela === "school_invitations");

    expect(tabela, "school_invitations desapareceu do retrato").toBeDefined();
    expect(tabela!.politicas).toBeGreaterThan(0);
  });
});
