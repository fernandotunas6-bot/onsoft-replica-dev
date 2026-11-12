// Ensaio local (PGlite) de 20261024110000_finance_cash_sessions.sql. Sem produção.
//   SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/cash-sessions.mjs
//
// Os movimentos entram por INSERT/UPDATE directos: são os gatilhos que os ligam à
// sessão, por isso register_payment, o webhook e a despesa passam pelo mesmo sítio.
// A migração cria tabelas e funções, por isso corre uma vez.
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
// Colunas de finance_receipts e siga_cash_expenses como no retrato da produção.
// Papel por utilizador numa tabela do ensaio; 2FA e permissão simulados.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION private.is_aal2() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.has_permission(s uuid, p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE TABLE private.ensaio_roles(school_id uuid, user_id uuid, role text);
CREATE FUNCTION private.sga_app_role(s uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT role FROM private.ensaio_roles WHERE school_id = s AND user_id = auth.uid() $$;
CREATE TABLE public.schools(id uuid PRIMARY KEY);
CREATE TABLE public.finance_receipts("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"invoice_id" uuid NOT NULL,"receipt_number" text NOT NULL,"amount" numeric NOT NULL,"paid_on" date NOT NULL,"payment_method" text NOT NULL,"received_by" uuid NOT NULL,"status" text DEFAULT 'issued'::text NOT NULL,"reversed_at" timestamp with time zone,"reversed_by" uuid,"reversal_reason" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"external_id" text);
CREATE TABLE public.siga_cash_expenses("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"school_id" uuid NOT NULL,"document_number" text NOT NULL,"description" text NOT NULL,"category" text NOT NULL,"amount" numeric NOT NULL,"method" text DEFAULT 'cash',"reference" text,"occurred_at" date DEFAULT current_date,"status" text DEFAULT 'posted',"reversal_reason" text,"reversed_at" timestamptz,"reversed_by" uuid,"created_at" timestamptz DEFAULT now(),"created_by" uuid,"updated_at" timestamptz,"updated_by" uuid);
`);

const ESCOLA_A = "00000000-0000-4000-8000-00000000000a";
const ESCOLA_B = "00000000-0000-4000-8000-00000000000b";
const TES = "00000000-0000-4000-8000-0000000000a1";
const TES2 = "00000000-0000-4000-8000-0000000000a2";
const ADM = "00000000-0000-4000-8000-0000000000a3";
const ADM2 = "00000000-0000-4000-8000-0000000000a4";
const TES_B = "00000000-0000-4000-8000-0000000000b1";
await db.exec(`
INSERT INTO public.schools VALUES ('${ESCOLA_A}'), ('${ESCOLA_B}');
INSERT INTO private.ensaio_roles VALUES
  ('${ESCOLA_A}', '${TES}', 'Tesouraria'), ('${ESCOLA_A}', '${TES2}', 'Tesouraria'),
  ('${ESCOLA_A}', '${ADM}', 'Administrador'), ('${ESCOLA_A}', '${ADM2}', 'Administrador'),
  ('${ESCOLA_B}', '${TES_B}', 'Tesouraria');
`);

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
// Por omissão, a migração final. `cash-sessions-upgrade.mjs` passa outra lista: a versão
// que está na produção e a actualização, para os mesmos casos valerem nos dois caminhos.
const MIGRACOES = globalThis.SIGA_CASH_SESSIONS_MIGRATIONS ?? [
  "../../supabase/migrations/20261024110000_finance_cash_sessions.sql",
];
for (const path of MIGRACOES) await db.exec(read(path));

const como = (uid) => db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)`);
const um = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const recusa = async (promessa, mensagem) => {
  await assert.rejects(promessa, (erro) => {
    assert.match(String(erro.message), mensagem);
    return true;
  });
};
const recibo = async (escola, valor, metodo = "cash", externo = null) =>
  um(
    `INSERT INTO public.finance_receipts (school_id, invoice_id, receipt_number, amount, paid_on, payment_method, received_by, external_id)
     VALUES ($1, gen_random_uuid(), 'REC-' || gen_random_uuid(), $2, current_date, $3, $4, $5)
     RETURNING id, cash_session_id`,
    [escola, valor, metodo, TES, externo],
  );
const despesa = async (escola, valor, estado = "posted", metodo = "cash") =>
  um(
    `INSERT INTO public.siga_cash_expenses (school_id, document_number, description, category, amount, method, status, created_by)
     VALUES ($1, 'DSP-' || gen_random_uuid(), 'Material', 'Material', $2, $3, $4, $5)
     RETURNING id, cash_session_id`,
    [escola, valor, metodo, estado, TES],
  );
const estornarRecibo = (id) =>
  um(
    "UPDATE public.finance_receipts SET status = 'reversed' WHERE id = $1 RETURNING reversed_in_session_id",
    [id],
  );
const mudarDespesa = (id, estado) =>
  um(
    "UPDATE public.siga_cash_expenses SET status = $2 WHERE id = $1 RETURNING cash_session_id, reversed_in_session_id",
    [id, estado],
  );
const abrir = async (escola, fundo) =>
  (await um("SELECT public.open_cash_session($1, $2) AS r", [escola, fundo])).r.sessionId;
const fechar = async (escola, sessao, contado, motivo = null) =>
  (
    await um("SELECT public.close_cash_session($1, $2, $3, $4) AS r", [
      escola,
      sessao,
      contado,
      motivo,
    ])
  ).r;
const aprovar = (escola, sessao) =>
  um("SELECT public.approve_cash_difference($1, $2) AS r", [escola, sessao]);
const esperado = async (sessao) =>
  Number((await um("SELECT public.cash_session_expected($1) AS v", [sessao])).v);

await como(TES);

// ── Antes de enforce_from: numerário sem caixa aberto entra, fora de sessão ──
{
  const r = await recibo(ESCOLA_A, 700);
  assert.equal(r.cash_session_id, null);
  const posto = await um(
    "SELECT enforce_from - current_date AS dias FROM public.finance_cash_points WHERE school_id = $1",
    [ESCOLA_A],
  );
  assert.equal(posto.dias, 30, "o prazo de 30 dias começa no primeiro uso");
}

// ── Sessão 1: entradas, saídas e o que fica de fora ──────────────────────────
const s1 = await abrir(ESCOLA_A, 1000);
await recusa(abrir(ESCOLA_A, 500), /já está aberto/);
await recusa(abrir(ESCOLA_A, -1), /fundo de maneio/);
{
  const dinheiro = await recibo(ESCOLA_A, 5000);
  assert.equal(dinheiro.cash_session_id, s1);
  assert.equal((await recibo(ESCOLA_A, 9000, "card")).cash_session_id, null, "cartão não é gaveta");
  assert.equal(
    (await recibo(ESCOLA_A, 9000, "cash", "appypay:123")).cash_session_id,
    null,
    "recibo do gateway não é gaveta, mesmo em numerário",
  );
  assert.equal((await despesa(ESCOLA_A, 1500)).cash_session_id, s1);
  assert.equal((await despesa(ESCOLA_A, 800, "posted", "bank_transfer")).cash_session_id, null);
  assert.equal(await esperado(s1), 1000 + 5000 - 1500);

  // Despesa por aprovar (#295): só sai da gaveta quando aprovada.
  const porAprovar = await despesa(ESCOLA_A, 2000, "pending_approval");
  assert.equal(porAprovar.cash_session_id, null);
  assert.equal(await esperado(s1), 4500);
  assert.equal((await mudarDespesa(porAprovar.id, "posted")).cash_session_id, s1);
  assert.equal(await esperado(s1), 2500);
  const anulada = await despesa(ESCOLA_A, 3000, "pending_approval");
  const depois = await mudarDespesa(anulada.id, "reversed");
  assert.deepEqual(depois, { cash_session_id: null, reversed_in_session_id: null });
  assert.equal(await esperado(s1), 2500, "anulada antes de aprovar, nunca saiu da gaveta");

  // Estorno na mesma sessão: anula-se.
  const devolvido = await recibo(ESCOLA_A, 400);
  assert.equal(await esperado(s1), 2900);
  assert.equal((await estornarRecibo(devolvido.id)).reversed_in_session_id, s1);
  assert.equal(await esperado(s1), 2500);
  globalThis.reciboDaSessao1 = dinheiro.id;
}

// ── Isolamento: outra escola não vê nem fecha a sessão de A ─────────────────
await como(TES_B);
await recusa(fechar(ESCOLA_B, s1, 2500), /já não está aberto/);
const sB = await abrir(ESCOLA_B, 0);
assert.notEqual(sB, s1);
assert.equal((await recibo(ESCOLA_B, 100)).cash_session_id, sB);
assert.equal(await esperado(s1), 2500, "o recibo de B não entra na sessão de A");
await como(TES);
await recusa(fechar(ESCOLA_A, sB, 100), /já não está aberto/);

// ── Fecho: só quem abriu ou um Administrador; diferença zero não pede motivo ─
await como(TES2);
await recusa(fechar(ESCOLA_A, s1, 2500), /Só quem abriu o caixa/);
await como(TES);
assert.deepEqual(await fechar(ESCOLA_A, s1, 2500), {
  sessionId: s1,
  expectedCash: 2500,
  difference: 0,
});
await recusa(fechar(ESCOLA_A, s1, 2500), /já não está aberto/);
await como(ADM);
await recusa(aprovar(ESCOLA_A, s1), /Não há diferença por aprovar/);

// ── Sessão 2: estorno de um recibo da sessão 1 sai na sessão do estorno ─────
await como(TES);
const s2 = await abrir(ESCOLA_A, 2500);
assert.equal((await estornarRecibo(globalThis.reciboDaSessao1)).reversed_in_session_id, s2);
assert.equal(await esperado(s2), -2500);
assert.equal(
  Number(
    (await um("SELECT expected_cash FROM public.finance_cash_sessions WHERE id = $1", [s1]))
      .expected_cash,
  ),
  2500,
  "o fecho já contado não muda",
);
await recusa(fechar(ESCOLA_A, s2, 0), /motivo da diferença/);
await recusa(fechar(ESCOLA_A, s2, 0, "  "), /motivo da diferença/);
// Um Administrador fecha o que outro abriu, e não aprova o que fechou.
await como(ADM);
assert.equal((await fechar(ESCOLA_A, s2, 0, "Devolução em numerário")).difference, 2500);
await recusa(aprovar(ESCOLA_A, s2), /Quem fechou o caixa não pode aprovar/);
await como(TES2);
await recusa(aprovar(ESCOLA_A, s2), /Só um Administrador/);
await como(ADM2);
await aprovar(ESCOLA_A, s2);
await recusa(aprovar(ESCOLA_A, s2), /Não há diferença por aprovar/);
await como(TES_B);
await recusa(aprovar(ESCOLA_B, s2), /Só um Administrador|Não há diferença/);

// ── Depósito da gaveta no banco ─────────────────────────────────────────────
await como(TES);
const depositar = async (escola, valor, talao) =>
  (await um("SELECT public.record_cash_deposit($1, $2, $3) AS r", [escola, valor, talao])).r;
const anularDeposito = (escola, id, motivo) =>
  um("SELECT public.reverse_cash_deposit($1, $2, $3) AS r", [escola, id, motivo]);
const confirmarDeposito = (escola, id) =>
  um("SELECT public.confirm_cash_deposit($1, $2) AS r", [escola, id]);
await recusa(depositar(ESCOLA_A, 100, "TAL-0001"), /Abra o caixa antes de depositar/);
const s3 = await abrir(ESCOLA_A, 1000);
await recibo(ESCOLA_A, 9000);
assert.equal(await esperado(s3), 10000);
await recusa(depositar(ESCOLA_A, 10000.01, "TAL-0001"), /maior do que o numerário na gaveta/);
await recusa(depositar(ESCOLA_A, 100, "  "), /talão de depósito/);
await recusa(depositar(ESCOLA_A, 0, "TAL-0001"), /valor depositado/);
const dep = await depositar(ESCOLA_A, 8000, "TAL-0001");
assert.equal(dep.sessionId, s3);
assert.equal(await esperado(s3), 2000, "o depósito sai da gaveta");
await recusa(depositar(ESCOLA_A, 500, " TAL-0001 "), /já está registado/);
// Engano: anula-se com o caixa aberto, e o numerário volta ao esperado.
const engano = await depositar(ESCOLA_A, 500, "TAL-0002");
await recusa(anularDeposito(ESCOLA_A, engano.depositId, "x"), /motivo da anulação/);
await anularDeposito(ESCOLA_A, engano.depositId, "Talão errado");
assert.equal(await esperado(s3), 2000);
await recusa(anularDeposito(ESCOLA_A, engano.depositId, "Outra vez"), /já anulado/);
// Outra escola não toca; quem depositou não confirma; outro membro confirma.
await como(TES_B);
await recusa(confirmarDeposito(ESCOLA_B, dep.depositId), /Não há depósito por confirmar/);
await recusa(anularDeposito(ESCOLA_B, dep.depositId, "Não é meu"), /não encontrado/);
await como(TES);
await recusa(
  confirmarDeposito(ESCOLA_A, dep.depositId),
  /Quem registou o depósito não o pode confirmar/,
);
await como(TES2);
await confirmarDeposito(ESCOLA_A, dep.depositId);
await recusa(confirmarDeposito(ESCOLA_A, dep.depositId), /Não há depósito por confirmar/);
await recusa(
  anularDeposito(ESCOLA_A, dep.depositId, "Tarde demais"),
  /já anulado|confirmado no extracto/,
);
// Fechado o caixa, um depósito por confirmar já não se anula.
await como(TES);
const tarde = await depositar(ESCOLA_A, 1000, "TAL-0003");
assert.equal((await fechar(ESCOLA_A, s3, 1000)).difference, 0, "fundo + 9000 − 8000 − 1000");
await recusa(anularDeposito(ESCOLA_A, tarde.depositId, "Depois do fecho"), /já fechou/);
const dp = await um(`SELECT
  has_table_privilege('authenticated', 'public.finance_cash_deposits', 'SELECT') AS auth_le,
  has_table_privilege('anon', 'public.finance_cash_deposits', 'INSERT') AS anon_escreve,
  has_function_privilege('anon', 'public.record_cash_deposit(uuid,numeric,text)', 'EXECUTE') AS anon_deposita,
  has_function_privilege('authenticated', 'public.record_cash_deposit(uuid,numeric,text)', 'EXECUTE') AS auth_deposita`);
assert.deepEqual(dp, {
  auth_le: false,
  anon_escreve: false,
  anon_deposita: false,
  auth_deposita: true,
});

// ── Depois de enforce_from: numerário sem caixa aberto é recusado ───────────
await como(TES);
await db.exec(
  `UPDATE public.finance_cash_points SET enforce_from = current_date WHERE school_id = '${ESCOLA_A}'`,
);
await recusa(recibo(ESCOLA_A, 100), /Abra o caixa antes de registar numerário/);
await recusa(despesa(ESCOLA_A, 100), /Abra o caixa antes de registar numerário/);
assert.equal(
  (await recibo(ESCOLA_A, 100, "card")).cash_session_id,
  null,
  "cartão continua a entrar",
);
assert.equal(
  (await recibo(ESCOLA_A, 100, "cash", "appypay:456")).cash_session_id,
  null,
  "e o gateway",
);
assert.equal(
  (await despesa(ESCOLA_A, 60000, "pending_approval")).cash_session_id,
  null,
  "por aprovar também",
);

// ── Sem sessão e permissões ─────────────────────────────────────────────────
await db.exec("SELECT set_config('request.jwt.claim.sub', '', false)");
await recusa(abrir(ESCOLA_A, 0), /Sem autorização para abrir/);
const p = await um(`SELECT
  has_table_privilege('anon', 'public.finance_cash_sessions', 'SELECT') AS anon_le,
  has_table_privilege('authenticated', 'public.finance_cash_sessions', 'SELECT') AS auth_le,
  has_table_privilege('authenticated', 'public.finance_cash_points', 'INSERT') AS auth_escreve,
  has_table_privilege('service_role', 'public.finance_cash_sessions', 'SELECT') AS servico_le,
  has_function_privilege('anon', 'public.open_cash_session(uuid,numeric)', 'EXECUTE') AS anon_abre,
  has_function_privilege('authenticated', 'public.open_cash_session(uuid,numeric)', 'EXECUTE') AS auth_abre,
  has_function_privilege('authenticated', 'public.cash_session_expected(uuid)', 'EXECUTE') AS auth_esperado,
  has_function_privilege('authenticated', 'private.cash_point_for(uuid)', 'EXECUTE') AS auth_posto,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_cash_sessions'::regclass) AS rls`);
assert.deepEqual(p, {
  anon_le: false,
  auth_le: false,
  auth_escreve: false,
  servico_le: true,
  anon_abre: false,
  auth_abre: true,
  auth_esperado: false,
  auth_posto: false,
  rls: true,
});

console.log(
  "cash-sessions: abertura, gaveta, despesas por aprovar, estornos, fecho, aprovação, prazo e isolamento — ok",
);
