# Auditoria SIGA Plus — 6. Gestão financeira

**Data:** 2026-09-24 · **Âmbito:** apenas a área 6 · **Código não alterado.**

Retrato de produção: `supabase/PRODUCTION_SNAPSHOT.json` de 2026-09-24T11:14:55Z
(commit `573cb2f`); DDL real em
`supabase/migrations/20260924005132_capture_undeclared_production_tables.sql`.

Testes da área: `tests/finance/` (7), `tests/integrations/gateway-webhook-key.test.ts`,
`tests/angola/finance-print.test.ts`, `tests/intelligence/finance/` (2),
`tests/routes/financeiro*.test.tsx` (6). **67 testes, todos a passar.**
Cobrem esquemas, métricas, telemetria, alertas e SAF-T. **Nenhum exercita a liquidação
de um pagamento.** `settleGatewayPayment` e `runFinanceGatewayWebhook` têm zero
ocorrências em `tests/`.

---

## Nota de leitura: há dois caminhos para o mesmo dinheiro

Quase todos os achados desta área nascem daqui. A mesma operação — dar uma fatura por paga
— tem duas implementações com garantias muito diferentes:

| | **Caminho da tesouraria** (humano) | **Caminho do gateway** (automático) |
|---|---|---|
| Entrada | `recordInvoicePayment` | `runFinanceGatewayWebhook`, `applyPayflowSettlement` |
| Cliente | sessão do utilizador | service_role |
| Executa | RPC `register_payment` | fallback em TypeScript |
| Tranca a fatura | **sim** (`FOR UPDATE`) | não |
| Recusa pagamento a mais | **sim** | **não** |
| Exige 2FA + `finance.payments.create` | **sim** | n/a |
| Numeração | `next_document_number` (contador trancado) | contagem + retry |
| `received_by` | `auth.uid()` | membro arbitrário (ver 6.7) |

O caminho humano está **bem feito**. O caminho que trata do dinheiro real, sem ninguém a
ver, é o desprotegido.

---

## 6.1 Planos de propinas, matrículas, emolumentos, descontos, bolsas e multas

**Estrutura presente; quase todos os valores estão fixos a zero.**

`fee_plans` → `fee_items` (`kind`, `code`, `amount`, `frequency`, `is_active`) existem, e
`finance_contracts` liga a matrícula ao plano. Mas:

- **Emolumentos:** só há dois `kind` semeados — `tuition` e `enrollment`
  (`fee-plan-defaults.ts`). Não há catálogo de emolumentos.
- **Descontos (P1):** `finance_contracts.discount_percentage` é escrito **sempre a 0**
  (`server.ts:1006`) e **nunca é lido** em lado nenhum (`grep` em todo o `src/`).
  `finance_invoices.discount_amount` é escrito **sempre a 0** (`server.ts:1055`).
- **Bolsas:** zero ocorrências de `bolsa`/`scholarship` no módulo financeiro. Não existe.
- **Multas (P1):** `finance_invoices.penalty_amount` é escrito **sempre a 0**
  (`server.ts:1057`). Não há cálculo de mora, nem sequer uma regra de dias de atraso.
  As duas referências restantes são mensagens de erro a pedir a aplicação de um script SQL
  (`faturas.tsx:798`, `financeiro.tsx:835`).

**Achado (P2): o preço do plano não é aplicado.** `issueInvoice` vai buscar o item de taxa
com `select("id, name, amount")` (`server.ts:1021`) e usa **só o `id`**. O valor da fatura
é `data.amount`, o que o cliente enviou (`:1054`). O plano de propinas serve para escolher
uma linha, não para determinar quanto se cobra — dois alunos do mesmo plano podem receber
faturas de valores diferentes sem que nada o assinale.

**Achado (P3, latente): `register_payment` ignora o desconto.** A validação é
`already_paid + target_amount > selected_invoice.amount`, e o estado passa a `paid` quando
os recibos atingem `amount` — não `amount - discount_amount`. Se algum dia um desconto for
gravado, a fatura descontada nunca fecha: o aluno paga o valor com desconto e a fatura fica
`partially_paid` para sempre. Hoje não acontece **porque o desconto é sempre 0** — é dívida
latente, não defeito activo, mas é a razão pela qual implementar descontos não é uma
alteração de uma linha.

## 6.2 Contratos, faturas, referências e planos de pagamento

**Implementado.** `issueInvoice` cria contrato quando falta, resolve o item de taxa, calcula
o mês de competência e numera no servidor (nunca aceitando numeração do cliente — decisão
correcta e comentada em `:1032`). `generateInvoicePaymentReference` produz referência
Multicaixa via `emiss-multicaixa.ts` e opções de carteira móvel.
`createPaymentPlan`/`cancelPaymentPlan` gerem `finance_payment_plans`.

**Achado (P1): existem duas séries de recibos na mesma escola.**

| Caminho | Formato | Origem do número |
|---|---|---|
| Tesouraria (`register_payment`) | `REC-0001` | `private.next_document_number` — contador em `document_sequences`, com `FOR UPDATE` |
| Gateway (fallback do webhook) | `REC-2026/0001` | `count(*)` sobre `LIKE 'REC-2026/%'` + retry no 23505 |

São **formatos diferentes** e **contadores independentes**: a contagem do gateway filtra por
`REC-AAAA/%` e portanto nunca vê os recibos `REC-NNNN` da tesouraria, e não faz avançar
`document_sequences`. Para uma série documental fiscal — e há exportação SAF-T AO neste
módulo — duas séries paralelas para o mesmo tipo de documento é um problema de conformidade,
não de arrumação. `saft-validator.ts` não verifica continuidade de numeração (`grep` por
`sequen|continu|gap|numera`: nada).

As faturas seguem o mesmo padrão de contagem (`FT-AAAA/NNNN`, `:1035-1041`) em vez de
`next_document_number`, que só é usado pelo caminho da tesouraria.

## 6.3 Pagamentos parciais, integrais, antecipados e em atraso

**Implementado no caminho da tesouraria.** `register_payment` soma os recibos emitidos,
recusa exceder o saldo em aberto e decide `paid` vs `partially_paid`. É a implementação
correcta.

No caminho do gateway o mesmo cálculo existe mas **só decide o estado — não recusa nada**
(`gateway-webhook-handler.ts:230-231`). Ver 6.5.

Pagamento antecipado e em atraso: `due_date` existe e os relatórios distinguem vencido de
por vencer; não há tratamento específico de antecipação (nem penalização por atraso, ver 6.1).

## 6.4 Integração com prestadores efectivamente configurados, incluindo webhooks

**Implementado, com duas integrações reais e uma boa disciplina de segredos.**

Provedores: `multicaixa_express` e `unitel_money`, resolvidos por API key contra
`school_integrations` com `status in ('configured','connected')`. Há ainda a integração
PayFlow, com o seu próprio webhook (`applyPayflowSettlement`).

O que está bem feito e merece registo:

- a chave de modo dev **não tem valor por omissão** e é recusada se `NODE_ENV=production`
  (`:37-43`) — o comentário explica porquê, e a razão é correcta;
- comparação de chaves com `timingSafeEqual`, não `===`;
- **limite de pedidos** no webhook (30 / 5 min por IP), precisamente porque
  `resolveGatewaySchoolByApiKey` compara contra as chaves de todas as escolas e seria um
  oráculo de força bruta (`:420-425`);
- uma liquidação falhada é reportada por `reportSigaError` em vez de morrer no 502
  (`:400-410`) — "dinheiro que o provedor recebeu e o SIGA não registou".

**Nota de honestidade do próprio código:** `confirmManualMulticaixaPayment` documenta que
"não existe integração real com um webhook EMIS" (`server.ts:938-941`) e que quem confirma
está a atestar que viu o comprovativo. A verificação 6.4 pede provedores *efectivamente*
configurados — o estado real é: canal EMIS por confirmação manual, PayFlow por webhook.

## 6.5 Idempotência e prevenção de pagamentos, recibos ou cobranças duplicados

**Achado (P0): não há chave de idempotência. A única defesa é o estado da fatura, e não chega.**

Toda a idempotência do caminho do gateway é esta linha
(`gateway-webhook-handler.ts:123-130`):

```ts
if (invoice.status === "paid") return { alreadyPaid: true, … };
```

Três buracos, por ordem de gravidade:

**a) Pagamentos parciais não são cobertos.** Se a fatura ficou `partially_paid`, uma segunda
entrega do **mesmo** evento não bate na guarda e emite **um segundo recibo**. O fallback
calcula `alreadyPaid` (`:155-161`) e usa-o **apenas para escolher o estado**
(`:230-231`) — nunca para recusar. Ao contrário de `register_payment`, que levanta
excepção quando `already_paid + amount > invoice.amount`.

**b) O `external_id` é recolhido e nunca usado.** O webhook recebe-o, passa-o a
`settleGatewayPayment` — e a função **não o usa no corpo** (só existe na assinatura,
`:112`). É gravado em `finance_gateway_webhook_events.external_id` para telemetria
(`gateway-webhook-telemetry.ts:55`) e mais nada. Não há índice único sobre ele, nem sobre
`(school_id, invoice_id, external_id)` em `finance_receipts` — cujas únicas restrições de
unicidade são `(school_id, id)` e `(school_id, receipt_number)`. O mesmo vale para o
`payment_id` do PayFlow, que é validado (`min(6).max(80)`) e depois passa como `reference`,
servindo só para casar planos de pagamento.

**c) Duas entregas simultâneas passam ambas.** É um `SELECT` seguido de `INSERT` sem
transacção nem bloqueio. `register_payment` resolve isto com `FOR UPDATE`; o fallback não
tem equivalente. O código **sabe** que há concorrência — o retry no 23505 da numeração diz
textualmente "dois webhooks podem chegar ao mesmo tempo" (`:186-187`) — mas essa defesa
protege o *número do recibo*, não o *pagamento*: o retry limita-se a procurar o próximo
número livre e insere na mesma.

**E o fallback corre sempre.** `register_payment` exige `auth.uid()` não nulo e `is_aal2()`.
Num webhook servidor-a-servidor com service_role, `auth.uid()` é nulo — portanto a RPC
levanta **sempre** `42501`, o `catch` casa com o regex `/aal2|42501|autorização|permission/i`
(`:147`) e o caminho protegido **nunca se executa para dinheiro de gateway**. O comentário
em `:180-186` confirma que já sabiam que esta chamada falhava sempre.

Efeito prático, e é exactamente o cenário 4 do plano de testes: **reenviar a mesma
confirmação sobre uma fatura parcialmente paga cria um segundo recibo, e o total recebido
passa a exceder a fatura.**

Um segundo efeito do mesmo regex: se a RPC falhar por um motivo de autorização **legítimo**,
o código não recusa — desce ao fallback e liquida à mesma, sem verificação nenhuma.

## 6.6 Reconciliação entre transações, faturas, contas de alunos e movimentos

**Parcialmente implementado.** `finance_gateway_webhook_events` regista cada entrega
(canal, `http_status`, `ok`, `message`, `reference`, `invoice_id`, `amount`, `provider`,
`dev_mode`, `external_id`), e `listGatewayWebhookEvents` expõe-nos. Há métricas e alerta de
taxa de falha (`gateway-webhook-metrics.ts`, `gateway-failure-rate-alert.ts`). Os relatórios
financeiros existem (`getFinanceReporting`).

**Não existe reconciliação propriamente dita:** nenhuma rotina confronta os eventos do
gateway com os recibos emitidos para apontar o que o provedor confirmou e o SIGA não
registou (ou o contrário). Com a idempotência de 6.5 em aberto, é precisamente a peça que
apanharia o recibo duplicado — e não está lá.

A reconciliação está ainda comprometida pelo achado seguinte: um recibo estornado não
repõe o estado da fatura, pelo que o saldo do aluno deixa de fechar com a soma dos recibos.

## 6.7 Anulação, estorno, reembolso e correções com autorização e rastreabilidade

**Achado (P1): existe `reverse_receipt` em produção, bem feita, e a aplicação não a chama.**

`private.reverse_receipt` exige `finance.payments.reverse` **e** AAL2, exige motivo com ≥5
caracteres, tranca o recibo (`FOR UPDATE`), grava `reversed_by = auth.uid()` e — o essencial
— **recalcula o estado da fatura** (`open` / `partially_paid` / `paid`) a partir dos recibos
que sobram. Chamadas na aplicação: **zero**. O mesmo para `cancel_invoice` e
`next_document_number`.

O que a aplicação faz em vez disso, em `reverseCashEntry` (`server.ts:1171-1213`): um
`UPDATE` directo a `finance_receipts` com o cliente de serviço. As quatro consequências:

1. **Sem `finance.payments.reverse` e sem 2FA.** Só o papel `Administrador`/`Tesouraria`.
   Registar um pagamento exige segundo factor; anulá-lo não exige nenhum.
2. **Sem filtro `status = 'issued'`.** O ramo das despesas tem `.eq("status","posted")`
   (`:1204`); o dos recibos não tem. Um recibo já estornado pode ser estornado outra vez,
   **sobrescrevendo `reversed_at`, `reversed_by` e `reversal_reason`** — apaga-se o registo
   de quem anulou e porquê, que é justamente a rastreabilidade que esta verificação pede.
3. **A fatura não é actualizada.** Nenhum `UPDATE` a `finance_invoices`, e **não há trigger
   que o faça** — os únicos triggers em `finance_receipts` são `audit_row_change` e nada
   mais. Estornar o único recibo de uma fatura paga deixa-a em `paid` com zero recibos
   activos: o aluno deve dinheiro que o sistema dá por liquidado.
4. **Fica presa.** Nesse estado, `cancelInvoice` recusa ("Não é possível cancelar uma fatura
   já liquidada"), `register_payment` só aceita `status in ('open','partially_paid')` e a
   guarda do webhook (`status === 'paid'`) engole silenciosamente qualquer pagamento futuro.

**Achado (P0): o estorno do PayFlow não pode funcionar — falha por duas razões independentes.**

`applyPayflowSettlement`, no ramo `payment.refunded` (`payflow-settlement.ts:117-125`),
reverte os recibos e depois tenta reabrir a fatura com:

```ts
.update({ status: "issued", updated_at: now })
```

- `finance_invoices_status_check` admite **apenas** `open`, `partially_paid`, `paid`,
  `cancelled`. **`"issued"` não existe** → violação de CHECK (23514).
- `finance_invoices` **não tem coluna `updated_at`** (confirmado no retrato e no DDL) →
  42703.

Qualquer uma das duas basta. E a ordem das operações torna o efeito permanente: os recibos
**já foram revertidos** quando o `UPDATE` rebenta, e a função devolve 500. Não há transacção.
O PayFlow repete; na repetição, a guarda de idempotência
(`active.length === 0 && invoice.status !== "paid"`, `:83`) não dispara — porque a fatura
continua em `paid` — e volta a rebentar no mesmo sítio. **Fatura permanentemente em `paid`,
todos os recibos estornados, e o webhook em erro para sempre.**

O ramo também não grava `reversed_by` (aceitável num webhook sem utilizador, mas o rasto
fica sem actor).

**O que está bem:** `cancelInvoice` recusa faturas pagas e faturas com recibos activos, e
exige motivo (com `CHECK` de 5–300 caracteres na base). `audit_row_change` está activo em
`finance_contracts`, `finance_invoices` e `finance_receipts`. As colunas de rasto
(`cancelled_by`, `reversed_by`, `reversal_reason`) existem e têm restrições coerentes.

## 6.8 Fecho de caixa, relatórios financeiros e segregação de funções

**Relatórios: implementados.** `getFinanceReporting`, `listCashEntries`, `recordCashExpense`
(`siga_cash_expenses`, com `document_number`, `category`, `method`, estorno e auditoria de
`updated_by`), gráficos e exportação SAF-T AO (`saft-generator.ts`, `saft-validator.ts`,
`exportSaftAoXml`).

**Achado (P1): não há fecho de caixa.** Procurado por `fecho`, `closeCash`, `cash_clos`,
`daily_close` em todo o `src/`: os únicos acertos são o fecho de trimestre **académico**.
Não existe tabela, função ou ecrã de fecho diário de tesouraria — nem no esquema (162
tabelas) nem no código. A verificação pede-o explicitamente.

**Achado (P1): não há segregação de funções.** `recordInvoicePayment`, `reverseCashEntry`,
`cancelInvoice` e `recordCashExpense` aceitam todas o mesmo par `["Administrador",
"Tesouraria"]`. Quem recebe o dinheiro pode anulá-lo, sozinho e sem segundo factor.

A base **foi desenhada para o contrário**: `finance.payments.create` e
`finance.payments.reverse` são permissões distintas, precisamente para poderem viver em
pessoas diferentes. Como o estorno não passa por `reverse_receipt` (6.7), a distinção nunca
é consultada — as duas permissões existem no modelo e nenhuma decisão depende delas.

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P0** | Sem chave de idempotência: reenviar a confirmação sobre fatura parcialmente paga cria segundo recibo; `external_id`/`payment_id` recolhidos e nunca usados; sem unicidade na base | `gateway-webhook-handler.ts:123-130`, `:112`; restrições de `finance_receipts` |
| **P0** | Estorno PayFlow impossível: escreve `status:"issued"` (fora do CHECK) e `updated_at` (coluna inexistente), **depois** de já ter revertido os recibos, sem transacção — e repete-se para sempre | `payflow-settlement.ts:117-125` vs DDL |
| **P0/P1** | Todo o dinheiro de gateway corre no fallback sem tranca e sem recusa de excesso: `register_payment` exige `auth.uid()`, que num webhook é nulo | `:147`, `:180-186` |
| **P1** | `reverse_receipt` (com permissão, 2FA, motivo e recálculo do estado) nunca é chamada; `reverseCashEntry` faz `UPDATE` directo | 0 chamadas; `server.ts:1171-1213` |
| **P1** | Estorno não repõe o estado da fatura e não há trigger que o faça — fatura fica `paid` sem recibos activos e não aceita novo pagamento | triggers de `finance_receipts` |
| **P1** | Recibo já estornado pode ser estornado de novo, apagando `reversed_by`/`reversal_reason` | falta `.eq("status","issued")` |
| **P1** | Duas séries de recibos com formatos e contadores independentes (`REC-0001` vs `REC-2026/0001`) | `next_document_number` vs `:183-199` |
| **P1** | Sem fecho de caixa | `grep` em `src/` e no esquema |
| **P1** | Sem segregação de funções: quem recebe pode estornar, sem 2FA; `finance.payments.create`/`.reverse` nunca são consultadas | papéis idênticos nas 4 funções |
| **P1** | Descontos, bolsas e multas não implementados — `discount_percentage`, `discount_amount` e `penalty_amount` fixos a 0 | `server.ts:1006`, `:1055-1057` |
| **P2** | `issueInvoice` ignora o preço do item de taxa e aceita o valor do cliente | `:1021` vs `:1054` |
| **P2** | Sem reconciliação entre eventos do gateway e recibos | `listGatewayWebhookEvents` só lista |
| **P3** | `register_payment` compara com `amount`, não `amount - discount_amount` (latente: desconto é sempre 0) | corpo capturado |
| **P3** | `confirmManualMulticaixaPayment` e `generateInvoicePaymentReference` com validador de passagem, sem zod | `server.ts:846`, `:809` |

### O que está bem, e vale dizer

`private.register_payment` é a peça mais bem escrita que encontrei nesta auditoria até
agora: autenticação, 2FA, permissão granular, validação de método e valor, `FOR UPDATE` na
fatura, recusa de pagamento acima do saldo, numeração por contador trancado e
`received_by = auth.uid()`. `reverse_receipt` é do mesmo nível. O caminho da tesouraria
usa-as correctamente, e `recordInvoicePayment` até comenta porquê corre no cliente da sessão
em vez do de serviço.

A disciplina do webhook também é boa: sem chave por omissão, `timingSafeEqual`, limite de
pedidos contra força bruta de API keys, e erros de liquidação reportados em vez de
engolidos.

**O problema não é falta de competência — é que as duas funções boas não são alcançáveis
pelo caminho que trata do dinheiro real**, e o substituto escrito à pressa perdeu a tranca,
a recusa de excesso, a numeração e o actor.

### Ordem sugerida

1. **`external_id` / `payment_id` como chave de idempotência**, com índice único em
   `finance_receipts` — é o que impede o recibo duplicado, e é uma migração pequena.
2. **Corrigir o estorno PayFlow** (`"issued"` → `"open"`, remover `updated_at`) e pô-lo
   numa transacção. Hoje está garantidamente partido.
3. **Dar ao webhook um caminho trancado**: uma variante de `register_payment` que aceite
   actor de sistema em vez de `auth.uid()`, para o gateway deixar de correr no fallback.
4. Passar `reverseCashEntry` a chamar `reverse_receipt`. Resolve de uma vez o estado da
   fatura, a permissão granular, o 2FA e o duplo estorno.
5. Unificar a numeração em `next_document_number`.
6. Fecho de caixa e segregação de funções.
7. Descontos, bolsas e multas — e, ao implementá-los, corrigir a comparação com
   `amount - discount_amount`.

Os pontos 1 a 4 são de dinheiro e de conformidade fiscal. Os restantes são funcionalidade
em falta e podem seguir a cadência normal.
