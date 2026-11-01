# SIGA Plus — Excel financeiro e consulta de recibos (30/10/2026)

## Dependência e âmbito

Ramo `feat/finance-excel-receipts-20261030`, derivado da PR #386 (`feat/accountant-student-lists`).
PR #424 aberta como draft com base nesse ramo, para revisão incremental antes de qualquer integração na `main`.
Não executar migrações de produção, liquidações reais ou deploy durante esta validação.

## Trabalho implementado

- `StudentLedgerPanel`: conserva filtros (nome/processo, nível, curso, classe, turma e situação); acrescenta Excel de todos os filtrados ou apenas seleccionados e atalho ao importador de pagamentos. Permite seleccionar todos os filtrados em várias páginas até 5 000 alunos para relatórios, preservando o limite de 60 apenas na emissão de propinas.
- `student-ledger-excel.ts`: ficheiro XLSX com folhas **Alunos**, **Devedores** e **Resumo**; valores monetários numéricos em Kz, processos como texto, prevenção de fórmulas em células textuais e distinção entre **sem faturação** e **pago**.
- `receipt-register-server.ts`: leitura por escola e utilizador autorizado, paginação 25, pesquisa por nome/processo do estudante, número parcial de recibo, número exacto de fatura e referência externa exacta de pagamento, filtros de estado/método/datas e relação com estudantes. Não modifica pagamentos ou recibos.
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

1. Executar `bun run build`, `bun run typecheck`, `bun run lint`, `npm test -- tests/finance/student-ledger-excel.test.ts tests/finance/receipt-register-excel.test.ts tests/finance/receipt-register-filter.test.ts tests/documents/finance-print-identity.test.ts` e `npm run build`.
2. Validar o importador em staging com dados fictícios e duas escolas distintas, com uma sessão de Tesouraria e outra de Secretaria.
3. Validar múltiplos pagamentos parciais por fatura, recibos válidos e anulados, reimpressão após anulação por outro operador, pesquisa, PDF, CSV e Excel com 100+ alunos.
4. Ensaiar limites, acessibilidade, 360/768/1440px, Excel com acentos e números com zeros iniciais.
5. Conferir exportação de recibos com 2 000 resultados, filtros por aluno e anulação com motivo; simular mudança de escola a meio da exportação e reimpressão; verificar que o PDF não usa símbolos oficiais da República.
6. Validar selecção de mais de 60 alunos para exportação Excel sem poder emitir propinas acima do limite; pesquisa por referência de pagamento externa exacta.
7. Confirmar que PR #386 está aprovada e integrada primeiro; rebase/merge controlado, não force push. Só publicar em produção quando testes e validações estiverem verdes.

## Continuação — lista financeira, selecção e validação (30/10/2026)

- Com 1 ou mais alunos seleccionados, **CSV e XLSX exportam só os seleccionados**; sem selecção, exportam os resultados filtrados. O botão indica o âmbito e quantidade.
- Selecção entre páginas até 5 000 alunos para relatórios. O comando de **emitir propinas mantém o limite de 60 alunos activos da mesma turma**, separado da exportação.
- A barra do painel financeiro foi dividida em grupos acessíveis: importação/exportação, selecção e cobranças/emissão, responsiva e sem remoção de operações.
- Corrigido o teste anterior de 60 estudantes que já não corresponde à nova política; acrescentados testes para 73 seleccionados e para CSV limitado à selecção.
- Detectado e corrigido um atributo JSX de cobrança que tinha perdido o fecho durante a reorganização; Prettier oficial aplicado com êxito na branch.
- O CI completo ainda exige confirmação na versão final após esses ajustes. PR #386 permanece aberta e divergiu da main em 4 commits à frente / 139 atrás na última consulta. Não fundir nem fazer deploy sem reconciliação.

## Estado de execução e segurança (30/10/2026)

- Reimpressão passa pela leitura autenticada por UUID com escola obrigatória, verificando estado, valor, número e fatura actuais. Recibo anulado aparece como anulado; não confiar na cache do browser.
- Exportação Excel multi-página impede mistura entre escolas: confere `schoolId` em todas as páginas e rejeita mudança de totais, duplicados ou mudança de escola.
- A contagem de pagamentos, dívida e estorno continua a derivar dos recibos/lançamentos reais; não foram lançados pagamentos fictícios.
- Estilo: formatter da própria stack (Prettier) aplicado em nove ficheiros, e regex de caracteres nulos alterada para passar o lint.
- Segurança de dependências: `re2js` transitivo do Firebase actualizado **2.8.6 → 2.9.1** apenas em `bun.lock`; `bun audit --audit-level=high` passou sem vulnerabilidades altas/críticas (8 alertas abaixo desse nível). Aviso GHSA-gg6h-894w-4m9c.
- Validação isolada GitHub Actions: build, TypeScript e testes financeiros seleccionados aprovados no commit `4078b941`; confirmar novamente após a actualização de dependências.
- Workflows temporários da formatação, validação e correcção de segurança retirados da branch após utilização.
- Aguardam-se jobs CI completos do head mais recente, testes E2E autenticados em duas escolas e inspeção visual dos PDFs. PR #386 ainda não integrada. **Não integrar nem publicar enquanto houver validações pendentes.**
