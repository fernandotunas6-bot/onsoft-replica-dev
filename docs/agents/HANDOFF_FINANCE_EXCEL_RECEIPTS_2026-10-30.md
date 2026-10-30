# SIGA Plus — Excel financeiro e consulta de recibos (30/10/2026)

## Dependência e âmbito

Ramo `feat/finance-excel-receipts-20261030`, derivado da PR #386 (`feat/accountant-student-lists`).
Abrir PR com base nessa branch para uma revisão incremental antes de juntar tudo à `main`.
Não executar migrações de produção, liquidações reais ou deploy durante esta validação.

## Trabalho implementado

- `StudentLedgerPanel`: conserva filtros (nome/processo, nível, curso, classe, turma e situação); acrescenta exportação Excel e atalho para o importador existente.
- `student-ledger-excel.ts`: ficheiro XLSX com folhas **Alunos**, **Devedores** e **Resumo**; valores monetários numéricos em Kz, processos como texto, prevenção de fórmulas em células textuais e distinção entre **sem faturação** e **pago**.
- `receipt-register-server.ts`: leitura por escola e utilizador autorizado, paginação 25, pesquisa por número parcial de recibo e número exacto da fatura, filtros de estado/método/datas e relação com estudantes. Não modifica pagamentos ou recibos.
- `ReceiptRegisterPanel.tsx`: tabela/cartões, consulta, ligação à fatura, exportação **da página actual** em CSV e impressão/PDF do recibo a partir do ID real e código de verificação. Recibos anulados têm estado e texto explícitos.
- `faturas.tsx`: integra pesquisa e lista financeira de forma expansível e com carregamento por demanda.
- `ImportWorkflowWizard.tsx`: aviso antes de confirmar importação de pagamentos/histórico financeiro, porque o importador existente pode gravar faturas e recibos reais.

## O que o utilizador já encontra no repositório e não foi reconstruído

- Motor de importação Excel/CSV com mapeamento, staging, simulação e aprovação; importadores `pagamentos`, `dividas`, `historico_financeiro`.
- Exportação mensal Excel contabilística de faturas, recibos, estornos e despesas.
- Emissão de propinas em lote, validações financeiras, prevenção de duplicados, 2FA, RBAC e operações existentes de estorno/anulação.
- A PR #386 fornece o núcleo das listas financeiras por estudante, necessário para este trabalho.

## Segurança e limites deliberados

- Nenhum recibo é fisicamente eliminado nem se altera um pagamento confirmado pela pesquisa.
- O importador de pagamentos pode liquidar faturas após confirmação definitiva; exigir conferência de comprovativos e evitar usar folhas como prova de pagamento.
- O CSV dos recibos é apenas da página visível; a exportação mensal completa já existe separadamente.
- A consulta inicial de recibos pesquisa por número de recibo e número de fatura. Pesquisa por nome/processo do aluno em todas as páginas exigirá filtro no servidor com paginação e autorização, ainda não implementado.
- Não apresentar os documentos internos como fiscalmente certificados pela AGT.
- Não há nova migração SQL nem mudança de RLS.

## Plano de aceitação / CI

1. Executar `npm run typecheck`, `npm run lint`, `npm test -- tests/finance/student-ledger-excel.test.ts` e `npm run build`.
2. Validar o importador em staging com dados fictícios e duas escolas distintas, com uma sessão de Tesouraria e outra de Secretaria.
3. Validar múltiplos pagamentos parciais por fatura, recibos válidos e anulados, pesquisa, PDF, CSV e Excel com 100+ alunos.
4. Ensaiar limites, acessibilidade, 360/768/1440px, Excel com acentos e números com zeros iniciais.
5. Confirmar que PR #386 está aprovada e integrada primeiro; rebase/merge controlado, não force push. Só publicar em produção quando testes e validações estiverem verdes.
