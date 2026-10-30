# SIGA Plus — Excel financeiro e consulta de recibos (30/10/2026)

## Dependência e âmbito

Ramo `feat/finance-excel-receipts-20261030`, derivado da PR #386 (`feat/accountant-student-lists`).
PR #424 aberta como draft com base nesse ramo, para revisão incremental antes de qualquer integração na `main`.
Não executar migrações de produção, liquidações reais ou deploy durante esta validação.

## Trabalho implementado

- `StudentLedgerPanel`: conserva filtros (nome/processo, nível, curso, classe, turma e situação); acrescenta Excel de todos os filtrados ou apenas seleccionados e atalho ao importador de pagamentos.
- `student-ledger-excel.ts`: ficheiro XLSX com folhas **Alunos**, **Devedores** e **Resumo**; valores monetários numéricos em Kz, processos como texto, prevenção de fórmulas em células textuais e distinção entre **sem faturação** e **pago**.
- `receipt-register-server.ts`: leitura por escola e utilizador autorizado, paginação 25, pesquisa por nome/processo do estudante, número parcial de recibo e número exacto da fatura, filtros de estado/método/datas e relação com estudantes. Não modifica pagamentos ou recibos.
- `ReceiptRegisterPanel.tsx`: tabela/cartões, consulta, ligação à fatura, exportação **da página actual** em CSV, **de todos os filtrados até 2 000 registos** em XLSX e impressão/PDF do recibo a partir do ID real e código de verificação. Recibos anulados têm estado e texto explícitos; anulação a partir da lista usa o estorno financeiro existente com motivo, RBAC e 2FA.
- `receipt-register-filter.ts` e `receipt-register-excel.ts`: validação tipada, escape de wildcards SQL, Excel com folha Recibos e Resumo, totais separados para emitidos/anulados, e protecção contra fórmulas.
- `print-overlays.ts`: documentos financeiros deixam de receber brasão, bandeira e dizeres da República nos campos de identidade do template; mantém-se a marca e contacto da escola.
- `faturas.tsx`: integra pesquisa e lista financeira de forma expansível e com carregamento por demanda.
- `ImportWorkflowWizard.tsx`: aviso antes de confirmar importação de pagamentos, dívidas, propinas e histórico financeiro, porque o importador existente pode gravar faturas e recibos reais.

## O que o utilizador já encontra no repositório e não foi reconstruído

- Motor de importação Excel/CSV com mapeamento, staging, simulação e aprovação; importadores `pagamentos`, `dividas`, `historico_financeiro`.
- Exportação mensal Excel contabilística de faturas, recibos, estornos e despesas.
- Emissão de propinas em lote, validações financeiras, prevenção de duplicados, 2FA, RBAC e operações existentes de estorno/anulação.
- A PR #386 fornece o núcleo das listas financeiras por estudante, necessário para este trabalho.

## Segurança e limites deliberados

- Nenhum recibo é fisicamente eliminado. Anulação explícita delegada ao estorno existente exige motivo (5–300 caracteres), perfil autorizado, 2FA e regista o histórico; nunca uma alteração directa do montante.
- O importador de pagamentos pode liquidar faturas após confirmação definitiva; exigir conferência de comprovativos e evitar usar folhas como prova de pagamento.
- O CSV dos recibos é apenas da página visível; a exportação mensal completa já existe separadamente.
- A pesquisa por estudante é feita antes da paginação e limitada a 20 estudantes e 150 faturas candidatas; consultas amplas pedem refinamento explícito, nunca devolvem totais silenciosamente truncados.
- O XLSX dos recibos com filtro limitado a 2 000 documentos exige nova exportação em caso de alterações concorrentes; acima disso, refinar período. O Excel mensal integral existente continua disponível.
- Não apresentar os documentos internos como fiscalmente certificados pela AGT.
- Não há nova migração SQL nem mudança de RLS.

## Plano de aceitação / CI

1. Executar `npm run typecheck`, `npm run lint`, `npm test -- tests/finance/student-ledger-excel.test.ts tests/finance/receipt-register-excel.test.ts tests/finance/receipt-register-filter.test.ts tests/documents/finance-print-identity.test.ts` e `npm run build`.
2. Validar o importador em staging com dados fictícios e duas escolas distintas, com uma sessão de Tesouraria e outra de Secretaria.
3. Validar múltiplos pagamentos parciais por fatura, recibos válidos e anulados, pesquisa, PDF, CSV e Excel com 100+ alunos.
4. Ensaiar limites, acessibilidade, 360/768/1440px, Excel com acentos e números com zeros iniciais.
5. Conferir exportação de recibos com 2 000 resultados, filtros por aluno e anulação com motivo; verificar que o PDF não usa símbolos oficiais da República.
6. Confirmar que PR #386 está aprovada e integrada primeiro; rebase/merge controlado, não force push. Só publicar em produção quando testes e validações estiverem verdes.

## Estado de execução

Código e testes criados e enviados para a PR #424. Jobs CI lançados pelo GitHub, mas sem conclusão confirmada no momento desta actualização. Sem acesso a sessões reais de duas escolas e sem transacções financeiras. **Não integrar nem publicar enquanto houver testes por validar.**
