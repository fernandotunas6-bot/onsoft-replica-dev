# Contabilidade — projecto técnico

**Data:** 25/10/2026. **Estado:** proposta. Nada implementado nem aplicado. Pendência 5 de [`FINANCE_MASTER_2026.md`](FINANCE_MASTER_2026.md).

O plano financeiro diz: «a estrutura contabilística não deve ser activada como funcionalidade oficial sem validação de um contabilista qualificado». Este documento é a peça técnica para essa validação. Não substitui o parecer do contabilista.

## Ponto de partida

Verificado a 25/10/2026 no retrato da produção e no código: **não existe núcleo contabilístico**. Não há plano de contas, lançamentos, diário, razão nem períodos. O que existe é tesouraria:

| Evento             | Onde fica                                 | Função                            |
| ------------------ | ----------------------------------------- | --------------------------------- |
| Fatura emitida     | `finance_invoices`                        | `issueInvoice`                    |
| Pagamento recebido | `finance_receipts`                        | `private.register_payment`        |
| Recibo estornado   | `finance_receipts.status = 'reversed'`    | `private.reverse_finance_receipt` |
| Fatura anulada     | `finance_invoices.status = 'cancelled'`   | `cancelInvoice`                   |
| Despesa            | `siga_cash_expenses`                      | `recordCashExpense`               |
| Despesa estornada  | `siga_cash_expenses.status = 'reversed'`  | `reverseCashEntry`                |
| Salário pago       | `siga_cash_expenses` (categoria da folha) | `hr_atomic_payment_confirmation`  |
| Multa por atraso   | `finance_invoices.penalty_amount`         | dentro de `register_payment`      |
| Desconto e bolsa   | `finance_invoices.discount_amount`        | na emissão                        |

## Princípio

A contabilidade **lê** a tesouraria; não a substitui. Cada evento acima gera um lançamento equilibrado, no mesmo `COMMIT` que o evento, e o lançamento aponta para o documento de origem. Nada se lança à mão sem documento, e nada se altera depois de lançado: corrige-se com um lançamento inverso.

## Modelo proposto

| Tabela              | Conteúdo                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `acc_accounts`      | Plano de contas por escola: código, nome, classe, natureza (devedora/credora), `postable` (só contas de movimento recebem lançamentos) |
| `acc_periods`       | Mês contabilístico por escola: `open` → `closed`; reabertura só com aprovação                                                          |
| `acc_entries`       | Cabeçalho: data, período, descrição, `source_table` + `source_id` (documento de origem), `reverses_entry_id`                           |
| `acc_entry_lines`   | Linhas: conta, débito ou crédito em `numeric(18,2)`, centro de custo opcional                                                          |
| `acc_posting_rules` | Por escola e por evento: que contas debitar e creditar (configurável pelo contabilista)                                                |

### Restrições na base (não só no código)

- Lançamento equilibrado: gatilho `DEFERRABLE INITIALLY DEFERRED` que, no `COMMIT`, recusa um `acc_entries` cuja soma dos débitos ≠ soma dos créditos.
- Um lançamento por evento: índice único `(source_table, source_id, kind)`, para que nem um webhook repetido nem um reprocessamento lancem duas vezes.
- Período fechado não recebe lançamentos, nem por `UPDATE` nem por `INSERT`.
- `acc_entries` e `acc_entry_lines` não aceitam `UPDATE` nem `DELETE`; a correcção é sempre um lançamento novo com `reverses_entry_id`.
- Fecho do período recusado enquanto houver eventos de tesouraria sem lançamento nesse mês.

## Regras de lançamento (indicativas, a validar)

Classes do Plano Geral de Contabilidade de Angola (Decreto n.º 82/01): 1 Meios fixos e investimentos; 2 Existências; 3 Terceiros; 4 Meios monetários; 5 Capital e reservas; 6 Proveitos e ganhos por natureza; 7 Custos e perdas por natureza; 8 Resultados. **As contas abaixo são uma sugestão de partida; o contabilista fixa as subcontas e o enquadramento fiscal de cada escola.**

| Evento                                         | Débito                                            | Crédito                                      |
| ---------------------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| Fatura emitida (propina, matrícula)            | 31 Clientes — aluno                               | 62 Prestações de serviços                    |
| Desconto ou bolsa na fatura                    | 62 (redução) ou conta de descontos concedidos     | 31 Clientes                                  |
| Multa por atraso aplicada                      | 31 Clientes                                       | Conta de proveitos suplementares (a definir) |
| Pagamento em numerário                         | 45 Caixa                                          | 31 Clientes                                  |
| Pagamento por transferência, cartão ou gateway | 43 Depósitos à ordem — conta da escola            | 31 Clientes                                  |
| Estorno de recibo                              | Lançamento inverso do pagamento                   |                                              |
| Fatura anulada                                 | Lançamento inverso da emissão                     |                                              |
| Despesa paga                                   | Conta de custos da classe 7, conforme a categoria | 45 Caixa ou 43 Depósitos                     |
| Salário pago                                   | 72 Custos com o pessoal                           | 45 Caixa ou 43 Depósitos                     |

IVA, Imposto Industrial, retenções na fonte e o regime de isenção de cada escola **não estão modelados**. Ficam fora até o contabilista definir o enquadramento: muitas escolas têm regimes específicos, e o plano diz «não assumir que todas as escolas possuem o mesmo enquadramento fiscal».

## Relatórios

Com o modelo acima, o diário, o razão por conta e o balancete por período são consultas sobre `acc_entry_lines`. O balanço e a demonstração de resultados dependem do mapeamento das contas às rubricas, que é trabalho do contabilista, e só aparecem depois desse mapeamento.

## Fases

1. **Plano de contas e regras**, configuráveis por escola, sem lançar nada. O contabilista valida-os numa escola de teste.
2. **Lançamento automático dos eventos novos**, nas funções da tesouraria, no mesmo `COMMIT`. Diário e razão só de leitura.
3. **Períodos e fecho**, com a verificação de eventos sem lançamento.
4. **Lançamento retroactivo** do histórico, por período, só depois de o contabilista aprovar o ponto de partida (saldos de abertura).
5. **Balancete, balanço e demonstração de resultados**, depois do mapeamento às rubricas.

Cada fase é um PR com a sua migração por aplicar, como nas sessões de caixa.

## Decisões pedidas

1. **Contabilista:** quem valida o plano de contas e as regras? Sem esta pessoa, a fase 1 fica como protótipo e não se activa.
2. **Âmbito:** contabilidade para todas as escolas, ou só para as que a contratarem? Sugestão: módulo opcional, desligado por omissão.
3. **SAF-T de contabilidade:** fica fora enquanto o SIGA não for software certificado pela AGT. Confirmar.
4. **Histórico:** lançar o passado (fase 4) ou começar a contabilidade numa data de abertura com saldos iniciais?
