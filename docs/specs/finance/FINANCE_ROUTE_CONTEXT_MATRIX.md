# Matriz de contexto por rota — Financeiro

**Data:** 25/10/2026 · **Lei:** UMA PÁGINA = UMA FINALIDADE
**Guardado por:** `tests/finance/route-context-matrix.test.ts`
**Contexto:** [Finance Master 2026](FINANCE_MASTER_2026.md)

Esta matriz é normativa. Navegar para uma página vizinha é permitido em qualquer rota;
**apresentar o conteúdo dessa página na rota actual não é.** O cabeçalho global, o selector de
escola, o perfil e a navegação institucional pertencem à estrutura geral da aplicação e não
contam como conteúdo de outro módulo.

## Rotas existentes

| Rota                        | Finalidade única                  | Pode apresentar                                                                                                                                                                    | Não deve apresentar                                                                                                             |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/financeiro`               | Caixa e pagamentos                | Movimentos de caixa, entradas e saídas, métodos de pagamento, despesas, planos de prestações, anulação com histórico, exportações do caixa, ferramentas instaladas de `financeiro` | Folha salarial, emissão de facturas, QR de presença, ferramentas instaladas de `faturas`, configuração académica                |
| `/faturas`                  | Documentos de cobrança            | Facturas emitidas, vencimento, valor, estado de liquidação, emissão de factura e proforma, anulação, exportação e SAF-T AO, ferramentas instaladas de `faturas`                    | Importação de extractos de pagamento, portal do pagador, folha salarial, QR de presença, ferramentas instaladas de `financeiro` |
| `/financeiro/rh`            | Resumo de RH e folha salarial     | Vínculos, contratos, indicadores de RH, histórico de folhas salariais                                                                                                              | Emissão de QR de presença, conciliação bancária, emissão de propinas, movimentos de caixa                                       |
| `/financeiro/rh/aulas`      | Assiduidade docente e QR de aula  | Ocorrências de aula, estado da aula, estado de presença, emissão de QR de check-in e check-out, validade do desafio                                                                | Totais de folha salarial, facturas, liquidações, movimentos de caixa                                                            |
| `/financeiro/rh/presenca`   | Política de validação de presença | Geofence, janelas temporais, score de confiança, evidências recentes                                                                                                               | Emissão de QR, folha salarial, conciliação bancária                                                                             |
| `/financeiro/rh/faltas`     | Faltas e assiduidade de pessoal   | Fila de revisão de faltas, classificação e motivo                                                                                                                                  | Conciliação bancária, emissão de propinas, facturação                                                                           |
| `/financeiro/rh/folha`      | Processamento da folha            | Competência, cálculo, componentes, estados da folha                                                                                                                                | Emissão de propinas, QR de presença, facturação                                                                                 |
| `/financeiro/rh/salarios`   | Alterações salariais              | Histórico versionado de alterações e respectiva autorização                                                                                                                        | QR de presença, facturação, movimentos de caixa                                                                                 |
| `/financeiro/rh/pagamentos` | Ordens de pagamento de RH         | Lotes, destinos e itens de pagamento de folha                                                                                                                                      | Propinas, facturas de aluno, QR de presença                                                                                     |
| `/relatorios/financeiros`   | Análises e exportações            | Agregados, séries, comparações, exportações                                                                                                                                        | Formulários de emissão, registo de pagamento, QR de presença                                                                    |

## Rotas propostas (não existem ainda)

Só a criar depois de mapear função a função no código actual, sem duplicar menus. Ver
[secção 5 do Finance Master](FINANCE_MASTER_2026.md#5-proposto-e-não-executado).

| Rota proposta        | Finalidade única                                 | Não deve apresentar                                      |
| -------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Propinas e cobranças | Planos, obrigações, vencimentos e dívida         | Liquidações, folha salarial, lançamentos contabilísticos |
| Pagamentos           | Transacções, estados e QR de pagamento           | Folha salarial, QR de presença, matrículas               |
| Recibos              | Comprovativos emitidos e estorno com histórico   | Configuração de turmas, folha salarial                   |
| Bancos e conciliação | Contas, movimentos importados e correspondências | Folha salarial, QR de presença                           |
| Contabilidade        | Contas, lançamentos e períodos                   | QR de presença, matrículas, folha salarial               |

## Regra de verificação

Antes de acrescentar um painel, cartão, atalho de cabeçalho ou `InstalledModuleTools` a uma
rota financeira:

1. A finalidade da rota, nesta matriz, cobre o que o elemento faz? Se não, o elemento pertence a
   outra rota.
2. O elemento é navegação para outra página, ou conteúdo dessa página? Navegação é aceitável;
   conteúdo não.
3. `InstalledModuleTools` só com o módulo da própria página.
4. Acrescentar a asserção correspondente a `tests/finance/route-context-matrix.test.ts`.
