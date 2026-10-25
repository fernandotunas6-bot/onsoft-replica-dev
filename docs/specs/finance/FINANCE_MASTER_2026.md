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

## Correcções seguintes (PRs independentes a partir da main)

Cada uma é um PR próprio, para se poder fundir e reverter sozinha.

| Fase | PR   | Regra do prompt         | Defeito                                                                                              | Correcção                                                                                                                   | Migração         |
| ---- | ---- | ----------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1    | #290 | §4.2 Cobrança           | Duas emissões em simultâneo davam duas propinas do mesmo mês                                         | Gatilho com advisory lock por (contrato, mês); «Propinas da turma» em lote, até 60 por pedido                               | `20261025090000` |
| 2    | #295 | §8 Separação de funções | Quem registava uma despesa anulava-a; despesas fora da auditoria                                     | Acima de 50 000 Kz fica «Por aprovar» até um Administrador que não a registou; quem regista não anula; gatilho de auditoria | `20261025100000` |
| 3    | #296 | §4.4 Facturas           | Número da proforma repetido e com o ano UTC                                                          | `FP-AAAA/MMDD-XXXX` com a data de Luanda                                                                                    | —                |
| 4    | #298 | §7 Integrações          | AppyPay confirmado sem valor creditava o total; moeda não verificada                                 | Sem valor positivo em AOA fica «Em revisão»; credita o menor dos dois valores                                               | —                |
| 5    | #299 | §9.2 Tabelas, §13       | Facturas, Caixa e Tesouraria mostravam só as 250 facturas recentes; vencidas antigas não se cobravam | Todas as por pagar entram, em páginas de 1000; as quatro páginas partilham a cache do resumo                                | —                |

## Performance (§13)

Não medida em ambiente real: a sessão local liga à produção. Leitura do código:

- `getFinanceReporting` lê todas as facturas, recibos e despesas da escola em cada abertura e soma no servidor. Pagina por 1000 até 30 000 linhas e diz quando trunca. Com o volume real (uma escola de 42 alunos), cabe numa leitura por tabela. Passar as somas para uma função na base só compensa acima de ~10 000 facturas por escola; fica registado, não feito.
- A Tesouraria pedia o mesmo resumo com outra chave de cache e voltava a lê-lo ao mudar de página. Corrigido no #299.

## Pendências que precisam de decisão

Nenhuma destas se fecha só com código: cada uma escreve na produção, depende de terceiros ou de validação profissional.

1. **Aplicar as migrações**, por esta ordem: `20261024090000` (estorno conta a multa), `20261024100000` (chave de idempotência), `20261024110000` (sessões de caixa, #283), `20261025090000` (propina única, #290) e `20261025100000` (aprovação e auditoria de despesas, #295). O #283 já não prende à sessão uma despesa por aprovar do #295, em qualquer ordem de fusão. Cada uma tem um ensaio em `tests/sql/` que a corre numa base e falha com o defeito que corrige. O código do #276 funciona com ou sem elas, por isso podem ser aplicadas antes ou depois de o publicar. Depois de cada `apply_migration`, renomear o ficheiro para o carimbo registado e conferir o md5 do corpo; a segunda acrescenta uma coluna e um índice a `finance_receipts`, por isso recapturar o retrato.
2. _(Juntou-se à 1.)_
3. **Caixa por posto, com abertura e fecho de sessão.** Proposta em [`CAIXA_SESSOES.md`](CAIXA_SESSOES.md), com quatro decisões pedidas. O saldo em numerário já aparece separado do bancário (#276), mas é o da escola inteira, não o da gaveta.
4. **Estados de pagamento unificados.** Feito na apresentação, sem mudar o modelo: `src/features/finance/payment-states.ts` traduz o estado da fatura, da cobrança do gateway, do recibo e do plano para o registo de estados (ícone e texto além da cor). A base continua com um estado por domínio, como o plano pede («distinguir estado do pagamento, da fatura e da reconciliação»). Fica por decidir só se algum dia se quer uma tabela única de transacções; hoje não há razão para isso.
5. **Contabilidade formal.** Projecto técnico em [`CONTABILIDADE_PROPOSTA.md`](CONTABILIDADE_PROPOSTA.md): modelo, restrições de integridade na base, regras de lançamento indicativas (PGC Angola), cinco fases e quatro decisões pedidas. A primeira é quem valida, porque sem contabilista nada se activa.
6. **QR de pagamento real.** A integração AppyPay suporta hoje referência (`REF`) e Multicaixa Express por telemóvel (`GPO`), ambos reais e confirmados no servidor. Não suporta QR. O QR exige que o fornecedor o emita, com adesão e credenciais por escola. Retirou-se o texto `EMIS|ENT:…|REF:…` que `emiss-multicaixa.ts` montava como «QR»: era um formato inventado, que ninguém desenhava mas que pareceria um QR de pagamento. Para avançar é preciso confirmar com a AppyPay ou a EMIS se o contrato da escola inclui QR dinâmico e qual é a API.
