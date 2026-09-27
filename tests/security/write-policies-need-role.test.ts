/**
 * Nenhuma política de escrita pode bastar-se com "é membro da escola".
 *
 * `school_id = current_school_id()` e `is_school_member(...)` são verdade para
 * alunos e encarregados. Uma política INSERT/UPDATE/DELETE/ALL só com isso
 * deixa um aluno escrever — foi o caso de `school_branding`, `mailboxes`,
 * `school_email_routes`, `finance_invoice_events` e `student_status_events`
 * (corrigido em 20260929150000). Toda a escrita pelo cliente tem de verificar
 * também o papel, a permissão ou o dono da linha.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const retrato = JSON.parse(
  readFileSync(resolve(__dirname, "../../supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as {
  politicas: {
    tabela: string;
    politica: string;
    cmd: string;
    papeis: string;
    usando: string;
    verificando: string;
  }[];
};

/** Verificações que distinguem quem escreve: papel, permissão ou dono. */
const VERIFICA_QUEM =
  /office|admin|finance|role|permission|auth\.uid|teacher|owner|platform|sender|user_id|created_by|can_manage/i;

/**
 * Excepções deliberadas. O formulário público de candidatura aceita pedidos
 * anónimos, só com estado `pending` e só em formulários abertos.
 */
const EXCEPCOES = new Set(["enrollment_applications:Public insert open enrollment applications"]);

describe("políticas de escrita", () => {
  it("exigem mais do que ser membro da escola", () => {
    const fracas = retrato.politicas
      .filter((p) => p.cmd !== "SELECT" && /authenticated|public|anon/.test(p.papeis))
      .filter((p) => !VERIFICA_QUEM.test(`${p.usando} ${p.verificando}`))
      .filter((p) => !EXCEPCOES.has(`${p.tabela}:${p.politica}`))
      .map((p) => `${p.tabela}: ${p.politica} (${p.cmd})`);
    expect(fracas, `Escrita aberta a qualquer membro: ${fracas.join("; ")}`).toEqual([]);
  });

  it("marca e rotas de e-mail já não aceitam escrita do cliente", () => {
    const escrita = retrato.politicas.filter(
      (p) =>
        ["school_branding", "mailboxes", "school_email_routes"].includes(p.tabela) &&
        p.cmd !== "SELECT",
    );
    expect(escrita).toEqual([]);
  });
});
