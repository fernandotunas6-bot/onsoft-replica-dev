# Auditoria SIGA Plus — 6. Gestão financeira

**Data:** 2026-09-24 · **Âmbito:** apenas a área 6 · **Código não alterado.**

Evidência: `supabase/PRODUCTION_SNAPSHOT.json` recapturado hoje e consultas em
leitura à produção ligada. Código: `src/features/finance/` (server, webhooks,
PayFlow), RPCs `private.*` capturadas em
`supabase/migrations/20260908210000_capture_all_db_functions.sql`.

---

## O desenho de base está certo: o dinheiro escreve-se por RPC, não por RLS

`fee_plans`, `fee_items`, `finance_contracts`, `finance_invoices`,
`finance_receipts` e `siga_cash_expenses` têm RLS activo e **apenas políticas de
SELECT**. Sem política de escrita, `INSERT`/`UPDATE`/`DELETE` são negados ao papel
`authenticated`: a escrita só entra por funções `SECURITY DEFINER`. É uma decisão
correcta e rara — falha fechada por omissão.

As quatro RPCs centrais são de boa qualidade. `private.register_payment`:

```
if auth.uid() is null or not is_aal2()
   or not has_permission(school, 'finance.payments.create') → 42501
select * from finance_invoices where status in ('open','partially_paid') FOR UPDATE
select sum(amount) from finance_receipts where status='issued'   -- sob o bloqueio
if already_paid + amount > invoice.amount → recusa
receipt_number := private.next_document_number(school, 'receipt')
```

Tranca a fatura, recalcula o pago sob o bloqueio, recusa o excesso e tira o
número da sequência oficial. `private.reverse_receipt` é igualmente rigorosa:
`is_aal2()`, permissão `finance.payments.reverse`, motivo obrigatório de pelo
menos 5 caracteres, `FOR UPDATE` no recibo **e** na fatura, e grava
`reversed_at`/`reversed_by`/`reversal_reason`. (Contraste com a área 5, onde
`reopen_gradebook` exige um motivo e o deita fora.)

**O problema não é o desenho. É que o caminho do gateway não passa por ele.**

## 6.4 e 6.5 Gateways, webhooks e idempotência

`applyPayflowSettlement` autentica bem o webhook — chave Bearer de pelo menos 24
caracteres comparada com `timingSafeEqual`. Depois chama `settleGatewayPayment`
com o **cliente de serviço** (`loadSgaAdminClient`).

**Achado (P0): a RPC segura nunca corre no caminho do gateway.** Com o cliente de
serviço não há sessão, logo `auth.uid()` é nulo e `register_payment` levanta
`42501`. O handler apanha esse erro e cai num caminho alternativo
(`gateway-webhook-handler.ts:146-243`) que reimplementa a liquidação sem nenhuma
das protecções:

| | `register_payment` | Caminho alternativo |
|---|---|---|
| Bloqueio da fatura | `FOR UPDATE` | nenhum |
| Tecto de pagamento | recusa acima do saldo | **não verifica** |
| Número do recibo | `next_document_number` | contagem em JS, com retentativa |
| Autor do recibo | `auth.uid()` | ver achado abaixo |

O `alreadyPaid` é lido com um `select` simples e usado só para escolher a
etiqueta de estado (`paid` ou `partially_paid`) — nunca para recusar. Duas
entregas simultâneas do mesmo evento leem ambas o mesmo total e ambas inserem.

**Achado (P0): não existe chave de idempotência em lado nenhum.**
`finance_gateway_webhook_events` tem coluna `external_id`, e ela é escrita **só na
telemetria** (`gateway-webhook-telemetry.ts:55`) — nunca lida. O `payment_id` que
o PayFlow envia é passado como `reference` e nunca comparado com liquidações
anteriores. A única defesa é o `return` antecipado quando a fatura já está `paid`.

Consequência, exactamente o cenário 4 do plano de testes:

- **Repetir a confirmação de um pagamento integral** → a fatura já está `paid`,
  devolve `alreadyPaid: true`. **Protegido.**
- **Repetir a confirmação de um pagamento parcial** → a fatura está
  `partially_paid`, não há tecto, insere um segundo recibo. **Pagamento duplicado
  aceite**, e o total dos recibos pode ultrapassar o valor da fatura.

**Achado agravante (P1): a única restrição que apanharia o duplicado é
deliberadamente contornada.** `finance_receipts` tem `UNIQUE (school_id,
receipt_number)`. O caminho alternativo gera `REC-AAAA/NNNN` e, ao colidir com
`23505`, **incrementa a sequência e volta a tentar** (5 vezes). O comentário
explica que é para o caso de dois webhooks chegarem ao mesmo tempo — resolve a
colisão de numeração e, ao resolvê-la, garante que o segundo pagamento entra.

Nota de justiça: a confirmação manual (`confirmManualMulticaixaPayment`) também
não é idempotente para pagamentos parciais. Constrói um número
`MCX-CONF-<referência>` que parece uma chave de idempotência, mas
`recordInvoicePayment` **ignora-o** — usa-o só como nota no arquivo, e o número
oficial vem de `register_payment`. A diferença é que aí o tecto da RPC impede pelo
menos que o total ultrapasse a fatura.

**Achado (P1): o recibo pode ficar atribuído a um utilizador de outra escola.**
No caminho alternativo, `received_by` é preenchido por tentativas sucessivas
(`gateway-webhook-handler.ts:156-176`): `invoice.issued_by`, depois um membro da
escola, e por fim:

```ts
const { data: anyMember } = await db
  .from("school_memberships")
  .select("user_id")
  .limit(1)          // ← sem .eq("school_id", ...)
  .maybeSingle();
```

Sem filtro de escola. Numa base multi-tenant com 94 contas activas, o recibo de
uma escola pode ficar assinado por um utilizador de outra. É simultaneamente uma
fuga do limite de tenant para dentro do registo financeiro e um autor falso num
documento com valor fiscal.

## 6.1 Planos de propinas, emolumentos, descontos, bolsas e multas

**Implementado, menos as bolsas.** `fee_plans` + `fee_items` (`kind`,
`frequency`, `amount`, `currency_code`); descontos em
`finance_contracts.discount_percentage` e
`school_billing_settings.sibling_discount_percent`; multas por
`school_billing_settings.late_fee_percent` + `grace_days`, materializadas em
`finance_invoices.penalty_amount`.

**Achado (P2): não há bolsa como conceito.** Não existe tabela de bolsas. Uma
bolsa tem de ser expressa como percentagem de desconto no contrato, o que perde
quem a atribuiu, com que critério, e até quando é válida. Para uma escola com
bolsas de mérito ou sociais, isto não é registável.

## 6.2 Contratos, faturas, referências e planos de pagamento

**Implementado.** `create_financial_contract` (RPC), `issueInvoice`,
`generateInvoicePaymentReference`, `createPaymentPlan`/`cancelPaymentPlan`.
Existe até exportação SAF-T AO (`exportSaftAoXml`), que é o requisito fiscal
angolano.

**Achado (P2): três caminhos de numeração, duas autoridades diferentes.**
`document_sequences` existe e está semeada para **90 escolas**, com séries para
`invoice`, `receipt`, `credit_note`, `certificate`, `declaration`, `expense`,
`term`, `transfer`. `register_payment` usa-a (`next_document_number`). Mas
`issueInvoice` (`server.ts:1035-1071`) e o caminho alternativo do webhook contam
linhas em JS (`count(*)` com `LIKE 'FT-2026/%'`) e avançam em colisão. Num
documento com valor fiscal, a numeração devia ter uma única autoridade — e ela já
existe na base.

A série `credit_note` está semeada e **não encontrei implementação de nota de
crédito**. `cancel_invoice` anula a fatura no sítio. Para uma fatura já emitida, a
prática fiscal pede nota de crédito, não anulação retroactiva. **P2**, ou por
implementar, ou uma decisão que não está registada.

## 6.3 Pagamentos parciais, integrais, antecipados e em atraso

**Implementado.** `register_payment` aceita parcelas, soma os recibos emitidos e
decide `partially_paid` ou `paid`; `finance_invoices.due_date` com
`grace_days`/`late_fee_percent` cobre o atraso. Antecipados: `finance_payment_plans`
tem `installments` e `scheduled`.

## 6.6 Reconciliação

**Não implementado.** Procurei `reconcil` em todo o `src/`: as únicas ocorrências
são de presenças e de horários (`CampusAttendanceReconciliationPanel`,
`lessonPlanReconciliation`). **Não existe reconciliação financeira** entre
transações do gateway, faturas, contas de aluno e movimentos de caixa.

`finance_gateway_webhook_events` guarda o que o gateway disse e `finance_receipts`
guarda o que o SIGA registou — mas nada compara os dois. Um webhook perdido, um
recibo duplicado ou um valor divergente não são detectáveis por nenhum ecrã.
**P1**, e é o controlo que apanharia os P0 acima em produção.

## 6.7 Anulação, estorno, reembolso e correcções

**Implementado e rastreável.** `cancel_invoice` (permissão
`finance.invoices.cancel`, grava `cancelled_at`/`cancelled_by`/
`cancellation_reason`), `reverse_receipt` (descrita acima),
`reverseCashEntry` para despesas de caixa (`reversal_reason`, `reversed_at`,
`reversed_by`). `finance_invoice_events` regista as transições de estado.

**Achado (P1): o registo de eventos da fatura pode ser forjado.**
`finance_invoice_events` é a única tabela financeira com política de **INSERT**, e
a verificação é apenas `school_id = current_school_id()` — sem permissão, sem MFA,
sem validar que a transição corresponde a alguma coisa que aconteceu. Qualquer
membro autenticado da escola pode inserir eventos arbitrários na trilha de
auditoria das faturas.

O mesmo padrão em `finance_payment_plans`: política única `FOR ALL` com
`is_school_member(school_id)`. Qualquer membro activo cria, altera ou apaga planos
de pagamento — incluindo a `reference` que o gateway usa para reconhecer o
pagamento.

## 6.8 Fecho de caixa, relatórios e segregação de funções

**Parcialmente implementado.** Há `listCashEntries`, `recordCashExpense`,
`reverseCashEntry`, `getFinanceReporting` e a exportação SAF-T. **Não encontrei
fecho de caixa** — nenhuma função, tabela ou ecrã que feche um período de caixa,
apure o saldo e o bloqueie. **P2.**

**Achado (P1): não há segregação de funções na tesouraria.** As permissões estão
semeadas (2314 concessões em produção) e o papel `treasury` detém, em conjunto:
`finance.payments.create`, `finance.payments.reverse`, `finance.invoices.cancel` e
`finance.settings.manage`. A mesma pessoa regista o pagamento, estorna-o, anula a
fatura e altera as regras de cobrança, sem segundo par de olhos em nenhum passo.
Não existe papel de aprovador nem fluxo de autorização — ao contrário do que a
área 5 tem para notas (`review_grade_change`).

`guardian` tem `finance.contracts.read` e `finance.invoices.read`, o que está
certo para o portal do encarregado. `student`, `teacher` e `secretary` não têm
permissões financeiras.

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P0** | O caminho do gateway nunca usa `register_payment`: sem bloqueio da fatura e sem tecto de pagamento | `gateway-webhook-handler.ts:146-243` |
| **P0** | Nenhuma chave de idempotência: repetir a confirmação de um pagamento **parcial** cria um segundo recibo | `external_id` só escrito na telemetria |
| **P1** | A `UNIQUE (school_id, receipt_number)` que apanharia o duplicado é contornada com retentativa | `gateway-webhook-handler.ts:197-222` |
| **P1** | `received_by` pode vir de outra escola — `school_memberships` sem filtro de `school_id` | `gateway-webhook-handler.ts:169-176` |
| **P1** | Sem reconciliação financeira: nada compara o gateway com os recibos | 0 ocorrências em `src/` |
| **P1** | `finance_invoice_events` aceita INSERT só com `school_id = current_school_id()` — trilha forjável | `pg_policies` |
| **P1** | `finance_payment_plans`: `FOR ALL` com `is_school_member` | `pg_policies` |
| **P1** | `treasury` acumula criar, estornar, anular e configurar — sem aprovador | 2314 concessões em produção |
| **P2** | Numeração fiscal com duas autoridades: `document_sequences` existe e `issueInvoice` não a usa | 90 escolas semeadas |
| **P2** | Sem fecho de caixa | ausência |
| **P2** | Sem bolsas como conceito; só percentagem de desconto | esquema |
| **P2** | Série `credit_note` semeada, sem nota de crédito implementada | `document_sequences` |

**A ordem que proponho:** os dois P0 são um só trabalho — dar ao webhook um
caminho autenticado que chegue a `register_payment` (um actor de serviço com a
permissão, em vez do `catch` que a contorna), e uma restrição única sobre
`(school_id, provider, external_id)` que torne a repetição impossível na base e
não no código. Depois a reconciliação, que é o que teria mostrado o problema sem
ser preciso auditá-lo.
