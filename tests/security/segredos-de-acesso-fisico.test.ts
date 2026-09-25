import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `siga_turnstile_devices.api_key` **é** a autenticação do leitor físico:
 * `catracas/gate-pass-validation.ts:64` identifica o dispositivo por
 * `.eq("api_key", apiKey)`, e é só isso que separa uma catraca legítima de um pedido HTTP
 * qualquer.
 *
 * `siga_access_cards.qr_secret` e `rfid_tag` **são** o passe: `:85` aceita um token que
 * case com `card_number`, `barcode`, `qr_secret` ou `rfid_tag`. Saber qualquer um destes
 * valores de outra pessoa é entrar como ela.
 *
 * Com a política `ALL → is_school_member` que as duas tinham, um aluno lia o segredo de
 * qualquer colega. Fechadas por 20260924230000 — e aqui **sem** política de leitura, ao
 * contrário das outras tabelas: uma política de linha não esconde uma coluna, e qualquer
 * SELECT que deixasse listar cartões entregaria o `qr_secret` junto.
 *
 * Se um dia um ecrã precisar de listar cartões, o caminho é uma vista sem as colunas de
 * segredo — não alargar a política destas tabelas. É isso que este teste protege.
 */

type Retrato = {
  politicas: Array<{ cmd: string; politica: string; tabela: string; usando: string | null }>;
  tabelas: Array<{ tabela: string; rls: boolean; anon_select: boolean; auth_select: boolean }>;
};

const retrato: Retrato = JSON.parse(
  readFileSync(resolve(__dirname, "../../supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
);

const COFRES = ["siga_access_cards", "siga_turnstile_devices"];

describe("segredos de acesso físico", () => {
  it.each(COFRES)("%s não é alcançável pelo cliente do utilizador", (nome) => {
    const politicas = retrato.politicas.filter((p) => p.tabela === nome);

    expect(
      politicas.map((p) => `${p.cmd} ${p.politica}`),
      "toda a aplicação lê estas tabelas por service_role; uma política aqui só pode " +
        "servir para entregar o segredo a quem não precisa dele",
    ).toEqual([]);
  });

  it.each(COFRES)("%s mantém RLS activa", (nome) => {
    const tabela = retrato.tabelas.find((t) => t.tabela === nome);

    expect(tabela, `${nome} desapareceu do retrato`).toBeDefined();
    expect(tabela!.rls, "sem RLS, a ausência de políticas deixa de negar seja o que for").toBe(
      true,
    );
  });

  it.each(COFRES)("%s não é legível por anon nem por authenticated", (nome) => {
    const tabela = retrato.tabelas.find((t) => t.tabela === nome)!;

    expect(tabela.anon_select, "anon não pode ler credenciais de acesso físico").toBe(false);
    expect(tabela.auth_select, "nem o cliente autenticado: os segredos ficam no servidor").toBe(
      false,
    );
  });
});
