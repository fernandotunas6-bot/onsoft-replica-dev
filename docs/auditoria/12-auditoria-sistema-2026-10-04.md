# Auditoria 12 — análise completa do sistema (2026-10-04)

**Âmbito:** SIGA (raiz) e a base de produção `xodgfmxiaunpamctfeea`. ADMIN, WEB, DOC e PayFlow só nas
fronteiras. **Método:** verificações corridas no dia; consultas à produção só de leitura, com uma
excepção (secção 3, tempo real), feita a pedido do dono.

## 1. Medições

| Verificação          | Resultado                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit`       | 0 erros                                                                                                           |
| ESLint               | 0 erros, 47 avisos (40 fast refresh, 6 `any`, 1 hook)                                                             |
| Vitest               | 2 872 passam, 19 ignorados, 0 falhas (440 ficheiros)                                                              |
| Ensaios SQL (PGlite) | 6 de 6 passam; passam a correr no CI                                                                              |
| Build de produção    | OK; 4,7 MB de JS em 318 pedaços (maior: 488 KB, 137 KB comprimido)                                                |
| `bun audit`          | 0 altas/críticas; 2 moderadas e 2 baixas indirectas (`esbuild`, `uuid`, `dompurify`)                              |
| CI na `main`         | verde; «Deploy produção» falhou em 44 de 44 execuções (faltam segredos no ambiente `production`)                  |
| Produção             | 49 escolas (43 com nome de teste), 62 contas (3 com 2FA), 45 alunos, 38 facturas, 4 administradores da plataforma |

## 2. Achados

| #   | Sev. | Achado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Estado                                                                                                                                                                                                                  |
| --- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | P0   | 5 migrações aplicadas a 04/10 (22:04–22:15, conta do dono) só existiam no registo da produção.                                                                                                                                                                                                                                                                                                                                                                                                       | **Fechado:** trazidas com `@@corpo-capturado@@`, md5 conferido.                                                                                                                                                         |
| A2  | P0   | Duas migrações mais da mesma noite reescreveram 116 políticas para funções de conjunto (`private.user_*_school_ids`, `teacher_*`, `current_teacher_rows`, `user_import_job_ids`): `20261004222220_rls_set_based_school_access` e `20261004222611_rls_teacher_scope_and_staff_sets` (22:22–22:26). Foram registadas depois da primeira consulta desta auditoria; uma primeira versão deste relatório dizia, por isso, que não tinham registo. O retrato (`PRODUCTION_SNAPSHOT.json`) estava atrasado. | **Fechado:** as duas trazidas com `@@corpo-capturado@@` (md5 conferido); retrato recapturado e 3 testes ajustados (secção 4). A reconciliação provisória `20261005000000` (só as funções, nunca aplicada) foi retirada. |
| A3  | P0   | Publicação automática nunca funcionou (faltam `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_SERVICE_ROLE_KEY`).                                                                                                                                                                                                                                                                                                                                                                         | Aberto: só o dono cria segredos. Rodar antes as chaves expostas no chat.                                                                                                                                                |
| A4  | P1   | O tempo real do PR #69 subscrevia 6 tabelas que a publicação não tinha.                                                                                                                                                                                                                                                                                                                                                                                                                              | **Fechado:** aplicado a 04/10; a publicação tem 10 tabelas.                                                                                                                                                             |
| A5  | P1   | 52 tabelas aceitam escrita do papel `authenticated` sem `is_aal2` (regra 6c). Inclui `siga_assessment_scores`/`siga_assessment_items` e as tabelas da plataforma (`tenants`, `subscriptions`, `plans`, `tenant_domains`, …).                                                                                                                                                                                                                                                                         | Aberto. Decisão do dono (secção 5).                                                                                                                                                                                     |
| A6  | P1   | O fecho de período só é verificado no servidor (`assertAssessmentTermNotLocked`). Os triggers de `siga_assessment_scores` verificam o âmbito do professor, não o fecho: uma escrita directa pela API contorna-o.                                                                                                                                                                                                                                                                                     | Aberto. Deduzido das funções da base; **não ensaiado**.                                                                                                                                                                 |
| A7  | P2   | Os ensaios SQL (`tests/sql/*.mjs`) não corriam no CI.                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Fechado:** passo «Ensaios SQL das migrações (PGlite)» em `ci.yml`.                                                                                                                                                    |
| A8  | P2   | A produção é também a base de testes (43 de 49 escolas).                                                                                                                                                                                                                                                                                                                                                                                                                                             | Aberto: precisa de projecto de staging.                                                                                                                                                                                 |
| A9  | P2   | Duas políticas usavam o perfil global em vez do papel na escola da linha (regra 6d). `finance_gateway_webhook_events` aceitava `profiles.cargo` em ('Administrador','Tesouraria'): um Administrador da escola A que fosse só membro da escola B (p. ex. encarregado) lia os eventos de pagamento de B. `schools` «Administrators can update their own school» comparava o código do papel (`owner`, `admin`…) com `'Administrador'` e nunca dava acesso.                                             | Migração `20261005030000_school_row_role_policies.sql` escrita e ensaiada (o ensaio mostra a fuga antes e o fecho depois), **por aplicar**.                                                                             |
| A10 | P2   | «Hoje» calculado em UTC (`new Date().toISOString().slice(0, 10)`) em 45 sítios: data do pagamento electrónico, da chamada, da matrícula, da emissão e do atraso das facturas. Angola é UTC+1: entre a meia-noite e a 01:00 de Luanda gravava-se a data de ontem.                                                                                                                                                                                                                                     | **Fechado:** `src/lib/school-date.ts` (`schoolTodayIso`, `Africa/Luanda`) em todos os sítios; teste de guarda `tests/lib/school-date.test.ts`.                                                                          |

## 3. O que se aplicou na produção

Uma só alteração, a pedido do dono: `realtime_publish_school_screens`
(`20261004101000_realtime_publish_school_screens.sql`). Só acrescenta `siga_direct_messages`,
`students`, `enrollments`, `enrollment_applications`, `finance_invoices` e `finance_receipts` à
publicação `supabase_realtime`. Ensaiada antes em PGlite (`tests/sql/realtime-package.mjs`);
verificada depois (10 tabelas publicadas). Nada mais foi escrito.

## 4. Retrato recapturado

O retrato de 04/10 à noite (321 políticas, 121 funções `private`, 201 triggers) está em
`supabase/PRODUCTION_SNAPSHOT.json`. Três testes liam a forma antiga e foram ajustados, sem enfraquecer:
`user_member_school_ids()` ≡ `is_school_member()` (membro activo) e
`user_role_school_ids(ARRAY[owner,admin,administrador,secretary,secretaria])` ≡ `is_school_office()`;
a lista de papéis continua sem aluno nem encarregado; a política de branding foi renomeada.

## 4b. A reescrita das 116 políticas preserva a semântica

Verificação mecânica (retrato de 04/10 de manhã contra o da noite): as formas novas foram normalizadas para as antigas
(`private.has_permission(c, x)` ⇄ `c IN (SELECT private.user_permission_school_ids(x))`, `is_school_member`/`is_active_member` ⇄
`user_member_school_ids()`, `is_school_office`/`is_school_admin`/`is_school_finance`/`is_school_staff` ⇄ `user_role_school_ids(ARRAY[...])`
com a mesma lista de papéis; as definições das funções foram conferidas na produção). Das 276 políticas presentes nos dois retratos,
**275 são equivalentes**; a única diferença é a correcção intencional de `enrollment_applications` (a condição
`forms.school_id = forms.school_id` era sempre verdadeira). As 62 → 45 políticas fundidas são o OR das antigas; os ramos de
professor (`private.teacher_*`) ficam sempre dentro de `user_member_school_ids()`, como antes. O ramo «quem não é professor lê
`class_subjects`/`timetable_slots` da escola» já existia.

Fica registado, sem defeito: 38 políticas usam `school_id = current_school_id()`. A função lê a escola activa do cabeçalho
`x-siga-school-id` (validada contra o vínculo) e só sem cabeçalho cai na primeira escola — é escopo à escola activa, por desenho.

## 5. Por aplicar na produção (escritas e ensaiadas, falta a confirmação do dono)

A aplicação pela ferramenta do Supabase foi cancelada duas vezes a 04/10 e expirou duas vezes a 05/10 sem aplicar nada (a confirmação não chega a tempo; verificado na base). Correm no SQL Editor
do projecto `xodgfmxiaunpamctfeea`, por esta ordem (ambas idempotentes):

1. `20261005010000_assessment_closed_term_guard.sql` — **A6.** Trigger em `siga_assessment_items` e
   `siga_assessment_scores`: recusa escritas directas (token de utilizador) quando a pauta da turma é oficial
   (homologated/published/closed/contested, do período ou anual) — a regra de `assertAssessmentTermNotLocked`.
   `service_role` (o servidor, que valida por si) e a manutenção sem sessão não são afectados.
   Ensaio: `tests/sql/assessment-closed-term.mjs`.
2. `20261005020000_direct_writes_require_mfa.sql` — **A5, âmbito curto.** Políticas RESTRICTIVE com
   `private.is_aal2()` em 11 tabelas da plataforma SaaS e nas duas de avaliações. Só entraram tabelas onde se
   verificou que nada escreve com o token do utilizador (código das 5 apps e funções `INVOKER` da base).
   Ensaio: `tests/sql/direct-writes-mfa.mjs`.
3. `20261005030000_school_row_role_policies.sql` — **A9.** Papel pela escola da linha nos eventos de gateway; retira a
   política morta de `schools`. Ensaio: `tests/sql/school-row-role-policies.mjs`.

**Fica de fora de propósito, por exigir inventário:** `profiles`, `notifications`, `siga_chat_*`,
`calendar_feed_tokens` (escritas do próprio utilizador); `staff_module_grants` (`setStaffModuleGrant` usa o
cliente do utilizador — passar para o cliente de serviço antes de exigir 2FA); `hr_*` e estrutura académica
(escritas por RPC `INVOKER` com o token do utilizador). `private.is_aal2()` recusa qualquer sessão sem 2FA
(3 de 62 contas), por isso exigi-lo nestas tabelas partiria fluxos.

## 6. Por decidir

Segredos do ambiente `production` (A3) e projecto de staging (A8).

## 7. Regra que sai disto

Nenhum DDL na produção sem o ficheiro no mesmo commit. Sete migrações numa noite (incluindo a reescrita de
116 políticas), fora do Git, deixaram o retrato e os testes de segurança a descrever uma base que já não existe.
