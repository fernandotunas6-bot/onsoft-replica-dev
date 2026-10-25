# Financeiro 2026 — uma página, uma finalidade

**Data:** 24/10/2026. **PR:** #276. Complementa [`../modules/finance.md`](../modules/finance.md), que continua a ser a SPEC do módulo; este documento regista a reorganização, a auditoria de integridade e o que fica por decidir.

Regra: cada página do Financeiro mostra só o que serve a sua finalidade. Nenhuma função foi retirada — as que estavam fora do sítio mudaram para a página a que pertencem.

## Estrutura da navegação

| Grupo              | Página                 | Rota                           | Finalidade                                                                |
| ------------------ | ---------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| Caixa e Pagamentos | Tesouraria             | `/tesouraria`                  | Visão geral: saldos, fluxo mensal, faturas por cobrar, últimos movimentos |
|                    | Movimentos de Caixa    | `/financeiro`                  | Entradas, saídas, despesas, estornos de lançamento, planos de pagamento   |
|                    | Faturas e Recibos      | `/faturas`                     | Emissão, proforma, recebimento na linha, recibo, anulação, SAF-T          |
|                    | Bancos e Conciliação   | `/financeiro/conciliacao`      | Cobranças do gateway, importação de pagamentos, conciliação PayFlow       |
| Recursos Humanos   | Vínculos e folha       | `/financeiro/rh*`              | Contratos, folha, ordens de pagamento, faltas, validação de presença      |
| Académico          | Presença docente       | `/pedagogica/presenca-docente` | Emissão do QR de presença do professor                                    |
| Relatórios         | Relatórios Financeiros | `/relatorios/financeiros`      | Análises e exportações                                                    |

## Matriz rota → funções

| Página              | Mostra                                                                                                  | Não mostra (e onde está)                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Tesouraria          | Indicadores, «Cobrar» na fatura pendente                                                                | Cobranças AppyPay e «Conciliar agora» → Conciliação                                                                  |
| Movimentos de Caixa | Exportar, Portal PayFlow do pagador, plano, despesa, anular lançamento; funções instaladas `financeiro` | RH e Folha, Emitir Fatura → barra lateral; Importar e Conciliação PayFlow → Conciliação; funções `faturas` → Faturas |
| Faturas             | Exportar e SAF-T, proforma, emitir; funções instaladas `faturas`                                        | Importar, Portal e Conciliação PayFlow → Caixa / Conciliação; funções `financeiro` → Caixa                           |
| Conciliação         | Importar pagamentos, Conciliação PayFlow, cobranças AppyPay                                             | —                                                                                                                    |
| RH                  | Vínculos, contratos, folha                                                                              | QR de presença → Académico                                                                                           |
| Relatórios          | Indicadores do ano, cobrança mensal, categorias; um menu «Exportar» e partilha do resumo                | Funções instaladas de Faturas e Caixa → nas suas páginas; linha «AGT» inventada → retirada                           |

Testes que trancam a matriz: `tests/ui/page-header-area-coherence.test.ts` (área do breadcrumb igual à da cor, 46 páginas), `tests/ui/finance-installed-tools-context.test.ts` (funções instaladas por módulo, sem atalhos de pagamento em Faturas), `tests/auth/access-policy.test.ts` (Conciliação fechada a aluno e encarregado).

## Fiscal

O SIGA **não é software de facturação certificado pela AGT** (`saft-export.ts`: certificado 0, documentos sem assinatura). A interface deixou de o sugerir: a função «Faturação electrónica», que copiava uma linha `AGT;NIF;Escola;data` sem formato oficial, passou a «Portal do Contribuinte»; o cartão de Faturas diz que estas são documentos de cobrança e conferência; «Validar Estrutura AGT» passou a «Verificar estrutura do XML». Relatórios perdeu o botão «AGT», que copiava a mesma linha com a receita.

## QR Codes (§6)

| QR                       | Onde                                               | Finalidade                                                      | Estado                                                                                                                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verificação de documento | Rodapé de recibos, faturas e documentos académicos | Abre `/verificar?codigo=`; mostra o titular mascarado e o valor | Cumpre: código de ~10¹² combinações, limite de pedidos partilhado. O rodapé dizia «UUID», «Hash» e «Assinatura digital» sem nada que os preenchesse; passou a «Código de verificação», diz que o QR serve para verificar e não para pagar, e os documentos com valor dizem que não são fiscais AGT |
| Presença docente         | `/pedagogica/presenca-docente`                     | Desafio temporário de uso único                                 | Saiu do RH financeiro (fase 1)                                                                                                                                                                                                                                                                     |
| Cartão de acesso         | Portais do aluno e do encarregado, catracas        | Controlo de acesso                                              | Fora do financeiro                                                                                                                                                                                                                                                                                 |
| Pagamento                | —                                                  | —                                                               | Não existe. «Referência EMIS» gera entidade e referência, não QR; perdeu o ícone de QR para não o sugerir                                                                                                                                                                                          |

## Integridade financeira (§11)

Verificado a 24/10/2026 contra `pg_get_functiondef` na produção (só leitura). Pagamento manual e gateway passam pela mesma função, `private.register_payment`.

| Regra                                              | Estado                     | Prova                                                                                                                         |
| -------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Pagamento confirmado aplicado uma só vez (gateway) | Cumpre                     | Índice único `finance_receipts_school_external_id_key` presente na produção; leitura do evento anterior por `external_id`     |
| Recibo único por liquidação (gateway)              | Cumpre                     | O mesmo índice; `receipt_number` único por escola                                                                             |
| Pagamento parcial actualiza o saldo                | Cumpre                     | `register_payment`: fatura trancada `FOR UPDATE`, soma dos recibos `issued`, recusa excesso                                   |
| Estorno preserva o original                        | Cumpre                     | Recibo passa a `reversed` com autor, data e motivo; nada é apagado                                                            |
| Fatura anulada não é liquidada                     | Cumpre                     | `register_payment` só aceita `open` e `partially_paid`                                                                        |
| Precisão monetária                                 | Cumpre                     | `numeric(18,2)` na base                                                                                                       |
| Isolamento por escola                              | Cumpre                     | Todas as leituras e escritas filtram `school_id`; AAL2 e `has_permission`                                                     |
| Estorno recalcula o saldo correctamente            | **Corrigido, por aplicar** | O estorno ignorava a multa. Migração `20261024090000_reverse_receipt_counts_late_fee.sql`; 0 faturas afectadas na produção    |
| Falha de rede não duplica (manual)                 | **Corrigido, por aplicar** | Chave de idempotência por tentativa. Migração `20261024100000_register_payment_idempotency_key.sql`; sem ela, paga como antes |

## Pendências que precisam de decisão

Nenhuma destas se fecha só com código: cada uma escreve na produção, depende de terceiros ou de validação profissional.

1. **Aplicar as duas migrações**, por esta ordem: `20261024090000` (estorno conta a multa) e `20261024100000` (chave de idempotência). O código do #276 funciona com ou sem elas, por isso podem ser aplicadas antes ou depois de o publicar. Depois de cada `apply_migration`, renomear o ficheiro para o carimbo registado e conferir o md5 do corpo; a segunda acrescenta uma coluna e um índice a `finance_receipts`, por isso recapturar o retrato.
2. _(Juntou-se à 1.)_
3. **Caixa por posto, com abertura e fecho de sessão.** Proposta em [`CAIXA_SESSOES.md`](CAIXA_SESSOES.md), com quatro decisões pedidas. O saldo em numerário já aparece separado do bancário (#276), mas é o da escola inteira, não o da gaveta.
4. **Estados de pagamento unificados** (iniciado, a aguardar, confirmado, falhado, cancelado, reembolsado). Hoje a fatura tem `open/partially_paid/paid/cancelled`, a cobrança do gateway tem os seus, e o recibo `issued/reversed`. Unificar é decisão de modelo.
5. **Contabilidade formal** (plano de contas, diário, razão, balancete). Não existe núcleo contabilístico — só tesouraria. Exige projecto técnico e validação de contabilista (PGC Angola).
6. **QR de pagamento real.** Depende de adesão e credenciais EMIS/AppyPay por escola; não se gera QR sem o fornecedor.
