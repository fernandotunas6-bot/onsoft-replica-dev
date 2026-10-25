# Financeiro 2026 — relatório final (§18)

**Data:** 25/10/2026. **Referência:** prompt «SIGA Plus Finance 2026». **Estado:** oito PRs abertos, nenhum fundido nem publicado e nenhuma migração aplicada na produção. Desenho e decisões: [`FINANCE_MASTER_2026.md`](../../specs/finance/FINANCE_MASTER_2026.md). Critérios do §17: [`FINANCE_ACCEPTANCE_CHECKLIST.md`](FINANCE_ACCEPTANCE_CHECKLIST.md).

## Cobertura do prompt, secção a secção

Legenda: **Feito** com prova automática · **Parcial** · **Proposto** (desenho escrito, não activado) · **Bloqueado** (depende de terceiros ou de aprovação).

| Secção                        | Estado   | Onde                                                                                                                                                                       |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2 Uma página, uma finalidade | Feito    | #276: atalhos fora do Caixa, um módulo por página, QR de presença em Pedagógica, Conciliação com página própria                                                            |
| §3 Auditoria do estado real   | Feito    | `FINANCE_MASTER_2026.md`, «Matriz rota → funções»                                                                                                                          |
| §4.1 Visão geral              | Parcial  | «Total recebido» com numerário e banco separados (#276); os alertas não foram revistos                                                                                     |
| §4.2 Propinas e cobranças     | Parcial  | Propina única por mês na base e emissão por turma (#290); multas, prestações, bolsas e descontos já existiam; calendário de vencimentos e avisos automáticos não revistos  |
| §4.3 Pagamentos               | Feito    | Estados por domínio (`payment-states.ts`); idempotência manual (#276); importação pela liquidação atómica (#304); AppyPay sem valor confirmado fica em revisão (#298)      |
| §4.4 Facturas                 | Parcial  | Proforma com número único (#296); fatura, proforma e documento fiscal distinguidos (#276); séries e rectificação não mudaram                                               |
| §4.5 Recibos                  | Feito    | Estorno preserva o original, com motivo; estorno conta a multa (#276); verificação por QR `/verificar`                                                                     |
| §4.6 Caixa e tesouraria       | Parcial  | Sessões com abertura, fecho, diferença e aprovação (#283); relatório de fecho (#283); despesas aprovadas acima de 50 000 Kz (#295); **transferências internas não feitas** |
| §4.7 Bancos e reconciliação   | Parcial  | Página Conciliação (#276); a importação não casa por montante (aluno exacto, nº de fatura ou mês); a conciliação bancária vive no PayFlow e **não foi auditada**           |
| §5 Contabilidade              | Proposto | [`CONTABILIDADE_PROPOSTA.md`](../../specs/finance/CONTABILIDADE_PROPOSTA.md); espera contabilista                                                                          |
| §6 QR por finalidade          | Parcial  | QR de verificação e de presença separados; payload «EMIS» inventado retirado (#276); **QR de pagamento bloqueado** (o fornecedor não o emite na integração actual)         |
| §7 Integrações                | Parcial  | Webhooks idempotentes por `external_id`, assinatura verificada; valor e moeda AppyPay (#298); política de tentativas e eventos fora de ordem não revistos                  |
| §8 Multi-tenant e auditoria   | Parcial  | Separação de funções nas despesas e no caixa (#295, #283); despesas em `audit_logs` (#295); IBAN com 2FA e auditoria; **descontos sem limite por papel** (pendência 3)     |
| §9 Design system              | Parcial  | Cabeçalhos e menu «Exportar» (#276); estados com ícone e texto; tabelas com as facturas por pagar todas (#299); modais não revistos                                        |
| §10 Motor de contexto         | Feito    | `access-policy` e matriz no `FINANCE_MASTER_2026.md`                                                                                                                       |
| §11 Integridade (10 regras)   | Feito    | Tabela em `FINANCE_MASTER_2026.md`; ensaios SQL das migrações                                                                                                              |
| §12 Fiscal e AGT              | Feito    | O SIGA não se apresenta como certificado (cartão de Facturas, rodapés, sem «AGT;…»); o SAF-T exporta e valida a estrutura, sem submissão                                   |
| §13 Performance               | Parcial  | Pedidos repetidos entre páginas retirados (#299); **nada medido**                                                                                                          |
| §14 Validação funcional       | Parcial  | Testes unitários e de contrato; quatro ensaios SQL em Postgres; **nenhum E2E**                                                                                             |
| §16 Documentação              | Feito    | `AGENTS.md` «Financeiro», skill `siga-financeiro`, specs e esta pasta                                                                                                      |
| §17 Critérios                 | Parcial  | Checklist                                                                                                                                                                  |

## 1–2. Diagnóstico e problemas confirmados no código

Cada problema foi lido no código, ou na produção só em leitura (24/10). Nenhum foi deduzido.

| Problema                                                                                       | Gravidade | Correcção |
| ---------------------------------------------------------------------------------------------- | --------- | --------- |
| O estorno recalculava a fatura sem a multa e marcava-a paga com dívida                         | Alta      | #276      |
| Repetir o pagamento depois de um tempo esgotado emitia dois recibos                            | Alta      | #276      |
| AppyPay confirmado sem valor creditava o total da cobrança; a moeda não era verificada         | Alta      | #298      |
| A importação de pagamentos pagava sem trancar a fatura, sem a multa, e repetia a folha         | Alta      | #304      |
| Duas emissões em simultâneo davam duas propinas do mesmo mês                                   | Média     | #290      |
| Quem registava uma despesa anulava-a; as despesas não ficavam na auditoria                     | Média     | #295      |
| Facturas, Caixa e Tesouraria mostravam só as 250 recentes: as vencidas antigas não se cobravam | Média     | #299      |
| Número de proforma repetido entre proformas e com o ano UTC                                    | Baixa     | #296      |
| Payload de «QR EMIS» inventado                                                                 | Baixa     | #276      |

Encontrados nas próprias migrações ao corrê-las em Postgres (25/10), antes de chegarem à produção:

- A `20261024100000` falhava ao correr segunda vez.
- O gatilho de caixa distinguia os recibos do gateway por `received_by is null`, mas essa coluna é NOT NULL na produção.
- O bloco DO da `20261025100000` apagava todos os CHECK que mencionassem `status`.

## 3–4. Alterações feitas e propostas

**Feitas:** as dos oito PRs abaixo.

**Propostas mas não executadas:**

- contabilidade (§5);
- QR de pagamento (§6.1);
- transferências internas de caixa (§4.6);
- limite de desconto por papel (§8);
- totais do resumo calculados na base (§13), que só compensam acima de cerca de 10 000 faturas por escola.

## 5–6. Páginas reorganizadas e funcionalidades preservadas

**Reorganizadas** (#276):

- **Caixa:** perdeu os atalhos de importação, PayFlow, relatórios e RH.
- **Facturas:** saiu do grupo «Relatórios».
- **QR de presença docente:** passou para `/pedagogica/presenca-docente`.
- **Conciliação:** nova página, que reúne o AppyPay, a importação de pagamentos e o PayFlow.
- **Relatórios:** um só menu «Exportar».

Nenhuma funcionalidade foi retirada: cada atalho mudou de página, e `access-policy.test.ts` cobre o acesso às rotas novas.

## 7. Testes financeiros

- Testes de contrato e unitários em `tests/finance`, `tests/import` e `tests/security`, a correr no CI de cada PR.
- Quatro ensaios PGlite em `tests/sql/` correm as migrações reais:
  - `payment-integrity`
  - `cash-sessions`
  - `one-tuition-per-month`
  - `cash-expenses-approval`

  Cada um foi confirmado a falhar com o defeito que corrige.

- Localmente, os testes de componentes React falham por um `node_modules` partilhado e desactualizado neste Mac (`useRef` nulo), com ou sem estas alterações. O CI é o portão.

## 8. Testes de navegação

Testes de fonte e de política de acesso (`page-header-area-coherence`, `finance-installed-tools-context`, `access-policy`). Nenhum percurso E2E: os E2E deste projecto correm contra a produção e escrevem nela, e este Mac não corre Playwright.

## 9–10. Evidências visuais e desempenho

**Não produzidas.** A sessão local liga à produção, por isso não há ambiente para as capturas de antes e depois nem para medir LCP, INP e CLS. Falta um ambiente com uma base isolada (por exemplo, um ramo do Supabase).

## 11. Riscos fiscais e de integração

- Facturas e recibos do SIGA são documentos internos. O documento fiscal emite-se no software certificado. O SAF-T exportado não foi submetido nem validado pela AGT.
- O QR de pagamento depende de a AppyPay ou a EMIS o oferecerem no contrato da escola.
- As migrações foram ensaiadas sobre tabelas com as colunas da produção, mas sem as restrições e gatilhos que o repositório não captura. Correr cada uma num ramo do Supabase antes da produção.

## 12. Commits e Pull Requests

| PR   | Base                             | Conteúdo                                                              | Migração                           |
| ---- | -------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| #276 | main                             | Taxonomia, Conciliação, estorno com multa, idempotência, documentação | `20261024090000`, `20261024100000` |
| #283 | `fix/taxonomia-areas-financeiro` | Sessões de caixa e relatório de fecho                                 | `20261024110000`                   |
| #290 | main                             | Propina única por mês e propinas da turma                             | `20261025090000`                   |
| #295 | main                             | Aprovação e auditoria de despesas                                     | `20261025100000`                   |
| #296 | main                             | Número de proforma                                                    | —                                  |
| #298 | main                             | Valor e moeda AppyPay                                                 | —                                  |
| #299 | main                             | Facturas por pagar todas; cache partilhada                            | —                                  |
| #304 | main                             | Importação de pagamentos atómica                                      | —                                  |

## 13. Estado real de publicação

Nada publicado. Nenhum PR fundido. Nenhuma das cinco migrações aplicada. O código de cada PR funciona sem a sua migração, que só activa a regra nova.

## 14. Pendências para aprovação

1. Fundir os PRs. O #283 vai depois do #276, que é a sua base. Com o #283 por fundir, a ordem entre ele e o #295 é indiferente.
2. Aplicar as migrações por ordem, primeiro num ramo do Supabase: `20261024090000`, `20261024100000`, `20261024110000`, `20261025090000`, `20261025100000`. Depois de cada uma, renomear o ficheiro para o carimbo registado e recapturar o retrato.
3. Decidir o limite de desconto por papel (§8). Hoje, a Tesouraria dá até 100 % com 2FA, motivo e auditoria, sem segunda pessoa.
4. Contabilista para a contabilidade (§5).
5. AppyPay ou EMIS para o QR de pagamento (§6.1).
6. Ambiente isolado para os E2E, as capturas e as medições (§14, §18.9–10).
