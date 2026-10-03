-- `school_integrations.config` guarda credenciais de fornecedores. Em producao,
-- hoje:
--
--   multicaixa_express  →  merchantId,   webhookApiKey   (12 linhas)
--   unitel_money        →  merchantCode, webhookApiKey   (12 linhas)
--
-- A tabela tinha uma unica politica:
--
--   ALL → is_school_member(school_id)
--
-- Qualquer membro activo da escola -- e isso inclui qualquer conta de portal que
-- venha a existir -- **lia a `webhookApiKey`**. E essa chave e exactamente o que
-- `payflowSettlementAuthorized` (`finance/payflow-settlement.ts:21-28`) compara
-- com `timingSafeEqual` para decidir se uma confirmacao de pagamento e genuina, e
-- o que `resolveGatewaySchoolByApiKey` (`gateway-webhook-handler.ts:57`) usa para
-- saber de que escola e o webhook.
--
-- Quem a lesse podia forjar confirmacoes de pagamento: marcar faturas como pagas
-- sem ninguem pagar. E, com `ALL`, podia tambem **escrever** -- trocar o
-- `merchantId` pelo seu.
--
-- Aqui a leitura nao fica de fora do aperto, ao contrario das migracoes
-- anteriores. Nessas, apertar a leitura exigia mapear primeiro o que os portais
-- do aluno e do encarregado precisam de ver. Aqui nao ha duvida nenhuma: e um
-- segredo, e nenhum ecra o mostra.
--
-- ---------------------------------------------------------------------------
-- PORQUE E SEGURO
--
-- Nenhum caminho da aplicacao le ou escreve esta tabela com o cliente da sessao.
-- Verificadas as dezassete ocorrencias, uma a uma:
--
--   · integrations/server.ts (:99,127,160,202,236,264,270,307,395,608) e
--     integrations/zoom.ts (:219,230,265,274) -- todas sob
--     `loadSgaAdminClient()`, ou com `db` tipado como tal.
--   · finance/emiss-multicaixa.ts:23 (`resolveSchoolEmisEntity`) recebe `db` por
--     parametro; os dois chamadores (`finance/server.ts:886,1346`) passam
--     `loadSgaAdminClient()`.
--   · finance/gateway-webhook-handler.ts:57 (`resolveGatewaySchoolByApiKey`)
--     idem, via `executeFinanceGatewayWebhook`, cujo unico chamador (:559) passa
--     `loadSgaAdminClient()`.
--
-- `service_role` ignora RLS. Os ecras de integracoes recebem os dados ja tratados
-- por essas funcoes de servidor -- nunca leem a tabela directamente.
--
-- Fica uma politica de leitura para a administracao, em vez de nenhuma: uma
-- tabela sem politica alguma e indistinguivel de uma tabela esquecida, e quem a
-- revir a seguir merece encontrar a regra escrita. A escrita nao tem politica --
-- so `service_role` -- porque so as funcoes de servidor a fazem.
--
-- Idempotente. NAO foi aplicada -- e escrita na base, decisao do dono.
-- Depois de aplicar: `npm run siga:db-snapshot`.
-- ---------------------------------------------------------------------------

BEGIN;

DROP POLICY IF EXISTS "Manage school integrations in own school" ON public.school_integrations;
DROP POLICY IF EXISTS school_integrations_select_admin ON public.school_integrations;

CREATE POLICY school_integrations_select_admin ON public.school_integrations
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND private.sga_app_role(school_id) = 'Administrador'
  );

-- A concessao a `anon` nunca teve politica que a acompanhasse, logo ja nao lia
-- nada. Retira-se a camada que sobrava sobre uma tabela de segredos.
REVOKE SELECT ON public.school_integrations FROM anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
