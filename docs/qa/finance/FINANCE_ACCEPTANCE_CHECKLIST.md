# Financeiro — checklist de aceitação

**Data:** 25/10/2026. **Referência:** prompt «SIGA Plus Finance 2026», §14 (validação) e §17 (critérios de aprovação). **PRs:** #276 e #283, por fundir.

Legenda: **Feito** com prova automática · **Parcial** · **Por fazer** · **Bloqueado** (depende de terceiros ou de aprovação).

## Critérios de aprovação (§17)

| Critério                                   | Estado                               | Prova ou motivo                                                                             |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Páginas sem funções de outros módulos      | Feito nas 6 páginas financeiras      | `finance-installed-tools-context.test.ts`, `page-header-area-coherence.test.ts`             |
| Sem pagamentos duplicados (gateway)        | Feito                                | Índice único `finance_receipts_school_external_id_key`, confirmado na produção a 24/10      |
| Sem pagamentos duplicados (manual)         | Feito no código, por aplicar         | Migração `20261024100000`; `payment-attempt-key.test.ts`                                    |
| Recibos com origem verificável             | Feito                                | QR `/verificar`; `validation-footer.test.ts`                                                |
| QR de pagamento sem integração real        | Feito: não existe nenhum             | Texto de QR «EMIS» inventado retirado; «Referência EMIS» sem ícone de QR                    |
| Faturas não apresentadas como certificadas | Feito                                | Cartão de Faturas, rodapé dos documentos, sem linhas «AGT;…»                                |
| Isolamento por escola                      | Feito no servidor e na base          | RPC com `school_id`, AAL2 e `has_permission`; **sem teste com duas escolas**                |
| Saldos correctos                           | Feito, com uma correcção por aplicar | Numerário e banco separados (`cash-balances.test.ts`); estorno com multa (`20261024090000`) |
| Operações sensíveis com autorização        | Feito                                | Estorno, fecho e aprovação de caixa com AAL2 e papéis; quem fecha não aprova                |
| Sem regressões de navegação                | Feito para breadcrumb e acesso       | `access-policy.test.ts`; **sem teste E2E**                                                  |
| Componentes visualmente consistentes       | Parcial                              | Estados por `payment-states.ts`; tabelas e modais não revistos                              |
| Fluxos com validação adequada              | Parcial                              | Testes unitários e de contrato; **nenhum fluxo E2E**                                        |

## Fluxos obrigatórios (§14)

| Fluxo                                                          | Estado    | Nota                                                                   |
| -------------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| Cobrança: plano → obrigação → vencimento → pagamento           | Por fazer | Sem E2E                                                                |
| Pagamento: criar → confirmar no fornecedor → liquidar → recibo | Parcial   | Gateway coberto por `gateway-settlement*.test.ts`; sem sandbox AppyPay |
| Pagamento parcial até fechar                                   | Parcial   | Lógica em `register_payment` lida na produção; sem E2E                 |
| Pagamento por QR                                               | Bloqueado | O fornecedor não emite QR na integração actual                         |
| Reconciliação: importar → corresponder → aprovar               | Por fazer | Vive no PayFlow; não auditado                                          |
| Estorno com motivo e histórico                                 | Parcial   | Função lida e corrigida; sem E2E                                       |
| Contabilidade                                                  | Bloqueado | Projecto em `CONTABILIDADE_PROPOSTA.md`; espera contabilista           |
| Isolamento com duas escolas                                    | Por fazer |                                                                        |
| Navegação sem componentes de outros módulos                    | Parcial   | Testes de fonte, não de ecrã                                           |
| Desktop, tablet, Android, iOS, zoom, teclado                   | Por fazer | Sem Playwright nesta máquina                                           |

## Bloqueios que não dependem de código

1. Aplicar as três migrações na produção, por ordem: `20261024090000`, `20261024100000`, `20261024110000`. Antes, correr a terceira num ramo do Supabase: o SQL não correu em nenhuma base.
2. Contabilista para validar o plano de contas e as regras de lançamento.
3. AppyPay ou EMIS: confirmar se o contrato inclui QR dinâmico.
