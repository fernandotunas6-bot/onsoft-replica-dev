# SIGA Plus — Auditoria de funcionalidades (22/10/2026)

**Base:** `main` @ `fdf6d95` (security(school-site): refuse websites for non-active schools #216).
**Tipo:** código + verificações locais + CI/GitHub + base de produção `Sga` em **só leitura**
(metadados, privilégios e contagens aproximadas `pg_stat_user_tables`; nenhum dado pessoal lido,
nada escrito). Continua a [auditoria 15](./15-auditoria-360-2026-10-19.md).

## Resumo

O código está saudável: compila, passa nos testes e não tem funcionalidades a meio na interface.
O problema está **fora do código**: nada do que foi feito desde 12/10 chegou aos utilizadores,
duas correcções de segurança vivem fora da `main`, e metade dos módulos nunca foi usada numa escola.

## 1. Verificações executadas nesta auditoria

| Verificação                                                    | Resultado                                                                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `vitest run` (sem `.env`, sem chaves Supabase no ambiente)     | **3979 aprovados**, 19 ignorados, 0 falhas (581 ficheiros)                                            |
| `tsc --noEmit`                                                 | Limpo (precisa de `--max-old-space-size=8192`; com a memória por omissão aborta por falta de memória) |
| `eslint .`                                                     | 0 erros, 47 avisos                                                                                    |
| `siga:check` (catálogo de módulos + navegação)                 | OK — 18 módulos, 13/13 testes de navegação                                                            |
| CI da `main` em `fdf6d95`                                      | Sucesso                                                                                               |
| Marcadores "em breve" / "não implementado" / TODO na interface | Nenhum funcional (só textos legítimos, ex. "expira em breve")                                         |
| Botões desactivados fixos                                      | Só por permissão (ex. "Emitir fatura" sem acesso) — correcto                                          |
| Código que consulta tabelas inexistentes                       | Nenhuma (`avatars` é bucket de Storage)                                                               |
| Migrações repo vs produção                                     | Alinhadas, **excepto** a deriva do ponto F-02                                                         |

## 2. Constatações

| ID   | Nível  | Constatação                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidência                                                                                                                                                |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | **P1** | **Publicação parada desde 12/10.** Os deploys #162–#165 e "Publicar website ISPAB" #19–#21 falham todos. Cerca de 20+ PRs fundidos nunca chegaram à produção (incluindo #216, de segurança).                                                                                                                                                                                                                                                          | Run 39710126409: `wrangler pages deploy … siga-docs` falha; run 39706999706: `Invalid access token [code: 9109]`. Mesma causa da AUD360-01 e da PR #209. |
| F-02 | **P1** | **Produção à frente da `main`.** A migração `20261014121549 teacher_scope_and_treasury_reads` (professor só lê as suas turmas; tesouraria sem notas) está aplicada em produção, mas só existe no ramo `fix/rls-teacher-scope-2026-10-14` (PR #139, aberta). Uma futura migração gerada a partir da `main` pode reabrir a falha.                                                                                                                       | `list_migrations` vs `supabase/migrations/`.                                                                                                             |
| F-03 | **P2** | **Funções de horário chamáveis directamente.** `create_/update_timetable_slot_guarded` têm `EXECUTE` para `authenticated` e aceitam `p_actor` do cliente. São `SECURITY INVOKER`, por isso a RLS continua a aplicar-se — o risco é **falsificar `created_by`/`updated_by`**, não escrever fora das permissões. Corrigido na PR #144 (aberta, não aplicada), que também resolve o falso "sala ocupada" com salas genéricas ("Sala", "A definir").      | `has_function_privilege` em produção; `20261014140000_timetable_guard_alignment.sql` na PR #144.                                                         |
| F-04 | **P2** | **Módulos sem qualquer uso em produção** (≈0 registos): presenças (`attendance_sessions/records`), RH e folha (`hr_contracts`, `hr_payroll_runs`), pagamentos online (`payment_gateway_charges`; D1 PayFlow vazio segundo #209), tarefas, exames, bolsas, lista de espera, BigBlueButton, alumni, blog/contactos do website, catracas, casos de risco, documentos emitidos. Estão testados em unidade, mas **nunca foram exercidos com dados reais**. | `pg_stat_user_tables` (estimativas).                                                                                                                     |
| F-05 | **P2** | **Uso real é pequeno e concentrado:** 49 escolas/tenants, mas ≈85 alunos, 76 matrículas, 48 turmas, 9 professores, 38 facturas, 31 recibos, 198 tempos de horário, 120 boletins. Muitas escolas devem ser de teste/demonstração — convém marcá-las para não distorcer métricas.                                                                                                                                                                       | idem                                                                                                                                                     |
| F-06 | **P2** | **34 PRs abertas**, várias com conflitos declarados no título (#210 "18 conflitos", #211/#212 colidem com #148). Funcionalidades prometidas ficam presas: numeração de alunos (#148), entregas PDF e transporte (#132 — tabelas ainda ausentes), bolsas/lista de espera/turnos (#87).                                                                                                                                                                 | GitHub.                                                                                                                                                  |
| F-07 | **P2** | Avisos de segurança iguais a 19/10: protecção de passwords comprometidas desactivada; 18 funções `SECURITY DEFINER` chamáveis — 17 são auxiliares de RLS só de leitura (esperado); `merge_school_subjects` foi inspeccionada e exige login, 2FA e permissão `academic.subjects.manage` (correcto).                                                                                                                                                    | Advisor + `pg_get_functiondef`.                                                                                                                          |
| F-08 | P3     | `tsc` aborta por memória com as opções por omissão. Passa no CI, mas em máquinas com pouca RAM o `npm run typecheck` falha sem erro de tipos.                                                                                                                                                                                                                                                                                                         | Exit 134 local.                                                                                                                                          |

## 3. Matriz por módulo

"Código" = implementado e testado em unidade. "Em uso" = tem dados em produção.
Nenhum módulo tem prova E2E autenticada (continua a faltar staging — AUD360-02/03).

| Módulo                              | Código                        | Em uso                        | Observação                   |
| ----------------------------------- | ----------------------------- | ----------------------------- | ---------------------------- |
| Criação de escola / SaaS            | ✅                            | ✅ 49 tenants                 | @live nunca correu           |
| Pessoas, alunos, encarregados       | ✅                            | ✅                            | —                            |
| Turmas, matrículas, horários        | ✅                            | ✅                            | F-03 pendente                |
| Pautas, notas, boletins             | ✅                            | ✅ parcial                    | `grade_sheet_versions` vazio |
| Presenças (alunos e docentes)       | ✅                            | ❌                            | nunca usado                  |
| Financeiro: facturas e recibos      | ✅                            | ✅                            | —                            |
| Pagamentos online (AppyPay/PayFlow) | ✅ (só activa se configurado) | ❌                            | nunca processou um pagamento |
| RH, salários, folha                 | ✅                            | ❌                            | nunca usado                  |
| Documentos / secretaria             | ✅                            | ⚠️ 2 pedidos, 0 emitidos      | —                            |
| Comunicações, avisos, chat          | ✅                            | ✅                            | —                            |
| Planos de aula, tarefas, exames     | ✅                            | ⚠️ 3 planos; 0 tarefas/exames | —                            |
| Alumni                              | ✅                            | ❌                            | nunca usado                  |
| Website escolar e blog              | ✅ (muito trabalho recente)   | ❌                            | não publicado (F-01)         |
| Catracas / acessos físicos          | ✅                            | ❌                            | nenhum dispositivo           |
| Ensino superior (pautas, histórico) | ✅                            | n/d                           | —                            |
| Transporte, entregas PDF            | ❌ na `main`                  | ❌                            | PR #132                      |

## 4. Acções por ordem

1. **Token Cloudflare** (dono da conta): novo token com Pages/Workers/D1 → Edit, actualizar
   `CLOUDFLARE_API_TOKEN`, relançar o deploy. Desbloqueia F-01 de uma vez.
2. **Fundir a PR #139** na `main` (a migração já está em produção — só alinha o repositório).
3. **Decidir a PR #144**: ensaiar a migração e aplicar; fecha F-03 e o falso conflito de sala.
4. **Triagem das 34 PRs**: fundir, fechar ou rebasear; resolver primeiro #148 (bloqueia #211/#212).
5. **Piloto real** dos módulos sem uso (presenças, RH, pagamentos online) numa escola de teste
   — idealmente com staging (AUD360-03).
6. Activar a protecção de passwords comprometidas no Supabase Auth.
7. Opcional: `NODE_OPTIONS=--max-old-space-size=8192` no script `typecheck`.

## 5. Limites

Sem staging nem sessão autenticada: nada aqui prova que um fluxo funciona de ponta a ponta no
browser. As contagens são estimativas do Postgres. Não foi feito deploy, migração nem alteração
de configuração.

## 6. Segunda passagem — fluxos em uso (22/10, tarde)

Revisão de código dos fluxos com dados reais, confirmada contra as funções em produção
(`pg_get_functiondef`, só leitura) e contra o build de produção (`bun run build`).

| ID   | Nível  | Constatação                                                                                                                                                                                                                                                                                                                                                                                                                     | Evidência                                                                                                                                                           |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-09 | **P2** | **Multa indevida na confirmação manual Multicaixa.** `confirmManualMulticaixaPayment` não recebe a data do pagamento; `recordInvoicePayment` usa `paidOnIso(undefined)` = hoje. Se a família pagou dentro da tolerância e a tesouraria confirma depois, `private.late_fee_due` aplica a multa. Além disso o cartão volta a gerar a referência ao abrir, já com a multa de hoje, e é esse valor (não o pago) que fica no recibo. | `src/features/finance/server.ts:952-1003`, `late-fee.ts:84`, `PaymentReferenceCard.tsx:59`. Correcção pequena: campo opcional `paidAt` no esquema e na confirmação. |
| F-10 | P3     | A referência Multicaixa confirmada não fica no recibo (só na descrição do arquivo). Em pagamentos parciais, a mesma referência pode ser confirmada duas vezes sem aviso; a conciliação depende de ler texto livre.                                                                                                                                                                                                              | `register_payment` não recebe referência; `finance_receipts` sem coluna para ela.                                                                                   |
| F-11 | P3     | **Verificação pública de documentos sem índice.** `verifyIssuedDocument` procura `audit_logs` por `action` + `metadata->>'code'`; não há índice para isso, logo cada pedido percorre ~15,8 mil linhas (e a tabela só cresce). Tem limite por IP, por isso não é urgente. Sugestão: índice parcial `((metadata->>'code')) WHERE action = 'documents.issued'`.                                                                    | `pg_indexes` de `audit_logs`; 7 documentos emitidos e verificáveis.                                                                                                 |
| F-12 | info   | O "bypass" de limites de pedidos (`isRateLimitBypassed`) aceita valores do cliente que contenham `siga-plus.test`. **No build de produção o código é removido** (`NODE_ENV` substituído estaticamente; nem `siga-plus.test` nem `SIGA_E2E_LIVE` aparecem em `.output/server`). Só é activo em builds de desenvolvimento — não usar `build:dev` em nada público.                                                                 | grep em `.output/server`.                                                                                                                                           |

**Verificado e correcto:**

- `private.register_payment`: bloqueia a factura (`FOR UPDATE`), exige 2FA e
  `finance.payments.create`, valida o saldo e numera o recibo atomicamente.
- Regra da multa coerente entre a referência (`electronic`) e o registo (`multicaixa` → `card`).
- `cancelInvoice`: 2FA, recusa facturas com recibos, actualização condicional ao estado lido.
- Matrícula pública: limite partilhado de 10/h por IP, formulário aberto e escola activa
  verificados em leitura e em submissão, curso validado contra a escola.
- **AUD360-11 fechado:** e-mails reservados (`.test`, `.example`…) só dispensam confirmação
  com `isIsolatedSignupTestTarget` (`canUseReservedSignupEmail`).
- RLS do professor (F-02): a política com `user_wide_reader_school_ids` está activa em
  `students_read`, `people_read` e `enrollments_read` na produção.

**PR #139 ensaiada:** fundida localmente sobre `main` @ `fdf6d95`. Um único conflito, em
`docs/agents/SIGA_confirmar_migracoes.sql` (manter as duas sondas). Resultado: `tsc` limpo,
**4001 testes aprovados** (586 ficheiros), eslint 0 erros. O nome da migração na PR
(`20261014121549`) coincide com o aplicado em produção. Nada foi enviado.
