-- As duas ultimas tabelas com `FOR ALL → is_school_member(school_id)`.
--
-- Nenhuma das duas e escrita pelo cliente da sessao. Verificado ocorrencia a
-- ocorrencia:
--
--   finance_payment_plans (10 sitios)
--     · finance/server.ts:925,932,1352,1410,1481,1493 -- `loadSgaAdminClient()`
--     · gateway-webhook-handler.ts:79,89 (`loadPaymentPlan`) e :375,399
--       (`settleGatewayPayment`) recebem `db` por parametro; a cadeia toda vem de
--       `loadSgaAdminClient()` -- em `payflow-settlement.ts:51` e no proprio
--       handler (:559, que passa a `executeFinanceGatewayWebhook` → :472 → :493).
--
--   siga_lesson_plans (5 sitios)
--     · lesson-plans/server.ts:233,330,358,406,450 -- todas `loadSgaAdminClient()`.
--       Nenhum outro ficheiro toca a tabela.
--
-- `service_role` ignora RLS, logo tirar a escrita ao cliente do browser nao
-- alcanca nenhum caminho da aplicacao.
--
-- ---------------------------------------------------------------------------
-- AS DUAS LEITURAS NAO LEVAM O MESMO TRATAMENTO
--
-- `finance_payment_plans` guarda, por aluno, o canal, o numero de prestacoes, a
-- `reference` de pagamento e o estado. Ler isso de toda a escola e ver a situacao
-- financeira de todas as familias. `HARDEN_TENANT_ISOLATION.sql:227` sempre disse
-- que esta tabela e das funcoes financeiras -- e a intencao documentada, e e ela
-- que fica.
--
-- Quando o portal do encarregado precisar destes dados, a regra certa e "o plano
-- do meu educando", nao "qualquer membro da escola". Deixar a porta aberta agora
-- para poupar esse trabalho depois e o que criou todos os outros achados desta
-- serie.
--
-- `siga_lesson_plans` guarda titulo, conteudo e anexo de planos de aula. Nao ha
-- segredo nem dado pessoal: a leitura fica como esta, por pertenca a escola --
-- partilhar planos entre docentes e o comportamento desejado.
--
-- Idempotente. NAO foi aplicada -- e escrita na base, decisao do dono.
-- Depois de aplicar: `npm run siga:db-snapshot`.
-- ---------------------------------------------------------------------------

BEGIN;

-- Planos de pagamento: leitura das funcoes financeiras, escrita so `service_role`.
DROP POLICY IF EXISTS "Manage payment plans in own school" ON public.finance_payment_plans;
DROP POLICY IF EXISTS finance_payment_plans_select_finance ON public.finance_payment_plans;

CREATE POLICY finance_payment_plans_select_finance ON public.finance_payment_plans
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND private.sga_app_role(school_id) IN ('Administrador', 'Tesouraria')
  );

-- Planos de aula: a escrita sai do cliente, a leitura fica.
DROP POLICY IF EXISTS "Manage lesson plans in own school" ON public.siga_lesson_plans;
CREATE POLICY "Manage lesson plans in own school" ON public.siga_lesson_plans
  FOR SELECT TO authenticated
  USING (public.is_school_member(school_id));

-- Nenhuma das duas tinha politica que acompanhasse a concessao a `anon`, logo
-- `anon` ja nao lia nada. Retira-se a camada que sobrava.
REVOKE SELECT ON public.finance_payment_plans FROM anon;
REVOKE SELECT ON public.siga_lesson_plans FROM anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
