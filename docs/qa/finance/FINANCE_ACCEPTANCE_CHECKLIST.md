# Lista de aceitação — Financeiro SIGA Plus

**Data:** 25/10/2026 · **Contexto:** [Finance Master 2026](../../specs/finance/FINANCE_MASTER_2026.md) ·
[matriz de contexto](../../specs/finance/FINANCE_ROUTE_CONTEXT_MATRIX.md)

Estado honesto por item: **✅ verificado neste ciclo** · **☐ por validar** · **✖ bloqueado por
lacuna documentada**. Nenhum item é marcado verificado sem teste ou evidência.

## A. Contexto das páginas

| #   | Critério                                                            | Estado | Evidência                                          |
| --- | ------------------------------------------------------------------- | ------ | -------------------------------------------------- |
| A1  | `/financeiro` não monta ferramentas instaladas de `faturas`         | ✅     | `tests/finance/route-context-matrix.test.ts`       |
| A2  | `/financeiro` não apresenta acções de folha salarial                | ✅     | idem                                               |
| A3  | `/faturas` pertence ao grupo Financeiro                             | ✅     | idem                                               |
| A4  | `/faturas` não monta ferramentas instaladas de `financeiro`         | ✅     | idem                                               |
| A5  | `/faturas` não importa pagamentos nem abre o portal do pagador      | ✅     | idem                                               |
| A6  | `/financeiro/rh` não emite QR de presença docente                   | ✅     | idem + `tests/routes/financeiro-rh.test.tsx`       |
| A7  | `/financeiro/rh/aulas` emite o QR de presença na sua própria página | ✅     | idem + `tests/routes/financeiro-rh-aulas.test.tsx` |
| A8  | `/financeiro/rh/aulas` não apresenta totais de folha salarial       | ✅     | `tests/finance/route-context-matrix.test.ts`       |
| A9  | Varrimento automático de todas as rotas financeiras contra a matriz | ☐      | requer render autenticado por papel                |

## B. Preservação funcional

| #   | Critério                                                                   | Estado | Evidência                                   |
| --- | -------------------------------------------------------------------------- | ------ | ------------------------------------------- |
| B1  | Emissão de QR de check-in continua a funcionar após a mudança de página    | ✅     | `tests/routes/financeiro-rh-aulas.test.tsx` |
| B2  | Emissão de QR de check-out continua a funcionar                            | ✅     | idem                                        |
| B3  | Estado vazio e erro de ocorrências preservados                             | ✅     | idem                                        |
| B4  | Folha salarial, indicadores de RH e contingência de esquema preservados    | ✅     | `tests/routes/financeiro-rh.test.tsx`       |
| B5  | Importação de pagamentos continua acessível em `/importar` e `/financeiro` | ✅     | `src/routes/financeiro.tsx` mantém o atalho |
| B6  | Portal PayFlow continua acessível em `/financeiro`                         | ✅     | idem                                        |
| B7  | Navegação institucional expõe a nova página de assiduidade docente         | ✅     | `tests/auth/navigation-catalog.test.ts`     |

## C. Integridade financeira

| #   | Critério                                                     | Estado                                        |
| --- | ------------------------------------------------------------ | --------------------------------------------- |
| C1  | Pagamento confirmado não é aplicado duas vezes               | ☐                                             |
| C2  | Recibo não é emitido duas vezes para a mesma liquidação      | ☐                                             |
| C3  | Pagamento parcial actualiza correctamente o saldo            | ☐                                             |
| C4  | Estorno preserva a operação original                         | ☐                                             |
| C5  | Webhook repetido não cria nova receita (idempotência)        | ☐                                             |
| C6  | Mudança de escola não reutiliza dados financeiros em cache   | ☐                                             |
| C7  | Factura anulada não é liquidada                              | ☐                                             |
| C8  | Saldos de caixa, bancos e contas a receber diferenciados     | ✖ sem tabelas de banco nem de sessão de caixa |
| C9  | Operações não confirmadas não aparecem como receita recebida | ☐                                             |
| C10 | Precisão monetária sem ponto flutuante não controlado        | ☐                                             |

## D. QR Code por finalidade

| #   | Critério                                                                    | Estado                             |
| --- | --------------------------------------------------------------------------- | ---------------------------------- |
| D1  | QR de presença separado do QR de pagamento no produto                       | ✅ `/financeiro/rh/aulas` dedicada |
| D2  | QR de presença com token opaco, validade curta e uso único                  | ✅ comportamento preservado        |
| D3  | Leitura de QR de pagamento nunca tratada como confirmação                   | ☐                                  |
| D4  | QR de pagamento emitido ou autorizado pelo provedor, verificado no servidor | ☐                                  |
| D5  | QR documental sem expor dados privados do aluno                             | ☐                                  |
| D6  | Nenhum QR interno apresentado como QR fiscal certificado pela AGT           | ☐                                  |

## E. Segurança multi-tenant

| #   | Critério                                                                           | Estado            |
| --- | ---------------------------------------------------------------------------------- | ----------------- |
| E1  | Isolamento por escola em todas as operações financeiras                            | ☐                 |
| E2  | Operações sensíveis exigem AAL2                                                    | ☐                 |
| E3  | Estorno, desconto extraordinário e alteração bancária com autorização proporcional | ☐                 |
| E4  | Aluno e encarregado consultam apenas o próprio âmbito                              | ☐                 |
| E5  | Separação de funções entre registo e aprovação de despesa                          | ✖ por implementar |

## F. Fiscal e AGT

| #   | Critério                                                                               | Estado                         |
| --- | -------------------------------------------------------------------------------------- | ------------------------------ |
| F1  | Nenhuma certificação AGT afirmada no produto                                           | ☐ a varrer em toda a interface |
| F2  | Estados do documento distinguidos (interno/exportação/válido/enviado/aceite/rejeitado) | ✖ por implementar              |
| F3  | Nenhuma submissão fiscal real durante testes                                           | ☐                              |

## G. Contabilidade

| #   | Critério                                                              | Estado                         |
| --- | --------------------------------------------------------------------- | ------------------------------ |
| G1  | Movimentos de caixa não apresentados como lançamentos contabilísticos | ☐                              |
| G2  | Plano de contas, diário, razão e balancete                            | ✖ ausentes na base de produção |
| G3  | Débitos iguais a créditos em cada lançamento                          | ✖ sem núcleo contabilístico    |
| G4  | Fecho de período bloqueado com inconsistências                        | ✖ sem núcleo contabilístico    |

## H. Desempenho

| #   | Critério                                              | Estado                                                                             |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| H1  | INP ≤ 200 ms no p75 nas rotas financeiras             | ☐ não medido                                                                       |
| H2  | LCP ≤ 2,5 s no p75                                    | ☐ não medido                                                                       |
| H3  | CLS ≤ 0,1 no p75                                      | ☐ não medido                                                                       |
| H4  | Nenhuma rota financeira carrega dados de outro módulo | ☐ parcial: `/financeiro/rh/aulas` deixou de carregar o dashboard de RH e as folhas |

## Regra de conclusão

O trabalho não é declarado concluído enquanto existir item **✖** sem decisão registada do
proprietário, ou item **☐** crítico nas secções C, D ou E. A conclusão depende de evidência, não
de afirmação do agente.
