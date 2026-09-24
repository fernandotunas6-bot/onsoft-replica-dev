-- Idempotência de pagamentos de gateway.
--
-- O problema, verificado na auditoria da área 6 (docs/auditoria/06-auditoria.md):
-- `settleGatewayPayment` só recusava repetições quando a fatura já estava `paid`. Numa
-- fatura **parcialmente paga**, reenviar a mesma confirmação — que é o que os gateways
-- fazem por omissão quando não recebem o 200 a tempo — emitia um segundo recibo, e o total
-- recebido passava a exceder a fatura sem nada o assinalar.
--
-- O identificador da transação no provedor (`external_id` do Multicaixa/Unitel,
-- `payment_id` do PayFlow) já era recolhido e gravado em
-- `finance_gateway_webhook_events.external_id`, mas nunca era lido. O código passou a
-- lê-lo; esta migração é a metade que o código não pode fazer sozinho.
--
-- Porque é preciso o índice, e não chega a verificação em TypeScript: o evento só é
-- gravado depois de a liquidação terminar, pelo que duas entregas em paralelo lêem ambas
-- um histórico vazio e passam ambas. Só uma restrição na base resolve a corrida — é a
-- mesma razão pela qual `private.register_payment` usa `FOR UPDATE` em vez de verificar
-- em memória.
--
-- Índice **parcial**: os recibos da tesouraria (lançados à mão, sem transação de gateway)
-- ficam com `external_id` nulo e não entram na restrição — em Postgres, nulos nunca
-- colidem, mas o `WHERE` deixa isso explícito e mantém o índice pequeno.
--
-- Aditiva e idempotente. O código funciona com e sem ela: sem a coluna, o insert devolve
-- 42703 e repete-se sem ela, ficando só com a protecção contra reenvio.
--
-- APLICADA à produção (xodgfmxiaunpamctfeea) em 2026-09-24, e o retrato recapturado.
-- A garantia foi verificada na própria base, numa transacção revertida: a segunda
-- inserção com o mesmo `external_id` devolve
--   23505 :: duplicate key value violates unique constraint
--            "finance_receipts_school_external_id_key"
--   DETAIL: Key (school_id, external_id)=(..., TX-PROVA) already exists.
-- Importa que a mensagem nomeie `external_id`: é por ela que
-- `settleGatewayPayment` distingue esta colisão da do número de recibo, e decide entre
-- "já liquidado" e "tentar o número seguinte".

ALTER TABLE public.finance_receipts
  ADD COLUMN IF NOT EXISTS external_id text;

COMMENT ON COLUMN public.finance_receipts.external_id IS
  'Identificador da transação no provedor de pagamento. Nulo nos recibos lançados na tesouraria. Chave de idempotência do webhook.';

-- Um recibo por transação do provedor, por escola.
CREATE UNIQUE INDEX IF NOT EXISTS finance_receipts_school_external_id_key
  ON public.finance_receipts (school_id, external_id)
  WHERE external_id IS NOT NULL;

-- A verificação de reenvio lê `finance_gateway_webhook_events` por
-- (school_id, external_id, ok) a cada liquidação. Sem isto é varrimento sequencial de uma
-- tabela que só cresce.
CREATE INDEX IF NOT EXISTS finance_gateway_webhook_events_external_id_idx
  ON public.finance_gateway_webhook_events (school_id, external_id)
  WHERE external_id IS NOT NULL;
