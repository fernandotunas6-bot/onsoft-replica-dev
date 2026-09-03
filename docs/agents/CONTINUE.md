# Handoff — continuar o SIGA

Ler isto **antes** de alterar código. Ecossistema (4 apps):
[ARCHITECTURE_HARMONIZATION.md](./ARCHITECTURE_HARMONIZATION.md).
Depois abrir o skill do módulo em `.cursor/skills/`.

## Estado (2026-09-03)

Referência de arquitectura canónica para agentes: Prompt Mestre Enterprise completo (Fases 1–15) + Ciclos 50 (Import/Export Engine) e 51 (Zoom Meetings).
861/861 testes passando em 120 ficheiros de teste no repositório com 100% de sucesso.
### Ciclo 52 — Sincronização GitHub, Visual de Matrículas e Ecossistema PayFlow (2026-09-03)

- **Sincronização & Fusão Remota:** Consolidação limpa dos ramos `feature/education-workflow-ui` (PR #6) e `feat/payflow-integration-production` (PR #7) com 15 importadores oficiais do motor SIGA Exchange e zero conflitos.
- **Fluxo Visual & Validação de Matrículas:**
  - `EducationWorkflowVisual.tsx` integrado no fluxo de pessoas e matrículas (`StudentEnrollmentSheet.tsx` e `PersonWizardModal.tsx`).
  - Suporte ao território angolano (21 províncias em `lib/angola-territory.ts`).
  - Alerta de lotação máxima preenchida (`enrolled_count >= capacity`) com confirmação de matrícula extraordinária e selo visual *Sobrelotação*.
  - Filtros contextuais hierárquicos: Ano Lectivo → Curso → Classe → Turno → Sala → Turma com occupancy indicators.
  - Validação estrita de ano lectivo no importador de matrículas (`matriculas-importer.ts`).
  - Modal extensivo do aluno (`StudentExtensiveModal.tsx`) na listagem de alunos com suporte a emissão directa do Cartão Digital do Aluno (`QrCode`).
- **Ecossistema PayFlow (`painel/payflow`):**
  - Aplicação compilada em modo de produção via Vinext/Cloudflare Workers (18 endpoints de API e 4 páginas de checkout/portal).
  - Verificação de transferências bancárias com IBAN angolano (validação ISO mod-97), SSO assinado e RBAC administrativo.
  - Abstração de ambiente `lib/cf-env.ts` compatível com Workers e testes locais Node.js.
  - Links de navegação e atalhos rápidos integrados nas telas de `src/routes/faturas.tsx` e `src/routes/financeiro.tsx`.
- **Validação:** 900/900 testes Vitest passando no monorepo (128 ficheiros) + 16/16 testes PayFlow passando. Todas as 4 aplicações (SIGA, WEB, ADMIN, PAYFLOW) compilam com 100% de sucesso.

### Ciclo 51 — Zoom End-to-End Meeting Integration (2026-09-03)

- **Rota OAuth Callback:** `src/routes/api/integrations/zoom/callback.tsx` implementada para TanStack Start com validação de `code`/`state`, persistência segura de tokens e tratamento gracioso de erros.
- **Definições & Integrações:** `ZoomIntegrationCard.tsx` integrado em `settings-integrations-panel.tsx` com `startZoomOAuth`, visualização de conta e `disconnectZoom`.
- **Aulas Online:** `ZoomMeetingButton.tsx` integrado no painel do professor (`TeacherWorkspacePanel.tsx`) ligado a `siga_attendance_sessions` e `siga_lesson_meetings`. Regra cumprida: **Título da Aula = título da aula (sem "Zoom")**.
- **Testes:** `tests/integrations/zoom-integration.test.ts` (53/53 testes de integrações verdes).

### Ciclo 50 — SIGA Data Import & Export Engine (2026-09-03)

- **Catálogo Mestre de Campos:** `field-catalog.ts` com aliases angolanos/internacionais tolerantes a acentos (`foldForCompare`) e preposições (`stripStopWords`).
- **Resolvedor Relacional em Grafo:** `reference-resolver.ts` converte chaves humanas em UUIDs de `people`, `students`, `class_groups` e `subjects` sem expor identificadores técnicos.
- **Modelos Oficiais Excel (.xlsx):** `excel-template-builder.ts` com 6 abas padronizadas (`LEIA-ME`, `DADOS`, `EXEMPLOS`, `LISTAS`, `REFERENCIAS`, `METADADOS`).
- **Motor de Exportação Reimportável:** `export-engine.ts` com manifesto oficial `SIGA-EXCHANGE`, versão 1.0 e checksum SHA-256 para reimportação idempotente.
- **Interface /importar:** Painel de exportação `SchoolDataExportPanel.tsx` e 4 abas integradas na rota.
- **Testes:** `tests/import/` com 45/45 testes verdes (incluindo o teste de ciclo bidirecional).

### Ciclo 49 — Identidade Enterprise: Multi-Tenant, RBAC, Convites, Performance (2026-08-30 / 2026-08-31)

Prompt Mestre Enterprise — 15 fases concluídas e verificadas (684/684 testes passando em 100 ficheiros).

#### Fase 2 — Auth & Profiles DDL (`APPLY_IN_SQL_EDITOR.sql`)
- `public.profiles`: colunas `phone`, `first_name`, `last_name`, `full_name`, `preferred_name`, `avatar_url`, `avatar_path`, `cargo`, `school_id`, `locale`, `timezone`, `status`, `onboarding_status`, `last_active_at`.
- `handle_new_user()` trigger: `SECURITY DEFINER`, `SET search_path = ''`, graceful metadata fallback, `EXCEPTION WHEN OTHERS THEN`.
- `public.people.user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL` + `people_user_id_idx`.
- Buckets storage: `avatars` (privado, URLs assinadas) e `school-logos` (público) com políticas RLS cross-school correctas.

#### Fase 3 — Multi-Tenant & RBAC DDL (`APPLY_ENROLLMENT_AND_PREMIUM.sql`)
- `public.school_memberships` com `UNIQUE(school_id, user_id)` + lifecycle columns + RLS + `updated_at` trigger.
- `public.roles`, `public.permissions`, `public.role_permissions`, `public.member_roles` com RLS policies.
- `public.school_invitations` com `token_hash` (sha256), `expires_at`, status enum, indexes.
- RLS helpers: `public.is_school_member(uuid)` e `public.has_school_permission(uuid, text)` — ambas `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, REVOKE de PUBLIC.

#### Fase 4 — TypeScript Permissions Module
- `src/features/auth/permissions.ts` (~260 linhas): `standardPermissions` (49 permissões canónicas), `roleDefaultPermissions`, `hasPermission()`, `canAccessContext()`.
- `tests/auth/permissions.test.ts` (10 testes).

#### Fase 5 — Access Server Functions & Convites
- `src/features/access/server.ts`: import ESM estático, person-linking idempotente, `updateSystemAccountCargo`, `setSystemAccountDisabled`, `resendSystemInvite`, `listSchoolInvitations`, `createSchoolInvitation` (SHA-256 token), `revokeSchoolInvitation`, `acceptSchoolInvitation` (validação hash sha-256, expiração, ativação idempotente de membership com role, linking people.user_id).
- `src/features/access/schemas.ts`: `createSchoolInvitationInputSchema`, `revokeSchoolInvitationInputSchema`, `acceptSchoolInvitationInputSchema`.
- `src/routes/convite.$token.tsx`: Página pública de aceitação de convite institucional com auto-aceitação para utilizadores autenticados e feedback visual.
- `src/lib/public-paths.ts`, `src/features/auth/access-policy.ts`, `src/features/auth/route-inventory.ts`: registo de `/convite` como rota pública bypass.

#### Fase 6 — Acessos UI Panel (`src/routes/acessos.tsx`)
- Painel «Convites institucionais» com tabela de convites, status badge, botão Revogar.
- `invitationsQuery` com `useQuery`.

#### Fase 7 — Scripts & print-apply-sql
- `scripts/siga/print-apply-sql.mjs`: adicionados `school_memberships`, `roles`, `permissions`, `school_invitations` às smoke tables.

#### Fase 8 — APPLY_SAAS_PLATFORM.sql (verificação)
- RLS completo com `is_platform_admin()` em `plans`, `tenants`, `tenant_domains`, `subscriptions`, `tenant_usage`, `saas_audit_logs`, `platform_admins`.
- Política `platform_admin_read_self` — utilizador vê o próprio registo sem INSERT/DELETE na `authenticated` role.

#### Fase 9 — Multi-School Provisioning & Roles Scoping
- `src/features/saas/provisioning-core.ts`: roles com escopo explícito `school_id` ou global `is_system=true`.
- `src/features/saas/school-bootstrap.ts`: seeding de papéis canónicos (`owner`, `admin`, `secretary`, `treasury`, `teacher`, `student`, `guardian`, `user`) por escola recém-criada.

#### Fase 12 — DOC (`painel/docs/guide/sql-sga.md`)
- Tabela de tabelas novas (Ciclo 49): `school_memberships`, `roles`, `permissions`, `role_permissions`, `member_roles`, `school_invitations`.
- Documentação das funções de segurança RLS helpers.
- Tabela completa de índices de performance (Fase 14).
- Sintomas adicionados: `school_memberships not found`, convites vazios.

#### Fase 14 — Índices Compostos de Performance (`APPLY_ENROLLMENT_AND_PREMIUM.sql`)
12 índices compostos adicionados (todos idempotentes `CREATE INDEX IF NOT EXISTS`):
- `people_school_status_idx`, `students_school_status_idx` (WHERE `deleted_at IS NULL`)
- `enrollments_school_year_status_idx`, `enrollments_school_created_desc_idx`
- `finance_invoices_school_status_idx`, `finance_invoices_school_created_desc_idx`
- `school_memberships_user_status_idx`, `member_roles_membership_role_idx`
- `school_invitations_school_created_desc_idx` (WHERE `status = 'pending'`)
- `announcements_school_created_desc_idx`, `siga_files_school_created_desc_idx`, `roles_school_code_idx`

#### Fase 15 — Testes Hostis de Isolamento Multi-Tenant & Convites
- `tests/saas/rls-isolation.test.ts` (56 testes): catálogo de permissões, RBAC por papel, grant overrides, `canAccessContext`, mapeamento SGA↔AppRole, validação defensiva de schemas, Pessoa vs Conta (`user_id NULL`), switching multi-escola.
- `tests/access/accept-invitation.test.ts` (28 testes): hash SHA-256 determinístico, verificação de expiração, idempotência de membership (reactivação vs inserção), ligação people.user_id por email case-insensitive sem sobrescrita, validação de schema e mapeamento role_code.

### Ciclo 48 — AssessmentCenter + Resend HTTP (2026-08-29)

- **AssessmentCenter:** `CreateAssessmentDialog`, `OfficialPautaView`,
  `AssessmentViewTables` extraídos (~2200 → ~1780 linhas).
- **Resend HTTP:** `resend-client.ts` + `sendSchoolResendEmail`; publicar
  comunicado canal E-mail envia via API (merchant = API key); sem key → clipboard.
- Gateway failure-rate alerts reutilizam o mesmo cliente.
- Testes: `tests/integrations/resend-client.test.ts`.

### Ciclo 47 — pontos fracos estruturais (2026-08-29)

- **Auth Fase 10:** middleware ADMIN chama `GET /api/saas/me`; contas escolares
  são expulsas (`?error=platform`) antes de renderizar o Control Center.
- **Rotas template → funções reais (não esconder):** ADMIN `/dashboard` (stats),
  `/dashboard-2` (gateway), `/tasks` (fila), `/calendar` (agenda SaaS), `/mail`
  (avisos auditoria), `/chat` (suporte operador), `/pricing`/`/faqs`/`/users`.
  WEB `/dashboard` (visitante + planos API), `/tasks` (checklist), `/mail`
  (contacto), `/chat` (ajuda), `/calendar`/`/users`/`/dashboard-2`. Pontes
  `/saas-admin` e `/criar-escola` intactas; alive-bridges só auth/settings.
- **UI monólito:** `SecurityPanel` → `settings-security-panel.tsx` (re-export
  em `settings-panels.tsx`).
- **Firebase analytics:** off por defeito (`VITE_FIREBASE_ANALYTICS=true` para ligar).
- **Matriz de pontos fracos** actualizada em `ARCHITECTURE_HARMONIZATION.md` §14.
- Já mitigados antes deste ciclo: SQL checklist/`siga:sql:verify`, porta WEB
  5174 `--strictPort`.

| Ciclo | O quê                                                                                                                       | Estado                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1     | Filtros persistentes URL + localStorage                                                                                     | Feito                           |
| 2     | Folha sequencial de aluno + link público `/matricula/$slug`                                                                 | Feito (precisa SQL)             |
| 3     | Folha de turmas + WhatsApp                                                                                                  | Feito (colunas WhatsApp no SQL) |
| 4     | Grants, ficha professor, workspace, ICS                                                                                     | Feito (tabelas no SQL)          |
| 5     | Pagamento avançado Multicaixa/Unitel                                                                                        | Feito (tabela no SQL)           |
| 6     | Catálogo integrações + 2FA TOTP                                                                                             | Feito (tabela + AuthGate)       |
| 7     | Wiring catalog-ready nos ecrãs + testes integrações                                                                         | Feito                           |
| 8     | Supervisão de desempenho + resposta ao toque                                                                                | Feito                           |
| 9     | Identidade Angola (BI/NIF/IBAN), perfil, branding, AGT                                                                      | Feito (precisa SQL)             |
| 9     | Lazy Recharts + impressão diferida (print-issue-loader)                                                                     | Feito                           |
| 10    | Telefone angolano (+244): componente, validação Zod, normalização E.164                                                     | Feito                           |
| 11    | Mensagens internas no painel da conta (colegas reais, pesquisa, thread)                                                     | Feito (precisa SQL)             |
| 12    | Não-lidas: ponto nos avatares, sino e lista de notificações                                                                 | Feito                           |
| 13    | Sino operacional: candidaturas, matrícula, documentos, faturas                                                              | Feito                           |
| 14    | Taxa de presença na matrícula, ficha, dashboard e turmas                                                                    | Feito (precisa SQL)             |
| 15    | Destaques no painel da conta (notas, novidades, atalhos)                                                                    | Feito                           |
| 16    | Gerir destaques em Definições (textos, ordem, visibilidade)                                                                 | Feito                           |
| 17    | Notas e atalhos próprios da escola nos destaques                                                                            | Feito                           |
| 18    | Público, calendário (Luanda) e pré-visualização dos destaques                                                               | Feito                           |
| 19    | Destaques no início (além do painel da conta)                                                                               | Feito                           |
| 20    | Ligação interna ou externa no botão de cada destaque                                                                        | Feito                           |
| 21    | Ícone, cor e tipo em todos os destaques                                                                                     | Feito                           |
| 22    | Arquivos (biblioteca Moodle: SGA + local, waffle, picker)                                                                   | Feito (precisa SQL)             |
| 23    | Arquivos: miniaturas, filtros, logo/perfil da biblioteca                                                                    | Feito                           |
| 24    | Arquivos ligados a foto aluno/pessoa, docs e comunicados                                                                    | Feito (precisa SQL)             |
| 25    | Materiais de turma + descarregar/renomear arquivos                                                                          | Feito (precisa SQL)             |
| 26    | Filtro turma nos arquivos + materiais no workspace                                                                          | Feito                           |
| 27    | Arquivos visual OneDrive + utilizador, acesso e auditoria                                                                   | Feito (precisa SQL)             |
| 28    | Arquivos: breadcrumb, barra de comandos, drag-drop, avatares                                                                | Feito                           |
| 29    | Inquérito de metadados + ligação a utilizadores/pessoas                                                                     | Feito (precisa SQL)             |
| 30    | Foto de aluno: relação + perfil na ficha                                                                                    | Feito                           |
| 31    | Media reconhecida + inquérito/área obrigatórios                                                                             | Feito                           |
| 32    | Pastas, selecção, mover e modal expansível                                                                                  | Feito (precisa SQL)             |
| 33    | Recibos/talões na biblioteca + ID pesquisável                                                                               | Feito (precisa SQL)             |
| 34    | Planos de Aula (título/conteúdo/anexo + avaliações/provas por turma-disciplina-trimestre)                                   | Feito (precisa SQL)             |
| 35    | Anexo de arquivo nas mensagens internas + conversas enviadas sem resposta a aparecerem na lista + página `/perfil` dedicada | Feito (precisa SQL)             |
| 36    | Documento ligado a utilizador + ficheiros de sistema protegidos                                                             | Feito (precisa SQL)             |
| 37    | Backfill dono/sistema + filtros Meus/Sistema + painéis protegidos                                                           | Feito (precisa SQL)             |
| 38    | Auditoria access_denied + anexos de mensagens protegidos                                                                    | Feito (precisa SQL)             |
| 39    | Descoberta local USB/CUPS + allowlist (daemon Python localhost)                                                             | Feito                           |
| 40    | Pulso físico no grant + health do bridge + IP no registo                                                                    | Feito                           |
| 41    | Suspender cartão + estado catraca + selector/filtro logs                                                                    | Feito                           |
| 42    | RFID no cartão + renovar QR + API key do dispositivo                                                                        | Feito                           |
| 43    | Lista de cartões + webhook api_key + validação partilhada                                                                   | Feito                           |
| 44    | Rota HTTP `/api/catracas/device-scan` + bridge Python → SIGA + pulso no grant                                               | Feito                           |
| 46    | Navegação unificada: sidebar + launcher + inventário; logótipo só no topo da sidebar                                          | Feito                           |

## Ciclo 46 — navegação, launcher e identidade visual (2026-08-28)

- **Logótipo da escola:** apenas no botão do topo da sidebar (dropdown conta: logótipo + utilizador + escola). `SchoolLogoChip` deixa de fazer fallback automático; cartões, headers e launcher usam `IconChip` + ícones Lucide premium (`app-marks.tsx`).
- **Fonte única:** `navigation-catalog.ts` (`WORKSPACE_MODULE_SPECS`) alimenta launcher e auditoria; `portal-engine.ts` (`getPortalNavigation`) alimenta sidebar por papel/plano.
- **Inventário:** `scripts/siga/modules.json` com `navPath` e `secondaryNavPaths` (relatórios académicos/financeiros, faturas). Mapa em `docs/agents/MODULES.md`.
- **Correcções:** Importar visível (feature `importacao` em `academic`); Secretaria/Tesouraria/Professor com `filterNavGroups`; secção Sistema (Definições + Perfil); apps importar/catracas/planos-aula no waffle.
- **Validação:** `npm run siga:check` (inventário + `tests/auth/navigation-catalog.test.ts`); CI corre `check-modules.mjs` após `bun run test`. **Node 24** — Node 26 neste macOS aborta (`dyld libc++`).

### Ciclo 46b — auditoria de rotas e DOC (2026-08-28)

- **`route-inventory.ts`** — prefixos conhecidos de rotas UI; testes garantem cobertura RBAC admin e inventário ↔ rotas.
- **Spotlight** — `spotlightInternalTargets` derivado de `WORKSPACE_MODULE_SPECS` (+ `/perfil`).
- **DOC:** `painel/docs/siga/navegacao.md` + sidebar VitePress; link «Documentação» na sidebar aponta ao mapa de navegação.
- **`route-security.md`** — aviso de legado template + link para navegação SIGA real.

### Ciclo 46c — DOC features e links Ajuda (2026-08-28)

- **`guide/features.md`** e **`guide/index.md`** — conteúdo alinhado ao ecossistema real (4 apps, módulos SIGA, RBAC).
- **`getSigaNavDocUrl()`** + `DOC_PATHS` em `ecosystem-urls.ts`.
- **Ajuda:** `/pedagogica` → mapa navegação; `/financeiro` → navegação + link «Pagamentos» (integrações EMIS).

### Ciclo 46d — DocHelpButton e estrutura DOC (2026-08-28)

- **`DocHelpButton`** — botão reutilizável de Ajuda (default: mapa de navegação).
- Ajuda em `/importar`, `/catracas`, `/documentos`; pedagógica/tesouraria usam o mesmo componente.
- **`DOC_PATHS`** expandido (gateway, ADMIN, suporte); Definições e pontes SaaS usam as constantes.
- **`guide/project-structure.md`** — árvore real das 4 apps (já não lista rotas fictícias `/admin/academico`).

### Ciclo 46e — Ajuda em todos os módulos + DOC home (2026-08-28)

- **`DocHelpButton`** também em `/arquivos`, `/planos-aula`, `/acessos`, `/faturas` (+ SAFT-AO), `/comunicacoes`, `/calendario`, `/relatorios/*`.
- **`guide/installation.md`** — arranque real (Node 24, SQL SGA, `dev:ecosystem`), sem fluxo de «licença» fictício.
- **DOC home** — CTAs e features alinhados a WEB/ADMIN/SIGA/DOC; card SIGA liga ao mapa de navegação.

### Ciclo 46f — drawer, alunos/pessoas e stack DOC (2026-08-29)

- **AccountDrawer:** Perfil → `/perfil`; filtro de atalhos respeita plano; Configurações abre painel `conta`.
- **Ajuda** em `/alunos` e `/pessoas`; corrigido `InstalledModuleTools` em pessoas (`pessoas`, não `comunicacoes`).
- **DOC:** `choosing-framework.md` e `tech-stack.md` descrevem as 4 apps (já não «Vite vs Next»).

## Ciclo 9 — identidade, escola e tesouraria

- `src/lib/angola-identity.ts`, `angola-banking.ts`, `angola-phone.ts` — validação BI/NIF, IBAN AO, telefone.
- `src/lib/finance-print.ts` — `buildFinancePrintSchool`, secção **Dados de pagamento** nos PDFs de tesouraria.
- Definições → **Escola**: NIF AGT, logótipo (URL + upload `school-logos`), link Portal AGT.
- Definições → **Financeiro**: IBAN, SWIFT, Multicaixa merchant; **AGT**: série e notas fiscais (metadata, sem SAFT real).
- Definições → **Conta**: telemóvel editável (`profiles.phone` no SQL).
- `AngolaIdentityField` em nova/editar pessoa, matrícula interna e formulário público `/matricula/$slug`.
- `AngolaPhoneField` em nova/editar pessoa, `StudentEnrollmentSheet`, `/matricula/$slug` e `SettingsCenter`.
- Normalização E.164 (`+244 9XX XXX XXX`) antes de persistir em `people.phone` e `profiles.phone`.
- Validação Zod em `personCoreFieldsSchema` para `phone_primary`/`phone_alternative`.
- Recibos/faturas/relatórios financeiros incluem IBAN e logótipo quando configurados.

## SQL no SGA (`xodgfmxiaunpamctfeea`)

Correr **só** no SQL Editor, nesta ordem:

1. `supabase/APPLY_IN_SQL_EDITOR.sql`
2. `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql`

O segundo cria `current_school_id()` a partir de `school_memberships`. Sem isto as tabelas novas não existem (inclui `siga_assessment_items/scores` do Centro de Avaliação e `siga_lesson_plans/siga_lesson_plan_components` dos Planos de Aula).

### Reaplicação obrigatória de Storage

Após os commits de privacidade, reaplicar os dois scripts canónicos para manter
as políticas alinhadas ao código:

- `school-logos` público fica reservado ao logótipo institucional e ao padrão
  de caminhos gerado pela interface;
- fotos de pessoas ficam no bucket privado `siga-files`, referenciadas por
  `siga-file://` e servidas por URL assinada;
- avatares de conta ficam no bucket privado `avatars`, referenciados por
  `siga-avatar://` e servidos por URL assinada.

Referências públicas legadas de avatar continuam compatíveis enquanto existirem
registos antigos em `profiles.avatar_url`.

**Nunca** aplicar ao SGA:

- `all_migrations_combined.sql`
- `supabase/pending_feature_migrations.sql`
- `supabase/migrations/20260810122022_foundation_schema.sql`
- migrações `2026081114*` isoladas (usam helpers Lovable)

Ver `supabase/DO_NOT_APPLY_TO_SGA.txt`.

## Regras de implementação

1. **Estender, não reescrever** páginas/schemas/server existentes.
2. Padrão de módulo: `src/features/<mod>/schemas.ts` + `server.ts` (`createServerFn` + Zod) + rota em `src/routes/` + teste em `tests/<mod>/`.
3. Listas premium: `usePersistedListFilters` + `ListFilterBar`. Search extra via `.passthrough()` e param `lf`.
4. Escrita SGA: `loadSgaAdminClient` + `requireSgaWriter`. Tabelas SGA muitas vezes **sem** GRANT/RLS para `authenticated`.
5. Rotas públicas: `isPublicAppPath` em `src/lib/public-paths.ts` (hoje `/matricula`, `/calendario/ics`).
6. Node **24** neste macOS. v26 falha (`dyld libc++`).
7. Não commitar `.env`. Não force-push / rebase de histórico já publicado (Lovable).
8. Tabelas em falta: falhar com mensagem para `APPLY_ENROLLMENT_AND_PREMIUM.sql`, ou degradar (como planos de pagamento / WhatsApp).

## Auto-construção

```sh
npm run siga:check          # inventário dos módulos
npm run siga:sql            # checklist SQL SGA (ordem + smoke tables)
npm run siga:sql:verify     # confirma tabelas na BD (SUPABASE_SECRET_KEY)
npm run siga:scaffold -- <id> [--route /caminho] [--with-page]
npm run siga:clean-cache   # cache Vite/Nitro se o dev ficar lento
npm test                    # vitest (usar Node 24)
```

DOC checklist SQL: `painel/docs/guide/sql-sga.md`. Pontes kit→produto:
`painel/*/src/lib/alive-bridges.ts` (flag `SHOW_TEMPLATE_SURFACES`).

Lacunas pós-verify (gateway / presença / catracas):
`supabase/APPLY_MISSING_FROM_VERIFY.sql` — `npm run siga:sql:patch` copia e abre o Editor.

Scaffold cria `schemas.ts`, `server.ts`, teste e opcionalmente a rota. Não sobrescreve ficheiros existentes.

Validação local mais recente: `npm run siga:check`, testes Vitest (222), build
de produção e TypeScript concluídos. Os testes SQL pgTAP exigem Docker local;
quando o daemon estiver disponível, correr as suites em `supabase/tests/`.

## Skills (um por módulo)

| Skill               | Quando                                                           |
| ------------------- | ---------------------------------------------------------------- |
| `siga`              | qualquer trabalho SIGA, scaffold, SQL, handoff                   |
| `siga-alunos`       | alunos, matrícula interna, ficha                                 |
| `siga-pessoas`      | pessoas, professores                                             |
| `siga-pedagogica`   | turmas, notas, horários, WhatsApp                                |
| `siga-financeiro`   | caixa, faturas, planos, Multicaixa/Unitel                        |
| `siga-documentos`   | emissão de documentos                                            |
| `siga-calendario`   | calendário lectivo, ICS                                          |
| `siga-comunicacoes` | comunicados                                                      |
| `siga-acessos`      | contas, grants, 2FA                                              |
| `siga-matricula`    | link público `/matricula`                                        |
| `siga-integracoes`  | catálogo catalog-ready                                           |
| `siga-arquivos`     | biblioteca de ficheiros, picker Moodle                           |
| `siga-dashboard`    | dashboard e workspace do professor                               |
| `siga-lesson-plans` | planos de aula, avaliações/provas por turma-disciplina-trimestre |
| `siga-ecosystem`    | limites WEB / ADMIN / SIGA / DOC                                 |
| `siga-web`          | `painel/web` (landing, pricing, wizard comercial)                |
| `siga-admin`        | `painel/admin` (SaaS Control Center)                             |
| `siga-docs`         | `painel/docs` (VitePress)                                        |
| `siga-saas`         | backend SaaS ainda no SIGA (`features/saas`)                     |

Registo canónico: `scripts/siga/modules.json`.

## Ciclo 11 — mensagens internas

- Painel da conta: avatares dos colegas da escola (até 7 recentes) e `+` para pesquisar nome/cargo.
- Conversa no mesmo sheet; botão **Sair** só no menu.
- `src/features/messages/` — `listSchoolColleagues`, `listDirectThread`, `sendDirectMessage`.
- Tabela `siga_direct_messages` em `APPLY_ENROLLMENT_AND_PREMIUM.sql`. Sem tabela, as mensagens ficam neste dispositivo.
- Com SGA, a conversa actualiza a cada 8 segundos.

## Ciclo 12 — não-lidas

- Ponto vermelho nos avatares do painel da conta e no `+` se houver conversas fora dos recentes.
- Contador no avatar do cabeçalho e ponto no sino.
- Notificações listam mensagens por ler; clicar abre a conversa no painel da conta.
- Leitura marcada neste dispositivo (`siga:dm-read`); inbox SGA via `listInboxPreviews`.

## Ciclo 13 — avisos do sino

- `listSchoolAlerts` junta candidaturas `pending`, alunos `applicant`, pedidos de documento em curso e faturas vencidas.
- O sino mostra estes avisos (com atalho para a página certa) e as mensagens por ler.
- Textos em `src/features/dashboard/alerts.ts`.

## Ciclo 14 — presença

- `enrollments.attendance_rate` lido na ficha do aluno; Admin/Secretaria **Registar** (0–100).
- Dashboard `attendanceAverage` e turmas pedagógicas usam a média das matrículas activas.
- Boletim inclui a percentagem. Coluna em `APPLY_IN_SQL_EDITOR.sql`.

## Ciclo 15 — destaques da conta

- Catálogo editável em `src/features/spotlight/catalog.ts` (notas, novidades, funções, promoções).
- O cartão «Relatórios avançados» mantém o visual original; os outros usam o mesmo molde com tons e ícones diferentes.
- Ligações internas, externas (Portal AGT) e painéis de Definições. Filtra por cargo.

## Ciclo 44 — Limpeza de Dados Falsos e Preparação para Produção (`e68f5b4`)

- **Expurgo de Dados Fictícios (`e68f5b4`)**: Removidas todas as instâncias de dados mock estáticos em `CashFlowForecastChart.tsx`, `DisciplinePerformanceHeatmap.tsx`, `DropoutRiskReportModal.tsx`, `dropout-risk-predictor.ts` e `sga-grades.ts`.
- **Script SQL de Produção**: Criado `supabase/PURGE_DEMO_DATA.sql` para expurgar dados de teste mantendo intactas as escolas, turmas, disciplinas, permissões RBAC e modelos oficiais.
- **Validação Global**: `npm run siga:check` 100% verde em todos os 13 módulos, 41/41 suítes de teste a passar (248 testes) e `npm run build` de produção concluído.

## Ciclo 43 — Emissão de Faturas Proforma (`4bc7265`)

- **Faturas Proforma (`4bc7265`)**: Integrada a emissão de Fatura Proforma em [src/routes/faturas.tsx](file:///Users/valentinocanguele/edu/onsoft-replica-dev/src/routes/faturas.tsx) com `buildProformaInvoice` de `proforma-receipts.ts`, dados bancários IBAN da instituição e aviso legal AGT.
- **Validação Workspace**: `npm run siga:check` 100% verde em todos os 13 módulos e 41/41 suítes de teste a passar (248 testes).

## Ciclo 42 — Refinamento de UX do Modal OCR (`732940f`)

- **Refinamento do Modal OCR (`732940f`)**: Atualizado [PautaOcrScannerModal.tsx](file:///Users/valentinocanguele/edu/onsoft-replica-dev/src/features/pedagogica/components/PautaOcrScannerModal.tsx) com painel duplo de pré-visualização de imagem original e grelha de edição manual direta de notas (MAC, NPP, NPT) antes da importação para a pauta.
- **Validação Global**: `npm run siga:check` 100% verde em todos os 13 módulos e 41/41 suítes de teste a passar (248 testes).

## Ciclo 41 — Cartão Digital PWA e Ferramentas Pedagógicas (2026-08-19)

- **Cartão Digital de Estudante (`922eca0`)**: Adicionado botão e ligação do modal `StudentDigitalCardModal` na ficha do aluno (`src/routes/alunos/$studentId.tsx`), com passe escolar, assinatura digital e QR Code dinâmico com atualização a cada 30s.
- **Ferramentas Pedagógicas Avançadas**: Integração do scanner OCR de pautas em papel (`PautaOcrScannerModal`) e do relatório preditivo de risco de abandono escolar (`DropoutRiskReportModal`) com botões na Área Pedagógica (`/pedagogica`).
- **Sanidade do Workspace**: `npm run siga:check` válido para todos os 13 módulos e 41/41 suítes de teste a passar (248 testes).

## Ciclo 40 — Avaliações, Login por BI e SAFT-AO (2026-08-19)

- **Edição/Remoção de Avaliações (`26dda5e`)**: Modal `CreateAssessmentDialog` estendido em `AssessmentCenter.tsx` com `updateAssessmentItem` e `deleteAssessmentItem` (`force: true` remove atomicamente notas associadas).
- **Login por Bilhete de Identidade / NIF (`bf271a1`)**: Novo módulo `bi-login.ts` e `resolveBiToEmailFn` em `access/server.ts`; `AuthGate.tsx` aceita BI ou E-mail e resolve para a conta correspondente antes de iniciar sessão.
- **Gerador SAFT-AO AGT (`21368ef`)**: Criado `saft-generator.ts` (conforme Decreto Presidencial 312/18 AGT e isenção M00 art. 12º CIVA), com Server Function `exportSaftAoXml` e botão de exportação XML no ecrã de faturas (`/faturas`).
- **Testes**: 248/248 testes a passar (41 suítes Vitest).

## Ciclo 16 — gerir destaques

- Definições → **Destaques**: Administrador liga/desliga, reordena e edita título/texto/botão. Ligações ficam no catálogo.
- Persistência em `school_settings.domain = "spotlight"` (JSON; sem DDL novo). Sem linha, usa o catálogo.
- O rail do painel da conta lê `listSpotlightConfig` e continua a filtrar por cargo/`canAccessPath`.
- Atalho: `/configuracoes?painel=destaques`.

## Ciclo 17 — destaques da escola

- **Novo destaque** cria uma nota/novidade/atalho da escola (até 12), com ícone, cor e ligação (página SIGA, painel de Definições ou URL).
- Cartões do catálogo não se apagam; os da escola têm lixo. Atalhos internos respeitam `canAccessPath`.
- `extras` no mesmo JSON `school_settings` domínio `spotlight`. Overrides antigos sem `extras` continuam válidos.

## Ciclo 18 — público e calendário dos destaques

- Cada cartão tem **Quem vê** (cargos) e datas de início/fim no fuso de Luanda. Sem datas, fica sempre visível; sem cargos, todos vêem.
- O painel da conta esconde o que ainda não começou ou já terminou. Pré-visualização do cartão em Definições → Destaques.

## Ciclo 19 — destaques no início

- Notas, novidades e promoções aparecem no dashboard (`/`). Atalhos (`function`, p.ex. Relatórios avançados) ficam só no painel da conta, salvo se o Administrador ligar **Início**.
- Definições → Destaques → **Onde aparece**: Painel da conta e/ou Início. É obrigatório pelo menos um.

## Ciclo 20 — ligação do botão

- Cada destaque tem **Ligação do botão**: página do SIGA (lista ou caminho `/…`), URL externo, ou painel de Definições. Vale para o catálogo e para as notas da escola.
- Caminhos internos ganham `/` se faltar; URLs sem `https://` são completados ao sair do campo. Página interna actualiza o filtro de acesso.

## Ciclo 21 — aspecto dos cartões

- Ícone (grelha), cor e tipo em **todos** os destaques, não só nas notas da escola. Mais ícones (livro, pessoas, estrela, sino, e-mail…).
- Mudar o tipo de atalho para nota/novidade passa a poder aparecer no início, salvo se **Onde aparece** já estiver definido à mão.

## Ciclo 22 — arquivos

- Biblioteca estilo Moodle em `/arquivos` (waffle **Arquivos**, não na sidebar). Áreas: escola, secretaria (reservada), pessoal, públicos.
- Picker modal `FilePickerModal` / botão **Arquivo** em documentos, alunos, comunicações e pedagógica. Painel da conta: **Os meus arquivos**. Definições → Arquivos (área e visibilidade neste dispositivo).
- Bytes no bucket privado `siga-files`; metadados em `siga_files`. Sem SQL: IndexedDB local (ano/mês/área). Máx. 8 MB; só PDF/Word/Excel/PNG/JPEG. A lista não descarrega o ficheiro.
- Sem chave de armazenamento gratuita partilhada. OneDrive = Microsoft 365 catalog-ready (`m365.onedrive` abre `/arquivos`).

## Ciclo 23 — arquivos (miniaturas e ligação)

- Capas PNG/JPEG com pré-visualização a pedido (`FileCoverTile` + `resolveFileUrl`); PDF/Word/Excel mantêm ícone.
- Filtros por tipo (Todos / PDF / Word / Excel / PNG / JPEG) no browser; o picker pode restringir tipos (`acceptKinds`).
- **Da biblioteca** no perfil (foto) e em Definições → Escola (logótipo), só PNG/JPEG.
- Pré-busca de metadados ao apontar para `/arquivos`.

## Ciclo 24 — arquivos nas fichas

- Ficha do aluno e registo central: **Foto** / **Foto da biblioteca** (PNG/JPEG
  → `siga-files` privado + referência `siga-file://` em `people.photo_url`).
- Documento da pessoa: **Anexar PDF** da biblioteca (`file_id` / `file_name` em `person_documents`); botão **Abrir** no anexo. Colunas no `APPLY_ENROLLMENT_AND_PREMIUM.sql`.
- Comunicados: **Anexar arquivo** acrescenta referência `[Arquivo SIGA] nome` à mensagem (sem blob no Postgres).

## Ciclo 25 — materiais de turma

- `siga_files.class_group_id` + índice; listagem/registo/ligação no servidor (fallback se a coluna ainda não existir).
- Cartão da turma em `/pedagogica`: painel **Materiais** (`ClassMaterialsPanel`) — anexar da biblioteca, abrir, descarregar, desligar.
- Browser: **Renomear** e **Descarregar**; metadados locais com `patchLocalFileMeta`.
- Professores anexam via permissão do módulo `arquivos`.

## Ciclo 26 — filtro turma e workspace

- `/arquivos?turma=` filtra a biblioteca; dropdown de turmas no `FileBrowser` (`listArquivosClassOptions`).
- Carregar com filtro activo liga o ficheiro à turma.
- Workspace do professor: painel **Materiais das turmas** (`TeacherClassMaterialsBlock`) + atalho Biblioteca.
- Partilha: copiar `[Arquivo SIGA] …` e WhatsApp (se `whatsapp.class_groups`).

## Ciclo 27 — visual OneDrive, acesso e auditoria

- Browser opaco estilo OneDrive: cabeçalho com **utilizador activo** (avatar + cargo), vista **lista/grelha**, organizar, painel **Detalhes**.
- Colunas: Nome, Modificado, Modificado por, Tamanho, **Acesso** (Privado/Escola/Público), **Actividade**.
- Nível do utilizador no ficheiro: Proprietário / Pode editar / Só leitura; alterar visibilidade no painel Detalhes.
- Auditoria: tabela `siga_file_events` + campos `updated_*` / `last_action_*` em `siga_files` (SQL premium). Abrir/descarregar/renomear/ligar registam eventos.

## Ciclo 28 — refino OneDrive

- Breadcrumb `utilizador › área › turma`; barra de comandos ao seleccionar (Descarregar, Copiar, Renomear, Apagar).
- Drag-and-drop para carregar; Enter abre / Esc limpa; ícones com selo de partilha; avatares em Modificado por / Actividade / auditoria.
- Detalhes: pré-visualização de imagem; picker modal alinhado ao novo visual.

## Ciclo 29 — inquérito de metadados

- Ao carregar (botão ou drag-drop): modal **Inquérito do documento** (`FileUploadInquiryModal`) com título, categoria, data, referência, descrição, acesso, utilizador SIGA e pessoa do registo.
- Colunas SGA: `title`, `description`, `category`, `document_date`, `reference_code`, `related_user_id`, `related_person_id`.
- Filtros por categoria e utilizador relacionado; painel Detalhes mostra e edita metadados; evento `metadata_updated`.

## Ciclo 30 — fotografia de aluno

- Categoria **Fotografia**: inquérito exige aluno (`listArquivosStudentOptions`); PNG/JPEG; opção **Usar como foto de perfil** (predefinida).
- Após guardar: `applyLibraryPhotoToPerson` mantém o ficheiro em `siga-files`
  privado, grava `people.photo_url` como `siga-file://` e actualiza os
  metadados `category=foto` / `related_person_id`.
- Ficha do aluno: painel **Arquivos do aluno** (`StudentRelatedFilesPanel`) com lista ligada, **Usar no perfil** e atalho `/arquivos?pessoa=`.
- Botão **Foto** na ficha também marca o ficheiro como fotografia relacionada.

## Ciclo 31 — media padronizada

- Formatos reconhecidos: PDF, Word, Excel, PowerPoint, CSV, PNG, JPEG, WebP, GIF, SVG (ícones) — ícones por tipo em `FileKindIcon` / `FileCover`.
- Inquérito: **descrição obrigatória** (≥12 chars) + **área de destino**; sugestão de categoria/área pelo nome e tipo.
- Ficheiros sem descrição/título/categoria ficam **Por organizar** (filtro + badge + modal de organização).
- Nenhum upload fica sem metadados; mover área via `updateSchoolFileMeta.area`.

## Ciclo 32 — pastas, selecção e modal expansível

- Pastas em `siga_files` (`is_folder`, `parent_id`); **Nova pasta**, breadcrumb e navegação por duplo clique.
- Multi-selecção com checkboxes; barra **Mover** para raiz ou pasta (`moveSchoolFiles`).
- Modais **Expandir** (`FilePickerModal`, inquérito, mover) para trabalho em ecrã largo.
- Eventos `folder_created` / `moved`. SQL: reaplicar `APPLY_ENROLLMENT_AND_PREMIUM.sql`.

## Ciclo 33 — recibos, talões e ID pesquisável

- ID simples `PREFIX-AAMMDD-XXXX` (`document-code.ts`); coluna/pesquisa `reference_code` na biblioteca.
- Categorias financeiras `recibo` / `talao` / `fatura`; stubs `.txt` via `insertFinanceArchive` (idempotente por ID).
- Tesouraria arquiva ao receber, emitir fatura e criar plano; impressão de talão reutiliza o mesmo ID estável.
- UI: inquérito com ID, lista/grelha com mono ID, ficha do aluno mostra recibos/talões ligados.
- SQL: categoria `talao` no CHECK + índice `siga_files_reference_idx` em `APPLY_ENROLLMENT_AND_PREMIUM.sql`.

## Ciclo 34 — Planos de Aula

- `/planos-aula` (sidebar → Área Pedagógica): cartões agrupados por trimestre, filtráveis por turma/disciplina/trimestre/texto.
- Modal `LessonPlanModal` (padrão `PremiumModal`, o mesmo usado no Centro de Avaliação): turma, disciplina, trimestre, título, conteúdo, anexo (`PickFileButton` da biblioteca), listas repetíveis de **Avaliações** e **Provas** (nome definido pelo professor + quantidade).
- **Não é um motor de notas novo.** Cada avaliação/prova do plano materializa-se em `siga_assessment_items` (avaliação → `component: MAC`, prova → `component: NPP`) — o Centro de Avaliação já existente (`AssessmentCenter.tsx`) lança as notas, calcula `componentAverage` e empurra para a pauta oficial via `upsertTermGradesBatch`. A pauta continua fixa a MAC/NPP/NPT.
- Editar um plano nunca apaga notas já lançadas: itens do Centro de Avaliação com pontuação ficam ligados por `lesson_plan_component_id` mesmo que a definição do plano mude; só remove itens _sem_ nota quando a quantidade planeada desce.
- Tabelas novas: `siga_lesson_plans`, `siga_lesson_plan_components`; coluna nova `siga_assessment_items.lesson_plan_component_id`. Tudo em `APPLY_ENROLLMENT_AND_PREMIUM.sql`.

## Ciclo 35 — mensagens com anexo, fluxo corrigido e página de perfil

- **Anexo nas mensagens internas**: botão de clipe (`PickFileButton`) na conversa, chip antes de enviar, bolha da mensagem mostra o ficheiro e abre com `signSchoolFile`. Mensagem pode ir só com anexo (sem texto). Colunas novas `siga_direct_messages.attachment_file_id/attachment_file_name`; `body` deixou de ser `NOT NULL`.
- **Bug de fluxo corrigido**: `listInboxPreviews` só olhava para mensagens recebidas — uma conversa que só tu iniciaste (sem resposta ainda) não aparecia em lado nenhum. Agora `InboxPreview` separa `lastActivityAt` (qualquer direcção, para pré-visualização/ordenação) de `lastIncomingAt` (só recebidas, para o ponto de não-lida).
- **`/perfil`**: página dedicada (foto, nome, telemóvel) extraída para `src/features/auth/ProfileSettingsPanel.tsx` — usada tanto na página como no painel Conta → Perfil do Centro de Configurações (uma só fonte). O menu da conta na sidebar abre `/perfil` em vez do modal.

## Ciclo 36 — dono obrigatório e ficheiros de sistema

- Todo o documento fica ligado a um utilizador SIGA (`related_user_id`): inquérito obrigatório (predefinido = conta actual); upload/pasta/arquivo financeiro preenchem automaticamente.
- Coluna `is_system` em `siga_files`: recibos/talões/faturas gerados pela tesouraria são `is_system=true`.
- Visíveis na lista (metadados/ID), mas abrir/descarregar/miniatura exige dono, utilizador relacionado, ou Admin/Secretaria/Tesouraria (`canAccessFileContent`).
- Alterar/apagar/mover ficheiros de sistema: Admin/Secretaria ou dono (`canManageSystemFile`). Sem permissão: cadeado «Sistema / Protegido» e conteúdo oculto.
- SQL: reaplicar `APPLY_ENROLLMENT_AND_PREMIUM.sql` (`is_system` + índice).

## Ciclo 37 — backfill, filtros e painéis

- SQL: `related_user_id = owner_user_id` onde faltava; `is_system=true` em recibo/talão/fatura existentes.
- Biblioteca: filtros **Meus** e **Sistema**; picker não escolhe ficheiro protegido sem permissão.
- Materiais de turma e ficha do aluno respeitam `canAccessFileContent` (cadeado / toast).
- `setSchoolFileVisibility` bloqueia ficheiros de sistema sem gestão.

## Ciclo 38 — auditoria de acesso e anexos

- Evento `access_denied` em `siga_file_events` (CHECK SQL + UI «tentou abrir (sem permissão)»).
- `signSchoolFile` regista tentativa quando o conteúdo de sistema é bloqueado.
- Mensageiro interno: anexo protegido mostra cadeado / toast «Anexo protegido» em vez de falha genérica.

## Ciclo 39 — descoberta local de hardware (Linux-first)

- Daemon Python em `127.0.0.1:8088` apenas (`BIND_HOST`); CORS restrito a localhost/Tauri.
- `device_discovery.py`: lista `/dev/ttyUSB*`, `ttyACM*`, `serial/by-id` e impressoras CUPS (`lpstat -a`). Não lê `$HOME`, browsers nem cookies.
- Allowlist em `siga_hardware_allowlist.json` (ou `SIGA_HARDWARE_STATE_DIR`) — só neste PC.
- Endpoints: `GET /hardware/discover`, `GET|POST /hardware/allowlist`; abertura de catraca com `device_id` exige allowlist.
- UI em `/catracas` → definições desktop: procurar dispositivos e autorizar com switch.
- Arranque: `python3 python/hardware_bridge/siga_hardware_bridge.py`
- **Abandonado:** drivers universais, acesso directo do browser, inventário completo do PC enviado à cloud.

## Ciclo 40 — pulso físico ligado ao grant

- Simulador/validação: se o acesso for **autorizado**, envia pulso de relé via Tauri ou daemon Python (`triggerTurnstileRelay`).
- IP resolvido por `resolveTurnstilePulseIp`: IP do dispositivo SGA → definições desktop → `127.0.0.1` (simulação).
- Badge **Bridge online/offline** em `/catracas` (`GET /health` a cada 15s).
- Registo de catraca: campo IP opcional; botão **Relé** por dispositivo.
- Helper puro: `src/features/catracas/hardware-pulse.ts` + testes.

## Ciclo 41 — cartões e dispositivos operacionais

- `setAccessCardStatus`: Suspender / Perdido / Reactivar no cartão digital do aluno.
- `updateTurnstileDevice`: estado online / offline / manutenção (bloqueia scan se offline/manutenção).
- Simulador: selector de dispositivo; logs com filtro Autorizados / Negados.
- Validação de token sem `students!inner` (cartões só de pessoa); aluno `inactive` negado.
- Filtros de log: `direction` e `deviceId` no schema/server.

## Ciclo 42 — RFID, QR e API key

- `linkAccessCardRfid` + UI no cartão digital (guardar / limpar tag Wiegand).
- `rotateAccessCardQr` — invalida o QR anterior.
- Validação: `gatePassLookupTokens` (sanitiza filtro PostgREST + tenta RFID normalizado).
- Dispositivos: botão **Key** copia `api_key` para controladores offline.
- Helpers: `src/features/catracas/gate-pass-token.ts`.

## Ciclo 45 — Harmonização do ecossistema (2026-08-28)

Referência canónica: [`docs/agents/ARCHITECTURE_HARMONIZATION.md`](./ARCHITECTURE_HARMONIZATION.md).

Implementado sem unificar frontends:

- URLs em cada app (`ecosystem-urls.ts` / `VITE_*` / `NEXT_PUBLIC_*`).
- API HTTP no SIGA (mesmo `provisionTenantCore`): `/api/saas/signup`, `/plans`, `/tenants`, `/stats`, `/tenants/status`.
- WEB: `/` = landing; `/start` = wizard (componentes do WEB) → API → SIGA.
- ADMIN: `/tenants` (layout Next existente) consome a API; «Nova escola» abre o WEB.
- SIGA `/saas-admin` e `/criar-escola` são pontes (redirect automático para WEB `/start`). Login «criar escola» → WEB. Menu: Documentação (DOC) e Planos (WEB).
- Assinatura suspensa no SIGA: CTA para planos WEB + suporte DOC.
- `npm run siga:sync-env` propaga `.env` raiz → `painel/web/.env.local` e `painel/admin/.env.local`.
- ADMIN `/` redirecciona para `/tenants`. DOC: nav e cards com links para WEB/ADMIN/SIGA.
- Fase 10 (parcial): `GET /api/saas/me` (ADMIN valida `platform_admins`); login ADMIN bloqueia contas escolares; middleware protege `/tenants` e `/settings/billing`; `PlatformAdminGate` no layout; login «Control Center SaaS».
- Fase 12 (parcial): `fetchSaaSStats` soma `tenant_usage` (não `students` global); lista tenants com alunos/trial; SIGA bloqueia trial expirado.
- ADMIN `/settings/billing` = catálogo SaaS via API (não mock template).
- Fase 13 (parcial): `POST /api/saas/usage/sync` + botão «Sync utilização» no ADMIN; `npm run siga:e2e-smoke`; testes de contrato em `tests/saas/ecosystem-flow.test.ts`.
- Provisionamento chama `syncTenantUsageForSchool`; signup devolve `adminTenantsUrl`; WEB `/start` ecrã final com DOC; ADMIN sidebar com sessão Supabase real.
- **Gating por plano (SIGA):** `plan-features.ts` — menu e rotas respeitam `plans.features`; banner de trial; «Criar escola» → WEB.
- **Sync automático:** `queueTenantUsageSync` após criar/alterar alunos → `tenant_usage` no ADMIN.
- **Limites de alunos:** `tenant-limits.ts` + `assertCanAddStudentForSchool` em `createStudent`/`enrollNewStudent`; banner no `AppShell` e `/alunos` (≥90% / limite; botão Nova Matrícula desactivado); badge «Limite» no ADMIN `/tenants`; testes `tests/saas/tenant-limits.test.ts`.
- **ADMIN middleware:** `/settings` (incl. billing) exige sessão Supabase como `/tenants`.
- **Smoke Fase 13:** `siga:e2e-smoke` inclui `GET /api/saas/me` (401 anónimo).
- **Billing operacional (ADMIN):** `POST /api/saas/tenants/subscription` (plano + prolongar trial); botão «Gerir» em `/tenants`.
- **Operadores SaaS:** `/platform-admins` + API `GET/POST /api/saas/platform-admins` e `POST .../revoke`; `/audit` + `GET /api/saas/audit-logs`.
- **Domínios:** `/domains` + `GET/POST /api/saas/domains` e `POST /api/saas/domains/status` (custom pending → active/failed); link «Domínios» por tenant em `/tenants`; testes schema; smoke E2E inclui APIs e rota ADMIN.
- **Subscrições:** tabela `subscriptions` populada no `provisionTenantCore` e sincronizada em `updateTenantSubscription`; `/subscriptions` + `GET /api/saas/subscriptions`; backfill `POST /api/saas/subscriptions/backfill`.
- **DOC ADMIN:** `painel/docs/admin/control-center.md` — manual do Control Center; ponte `/saas-admin` com links directos às rotas ADMIN.
- **DOC WEB:** `painel/docs/web/criar-escola.md` — wizard `/start`, API signup, testes E2E.
- **CI @live (opcional):** `prepare-ci-env.mjs` + step Playwright com `SUPABASE_SECRET_KEY`; smoke inclui páginas DOC WEB/ADMIN.
- **Playwright Fase 13:** `scripts/siga/e2e-ecosystem-playwright.py` + `npm run siga:e2e-playwright` (smoke + UI); espelho TS em `tests/e2e/`; `@live` com `SIGA_E2E_LIVE=1` (incl. login SIGA pós-provisionamento).
- **CI:** job `ecosystem-e2e` — arranca 4 apps, `SIGA_E2E_CI=1` smoke, Playwright wizard; scripts `start/wait/stop-ecosystem-ci.mjs`.
- `npm run dev:ecosystem` arranca as 4 apps. SIGA pedagógica: botão Ajuda → DOC.

### Ciclo ecossistema 5 (2026-08-28) — bootstrap, DNS, demo, DOC

- **Bootstrap pós-provisionamento:** `bootstrapSchoolDefaults` (ano lectivo, propinas, matrícula pública, académico mínimo); resposta signup inclui `bootstrapSeeded`.
- **Tenant lookup:** `GET /api/saas/tenants/lookup?slug=` + `tenant-lookup.ts`; resolução custom domain em `tenant-resolver.ts`.
- **DNS verify:** `POST /api/saas/domains/verify` + UI ADMIN «Verificar DNS».
- **Financeiro onboarding:** `FeePlanSettingsForm`, alertas `missingActiveFeePlan`, dashboard «Primeiros passos».
- **E2E:** `npm run siga:e2e-live` (provisionamento real + lookup); smoke actualizado.
- **Demo seed:** `npm run siga:sql:demo` (ordem SQL) + `npm run siga:seed-demo` (gera `SEED_ESCOLA_DEMO_FULL.sql`).
- **Tenant demo:** `SEED_ESCOLA_DEMO.sql` liga slug `dom-afonso-demo` → ADMIN + lookup API.
- **Financeiro:** `financeInvoiceBlocked` desactiva «Emitir fatura» em `/financeiro` quando schema/plano incompleto.
- **Académico:** `ensureAcademicDefaults` delega em `ensureAcademicDefaultsCore` (`academic-bootstrap.ts`); Pedagógica também cria nível, classe e turma inicial.
- **Gateway financeiro:** `POST /api/finance/gateway/confirm` + referências EMIS determinísticas; API key em Integrações → Multicaixa; `npm run siga:gateway-simulate`; UI «Referência EMIS» em `/faturas`; painel Integrações mostra URL + API key.
- **Demo usage:** `npm run siga:sync-demo-usage` após seed completo (métricas ADMIN).
- **DOC:** `web/onboarding-pos-criacao.md`, `admin/domains.md`; actualizados `criar-escola.md`, `fluxos.md`, `control-center.md`.

### Ciclo ecossistema 11 (2026-08-28) — matrícula pública E2E

- **`getPublicEnrollmentUrl(slug)`** em `ecosystem-urls.ts` — link `/matricula/$slug` (slug do tenant = slug do formulário no bootstrap).
- **Dashboard:** `getDashboardOverview` expõe `enrollmentPublicLink`; «Primeiros passos» mostra URL partilhável quando o formulário está aberto.
- **Smoke:** `GET /matricula/dom-afonso-demo` em `siga:e2e-smoke`.
- **Live E2E:** após signup API, verifica `GET /matricula/{slug}` → 200.

### Ciclo ecossistema 12 (2026-08-28) — matrícula @live + gateway produção

- **Playwright @live:** `tests/e2e/enrollment-live.spec.ts` — signup → candidatura pública → login admin → aceitar → `student_id` na BD.
- **Helper:** `tests/e2e/helpers/sga-live-admin.ts` (password E2E + consultas Supabase).
- **EMIS por escola:** `resolveSchoolEmisEntity` / `emisEntityFromIntegrationConfig` — lê `merchantId` (4–6 dígitos) em Integrações → Multicaixa; planos de pagamento usam entidade configurada.
- **Webhook Unitel:** `POST /api/finance/gateway/unitel/confirm` (canal `unitel_money` fixo); UI Integrações mostra URL dedicada.
- **API key gateway:** validação só via `webhookApiKey` (não confunde com merchant EMIS).

### Ciclo ecossistema 13 (2026-08-28) — PaymentReferenceCard + cleanup E2E

- **`PaymentReferenceCard`:** carrega referência via `generateInvoicePaymentReference` (entidade EMIS da escola em Integrações).
- **`generateInvoicePaymentReference`:** autenticado, valida fatura da escola, devolve `emisEntity` + referência determinística.
- **Cleanup @live:** `cleanupE2ETenantBySlug` — só slugs `e2e-*` / `web-*` / `mat-*` e e-mail `@siga-plus.test`; testes Playwright `@live` removem tenant no `finally`.
- **CLI:** `npm run siga:e2e-cleanup-stale` (`--dry-run`) — tenants E2E órfãos na BD.

### Ciclo ecossistema 14 (2026-08-28) — Python @live + lib cleanup

- **`e2e-cleanup-lib.mjs`:** lógica partilhada de cleanup (usada por stale, tenant CLI e Python).
- **`npm run siga:e2e-cleanup-tenant -- --slug=… --email=…`** — remove um tenant E2E.
- **Python `@live`:** `e2e-ecosystem-playwright.py` faz cleanup no `finally` após signup API e wizard; verifica `GET /matricula/{slug}`.
- **DOC:** `criar-escola.md` — comandos Playwright TS `@live` e cleanup stale.

### Ciclo ecossistema 15 (2026-08-28) — CI Playwright TS @live

- **`@playwright/test`** (devDependency) + scripts `siga:e2e-playwright-ts` e `siga:e2e-playwright-live`.
- **CI `ecosystem-e2e`:** Playwright TS rotas/wizard sempre; `@live` Python + TS quando `SUPABASE_SECRET_KEY`; cleanup stale no `finally`.
- **`siga:e2e-playwright`:** orquestra smoke → TS → Python → [@live] TS + cleanup stale.

### Ciclo ecossistema 16 (2026-08-28) — artefactos Playwright CI

- **`playwright.config.ts`:** `outputDir`, reporter HTML, `trace`/`video` `retain-on-failure` na CI.
- **CI:** upload artefacto `playwright-e2e-report` (HTML + traces) quando o job falha (14 dias).
- **`.gitignore`:** `test-results/`, `playwright-report/`.
- **`npm run siga:e2e-playwright-report`** — ver relatório local após falha.

### Ciclo ecossistema 17 (2026-08-28) — CI @live nocturno

- **Workflow** `.github/workflows/ecosystem-e2e-live.yml` — cron `03:00 UTC` + `workflow_dispatch`.
- **`siga:e2e-live-only`** / `e2e-ecosystem-live.mjs` — smoke + Python `@live` + Playwright TS `@live` + cleanup (sem repetir suite não-live).
- Skip automático quando `SUPABASE_SECRET_KEY` não está configurado (forks / repos sem secrets).
- Artefacto `playwright-e2e-live-report` em falhas.

### Ciclo ecossistema 18 (2026-08-28) — alertas Slack E2E

- **`notify-ci-failure.mjs`** — POST opcional para Slack (`SLACK_E2E_WEBHOOK_URL`).
- **Jobs `notify`:** em `ecosystem-e2e-live.yml` (nocturno) e `ci.yml` (`ecosystem-e2e-notify` em falha de PR/push).
- **DOC / `.env.example`:** secret Slack documentado.

### Ciclo ecossistema 19 (2026-08-28) — alertas e-mail + DOC gateway

- **`notify-ci-failure.mjs`** — complemento Resend (`RESEND_API_KEY`, `E2E_ALERT_EMAIL_TO`, `E2E_ALERT_EMAIL_FROM` opcional); Slack + e-mail em paralelo; exit 0 se nenhum canal configurado.
- **DOC:** `painel/docs/integracoes/emis-multicaixa-unitel.md` — webhooks EMIS e Unitel, entidade por escola, teste local.
- **Sidebar VitePress** `/integracoes/` + link em `fluxos.md` e `GatewayWebhookHint` (Definições → Integrações).

### Ciclo ecossistema 20 (2026-08-28) — E2E @live gateway EMIS

- **`tests/e2e/gateway-live.spec.ts`** — signup → fatura + plano `pending_gateway` → POST webhook → fatura `paid` + plano `settled`.
- **Dois cenários:** `SIGA_GATEWAY_DEV_API_KEY` (modo dev) e `webhookApiKey` por escola (Integrações).
- **Helpers** em `sga-live-admin.ts`: `seedE2EGatewayFixture`, `installE2EMulticaixaIntegration`, slugs `gw-*`.
- **CI:** `prepare-ci-env.mjs` injecta `SIGA_GATEWAY_DEV_API_KEY`; incluído em `siga:e2e-playwright-live`.

**Próximo opcional:** integração real EMIS/Unitel no portal externo (credenciais de produção).

### Ciclo ecossistema 21 (2026-08-28) — E2E @live Unitel

- **`gateway-live.spec.ts`** — dois cenários Unitel: dev key + `webhookApiKey` da escola em `POST /api/finance/gateway/unitel/confirm`.
- **`installE2EUnitelIntegration`** + `seedE2EGatewayFixture({ channel: "unitel_money" })` em `sga-live-admin.ts`.
- **DOC** integrações — três modos de verificação @live (EMIS dev, EMIS escola, Unitel).

**Próximo opcional:** credenciais reais no portal EMIS/Unitel (externo ao SIGA).

### Ciclo ecossistema 22 (2026-08-28) — checklist produção gateway

- **DOC:** `painel/docs/integracoes/gateway-producao.md` — fases operador/escola/portal banco, go-live, segurança.
- **Sidebar** + links em onboarding, fluxos, `GatewayWebhookHint`, manual EMIS/Unitel.
- **CLI:** `npm run siga:gateway-simulate -- --unitel` — simulador Unitel (URL `/unitel/confirm`).

**Próximo opcional:** runbook suporte (escalation quando webhook falha em produção).

### Ciclo ecossistema 23 (2026-08-28) — runbook suporte gateway

- **DOC:** `painel/docs/integracoes/gateway-runbook-suporte.md` — triagem, mapa HTTP→acção, L1–L4, confirmação manual.
- **Sidebar** + links em checklist produção, manual EMIS/Unitel, `GatewayWebhookHint`.
- **Índice** integrações — entrada «Incidentes webhook».

**Próximo opcional:** métricas/alertas de webhook falhado (observabilidade produção).

### Ciclo ecossistema 24 (2026-08-28) — observabilidade webhook gateway

- **Tabela** `finance_gateway_webhook_events` em `APPLY_IN_SQL_EDITOR.sql` (RLS leitura Administrador/Tesouraria).
- **`gateway-webhook-telemetry.ts`** — `recordGatewayWebhookEvent`: log JSON, insert SGA, Slack opcional (`SIGA_GATEWAY_ALERT_SLACK_URL`).
- **Handler** `runFinanceGatewayWebhook` regista cada tentativa (sucesso ou falha).
- **UI** Definições → Integrações: últimos 5 webhooks por canal em `GatewayWebhookHint`.
- **CLI** `npm run siga:gateway-events-recent [--failures-only] [--limit=N]`.
- **Testes** `tests/finance/gateway-webhook-telemetry.test.ts`.

### Ciclo ecossistema 25 (2026-08-28) — dashboard ADMIN webhooks gateway

- **API** `GET /api/saas/gateway-webhooks` — `platform_admins`, agrega `finance_gateway_webhook_events` cross-tenant.
- **`gateway-webhook-metrics.ts`** — função pura `aggregateGatewayWebhookMetrics` (24h, 7d, por canal, top escolas).
- **ADMIN** `/gateway-webhooks` — cartões resumo + tabelas falhas recentes e escolas afectadas.
- **Sidebar** + command search + `fetchGatewayWebhookMetrics` em `painel/admin/src/lib/saas-api.ts`.
- **Testes** `tests/finance/gateway-webhook-metrics.test.ts`.

### Ciclo ecossistema 26 (2026-08-28) — alerta taxa de falha gateway

- **`gateway-failure-rate-alert.ts`** — avalia taxa 24h, Slack/Resend, cooldown via `saas_audit_logs` (`GATEWAY_FAILURE_RATE_ALERT`).
- **Telemetria** — após falha HTTP ≥ 400, `recordGatewayWebhookEvent` dispara verificação assíncrona.
- **CLI** `npm run siga:gateway-failure-rate-check` — cron horário sugerido.
- **ADMIN** `/gateway-webhooks` — banner quando taxa 24h ≥ 25% (≥ 5 eventos).
- **Testes** `tests/finance/gateway-failure-rate-alert.test.ts`.

**Próximo opcional:** credenciais reais EMIS/Unitel no portal externo (fora do SIGA).

### Ciclo ecossistema 27 (2026-08-28) — portal banco + CI horária

- **DOC:** `painel/docs/integracoes/gateway-portal-banco.md` — modelo e-mail/ticket EMIS/Unitel, checklist portal.
- **Checklist produção** Fase 6 observabilidade; links cruzados manual EMIS + índice.
- **CI:** `.github/workflows/gateway-failure-rate-check.yml` — cron horário (secrets opcionais).
- **ADMIN** `/gateway-webhooks` — último alerta de taxa (`GATEWAY_FAILURE_RATE_ALERT`).
- **Auditoria** — badge «Alerta taxa webhook» para acção de rate alert.

### Ciclo ecossistema 28 (2026-08-28) — rotação webhookApiKey

- **`gateway-webhook-key.ts`** — geração, rotação, match com graça 24h (`webhookApiKeyPrevious`).
- **`rotateGatewayWebhookApiKey`** — server fn Administrador; actualiza `school_integrations`.
- **Handler** `resolveGatewaySchoolByApiKey` aceita key anterior dentro da graça.
- **UI** Definições → Integrações — botão «Rotacionar key» + aviso de graça activa.
- **Testes** `tests/integrations/gateway-webhook-key.test.ts`.
- **DOC** checklist produção + manual EMIS/Unitel.

### Ciclo ecossistema 29 (2026-08-28) — SAFT-AO / AGT exportação

- **Correcção:** `exportSaftAoXml` lia tabela `invoices` inexistente — passou a `finance_invoices` com alunos/contratos.
- **`saft-export.ts`** — validação NIF AGT, período fiscal, mapeamento faturas.
- **UI** `/faturas` — submenu SAFT por ano fiscal + toasts de aviso.
- **AGT** — certificação software do painel Financeiro entra no XML.
- **DOC** `painel/docs/financeiro/saft-agt-exportacao.md`.
- **Testes** `tests/finance/saft-export.test.ts`.

**Próximo opcional:** recibos FR no SAFT ou validação XSD AGT offline.

## Ciclo 43 — lista de cartões e webhook físico

- `listAccessCards` + painel em `/catracas` (pesquisa, filtro estado, suspender/reactivar).
- `validateGatePassByDeviceApiKey` — leitores físicos autenticam com `api_key` (sem login).
- Lógica partilhada em `gate-pass-validation.ts` (`evaluateGatePassAccess`).
- `issueAccessCard` para emitir cartão a pessoa/staff.
- Controlador: POST com `{ apiKey, token, direction }` → `{ granted, personName, … }`.

## Ciclo 44 — bridge Python ligado ao SIGA

- Rota HTTP pública `POST /api/catracas/device-scan` (sem CSRF/sessão) — autentica por `apiKey` do dispositivo.
- Handler partilhado em `device-webhook-handler.ts` (UI serverFn + rota HTTP).
- Daemon Python: webhook `/hardware/webhook/scan` chama o SIGA, regista log e dispara relé se `granted`.
- Config local `siga_hardware_bridge_config.json`: URL SIGA, API key, IP relé (`GET|POST /hardware/bridge-config`).
- UI desktop: secção «Validação SIGA» em `WindowsDesktopSettingsModal`.

## Ciclo 49 — Modularização de Monólitos UI e Suíte de Testes WhatsApp

- **Modularização de `settings-panels.tsx` (1658 linhas → 19 linhas)**:
  - Extraído `settings-shortcuts-row.tsx`: atalhos de módulos.
  - Extraído `settings-school-panel.tsx`: preferências institucionais, anos lectivos e validação Zod.
  - Extraído `settings-billing-panel.tsx`: parâmetros de propinas e regras de cobrança.
  - Extraído `settings-finance-panel.tsx`: dados bancários (IBAN BNA) e AGT.
  - Extraído `settings-pedagogical-panel.tsx`: níveis angolanos e perfil superior.
  - `settings-panels.tsx` convertido em hub de re-exports (zero breaking changes).
- **Modularização de `src/routes/pedagogica.tsx` (1727 linhas → 570 linhas)**:
  - Extraído `AssignTeacherForm.tsx`: ligação de professores a turmas/disciplinas.
  - Extraído `TurmasWorkspaceTab.tsx`: grelha de turmas, ocupação, integrações LMS e filtros.
  - Extraído `DisciplinasWorkspaceTab.tsx`: catálogo por ciclos angolanos, taxas de aprovação e acções.
- **Modularização de `FileBrowser.tsx` (1740 linhas → 1360 linhas)**:
  - Extraído `FileBrowserNav.tsx`: repositórios (escola, secretaria, pessoal, público) e OneDrive.
  - Extraído `FileBrowserGrid.tsx`: grelha de cartões com selecção e progresso de upload.
  - Extraído `FileBrowserTable.tsx`: tabela detalhada de ficheiros, IDs e auditoria de acções.
- **Integração WhatsApp Client**:
  - `whatsapp-client.ts` coberto por suíte de testes unitários `tests/integrations/whatsapp-client.test.ts` (normalização E.164, limite de 50 destinatários, resolução de credenciais e mock HTTP Graph API).
- **Qualidade & Validação**:
  - `npm run siga:check` 100% verde (16 módulos verificados).
  - 92 ficheiros de teste e 560 testes a passar em Node 24.

## Ciclo 50 — Correção Integral de Tipos, Resolução de Erros e Estabilidade do Build

- **Resolução de Erros de Tipos (TypeScript 100% Limpo — 0 Erros com `tsc --noEmit`)**:
  - `src/routes/faturas.tsx` & `src/routes/financeiro.tsx`: importação do utilitário `cn`.
  - `src/features/academic/AssessmentCenter.tsx`: corrigido `<Stat>` para `<AssessmentStat>` em estatísticas.
  - `src/features/auth/server.ts`: tipagem forte de `EnrollmentRow` para leitura de médias e assiduidade sem restrição indevida.
  - `src/features/catracas/components/AccessCardsPanel.tsx`: tipagem estrita de `onChange` no `ListFilterBar`.
  - `src/routes/calendario.tsx`: assinatura tipada com `{ dia?: string }` em `validateSearch`, tornando a propriedade `search` opcional nos links.
  - `src/features/dashboard/portals/GuardianPortalDashboard.tsx` & `StudentPortalDashboard.tsx` & `TeacherPortalDashboard.tsx`: passagem correcta de argumentos em `data: { ... }` para `createServerFn`.
  - `src/features/pedagogica/components/AttendanceCallDialog.tsx` & `AttendanceJustificationModal.tsx`: passagem de `data` nas mutações e queries de chamadas/justificativas.
  - `src/features/pedagogica/components/AttendanceWorkspaceModule.tsx`: importação de `ReviewAttendanceJustificationModal` e normalização de queries.
  - `src/features/pedagogica/components/TurmasWorkspaceTab.tsx`: tratamento de `t.code` nulo para `classroomCourseHref`.
  - `src/features/saas/tenant-limits.ts`: flexibilização de tipo `TenantCapacityInput` suportando tenant completo ou campos parciais.
  - `src/features/integrations/install.ts`: adicionado módulo `"pessoas"` a `SigaHostModule` e `moduleLabel`.
  - `src/lib/desktop-utils.ts`: importação dinâmica resiliente com fallback para o plugin nativo do Tauri.
- **Validação de Qualidade Global**:
  - `npx tsc --noEmit`: **0 erros** (código 0).
  - `npm run siga:check`: **16 módulos validados com sucesso**.
  - `npm test`: **92 ficheiros de teste e 560 testes aprovados** (100% verde).
  - `npm run build`: **compilação em 6.26 segundos** sem qualquer falha.

## Ciclo 51 — Validador SAF-T AGT Offline e Paginação Canónica

- **Validador Estrutural SAF-T AO (Portaria n.º 63/19 da AGT)**:
  - Criado `src/features/finance/saft-validator.ts`: validação offline do ficheiro XML gerado (tags obrigatórias de cabeçalho, NIF, contagem real vs. declarada de faturas e integridade dos totais fiscais).
  - Integrado em `src/routes/faturas.tsx`: opção "Validar Estrutura AGT" no dropdown e validação instantânea no download de SAF-T.
  - Testes unitários em `tests/finance/saft-validator.test.ts` (3 testes aprovados).
- **Componente Canónico de Paginação (`ListPaginationBar`)**:
  - Criado `src/components/filters/ListPaginationBar.tsx`: controlo unificado com intervalo dinâmico, seletor de itens por página e paginação acessível.
  - Integrado nas listagens de `/alunos` e `/faturas`.
  - Testes unitários em `tests/ui/pagination-bar.test.ts` (3 testes aprovados).
- **Validação & Estado**:
  - `npx tsc --noEmit`: **0 erros**.
  - `npm run siga:check`: **16 módulos verificados com sucesso**.
  - `npm test`: **94 ficheiros · 566 testes aprovados** (100% verde).

## Ciclo 52 — Conformidade AGT, SAF-T AO com Recibos (RG/RC), Harmonização de Loading e Realtime

- **SAF-T AO Avançado (Portaria n.º 63/19 e Decreto Presidencial 312/18)**:
  - `src/features/finance/saft-generator.ts`: adicionado suporte completo ao bloco `<Payments>` com tipos `RG` (Recibo Geral) e `RC` (Recibo de Caixa), referenciando `<OriginatingON>` e `<SettlementAmount>`.
  - Suporte completo aos tipos fiscais `FT`, `FR`, `FS`, `NC`, `ND`, `RG` e `RC`.
  - `src/features/finance/saft-validator.ts`: validação de recibos, datas de transação e acumulação de `grossPaymentsTotal`.
  - Testes em `tests/finance/saft-generator.test.ts` e `tests/finance/saft-validator.test.ts`.
- **Harmonização do Estilo de Loading (Admin → SIGA)**:
  - Criado `src/components/ui/page-loading.tsx` e `src/components/ui/loading-spinner.tsx` replicando o estilo do `painel/admin` com spinner circular limpo e legenda contextual.
  - Integrado em `AuthGate.tsx`, `RouteAccessGate.tsx` e `src/routes/__root.tsx` (`pendingComponent`).
  - Loadings internos (botões, formulários, tabelas, modais) rigorosamente preservados.
- **Realtime (Supabase postgres_changes)**:
  - `src/features/messages/StaffMessenger.tsx`: canal Realtime para `direct_messages` — atualizações instantâneas de DMs sem polling periódico.
  - `src/routes/comunicacoes.tsx`: canal Realtime para `school_announcements` — feed de comunicados atualiza ao vivo.
- **Correção crítica: Comunicações (`school_announcements`)**:
  - `src/features/communications/schemas.ts`: corrigidos `audience` options de `['school']` para os 5 valores reais da constraint DB: `all_guardians`, `guardians_with_debt`, `students_secondary`, `students_finalists`, `teaching_staff`.
  - `src/features/communications/server.ts`: corrigido nome de tabela de `announcements` → `school_announcements`; removidos mapeamentos de status `published/archived` que não existem na DB; `archiveSchoolAnnouncement` usa soft-delete via `deleted_at`; todas as queries filtram `deleted_at IS NULL`.
  - `src/routes/comunicacoes.tsx`: `audienceLabel` atualizado com todos os 5 destinos reais; fallback corrigido de `'school'` → `'all_guardians'`.
  - Testes de `tests/communications/schemas.test.ts` expandidos: **10 testes** incluindo validação de que `'school'` é rejeitado e todos os 5 valores DB são aceites.
- **Documentação e Dossiê Fiscal**:
  - Atualizado `painel/docs/financeiro/saft-agt-exportacao.md` e gerado dossiê fiscal técnico sobre a AGT e o ensino em Angola.
- **Validação & Estado**:
  - `npm run siga:check`: **100% aprovado**.
  - `npm test`: **100 ficheiros · 688 testes aprovados** (100% verde em Node 24).

## Ciclo 53 — Realtime Dashboard, Correção Comunicações e Testes Catracas

- **Correção crítica: `announcements` → `school_announcements`**:
  - `src/features/communications/server.ts`: corrigido nome de tabela de `announcements` → `school_announcements`; eliminados mapeamentos de status `published↔sent` e `archived↔cancelled` que não existiam na DB; `archiveSchoolAnnouncement` agora usa soft-delete via `deleted_at`; todas as queries filtram `deleted_at IS NULL`.
  - `src/features/communications/schemas.ts`: `announcementAudienceOptions` expandido de `['school']` para os 5 valores reais da constraint DB: `all_guardians`, `guardians_with_debt`, `students_secondary`, `students_finalists`, `teaching_staff`.
  - `src/routes/comunicacoes.tsx`: `audienceLabel` atualizado com todos os 5 destinos reais; fallbacks corrigidos de `'school'` → `'all_guardians'`.
  - `tests/communications/schemas.test.ts`: expandido de 6 → **10 testes**; valida que `'school'` é rejeitado e todos os 5 valores DB são aceites.
- **Realtime — Dashboard (`src/routes/index.tsx`)**:
  - Adicionado `useEffect` com canal `dashboard_realtime_overview` subscrevendo a `*` em `students`, `*` em `enrollments`, `INSERT` em `invoices` e `INSERT` em `school_announcements`.
  - Ao receber qualquer evento, invalida `["dashboard", "overview"]` automaticamente.
  - Cleanup correcto com `supabase.removeChannel(channel)`.
- **Testes catracas — `gate-pass-validation` (`tests/catracas/gate-pass-validation.test.ts`)**:
  - **CRIADO** — **12 testes** cobrindo os casos mais críticos de acesso:
    - Dispositivo offline/manutenção → bloqueado sem tocar na BD.
    - Cartão não encontrado → negado + log.
    - Cartão suspenso/inactivo/cancelled → negado com razão correcta.
    - Aluno inactivo com cartão activo → negado.
    - Staff sem `student_id` → acesso concedido.
    - Entrada e saída com cartão e aluno activos → acesso concedido com `direction`, `timestamp`, `cardNumber`, `studentId`.
    - `findGatePassCard`: retorno correcto, null e iteração de múltiplos tokens.
- **Validação & Estado**:
  - `npm run siga:check`: **100% aprovado**.
  - `npm test`: **101 ficheiros · 700 testes aprovados** (100% verde em Node 24).

## Ciclo 54 — Cobertura UI Realtime e Expansão de Testes Pedagógicos

- **Subscrições Realtime em Rotas Principais**:
  - `src/routes/faturas.tsx`: Escuta as tabelas `invoices` (INSERT, UPDATE) e `payments` (INSERT). Invalida `["finance", "invoices"]`, `["finance", "reporting"]`, e `["dashboard", "overview"]` mantendo os painéis financeiros vivos.
  - `src/routes/documentos.tsx`: Escuta a tabela `siga_document_requests` (*). Invalida `["documents", "workspace"]` e `["dashboard", "overview"]` (ideal para pedidos entrados no portal do aluno/encarregado).
  - `src/routes/alunos/index.tsx`: Escuta `students` (*) e `enrollments` (*). Invalida `["students", "search"]` e `["dashboard", "overview"]`.
  - `src/features/messages/StaffMessenger.tsx`: **Correção crítica** — a tabela de mensagens diretas no backend era `siga_direct_messages` mas o cliente realtime estava a escutar `direct_messages`. Corrigido para a tabela correta para fazer os chats funcionarem em tempo real.
- **Sincronização de Dados (Integração EMIS)**:
  - Scaffolding de `src/features/integrations/emis.ts` (normalização rigorosa de classes/anos lectivos usando taxonomia EMIS).
  - Criado payload builder `buildEmisExportPayload` para mapear dados internos para a taxonomia estatal de forma previsível (lidando também com géneros cruzados).
  - Testes com ordem hierárquica inversa de "matching" de substrings (`12ª` antes de `2ª`) garantindo output robusto.
  - Interface do módulo de alunos atualizada para usar este formato rigoroso através da acção "Formato SIGE".
- **Sistema Bancário Angolano (`src/lib/angola-banking.ts`)**:
  - Dicionário `ANGOLA_BANK_CODES` massivamente expandido com os principais bancos comerciais (BMA, BCI, BE, BNI, Yetu, Access Bank, Sol, BCA).
  - Ficheiro `angola-banking.test.ts` expandido para validar os novos bancos comerciais e mapeamento nulo para desconhecidos.
- **Centro de Avaliação (Assessment Center)**:
  - Corrigido um *bug* na função `copyPreviousTerm` e no parse do estado inicial onde notas em branco (`null` na DB) eram convertidas para a string `"null"`, causando lixo visual no painel do professor. Agora faz fall-back para empty string `""` corretamente.
- **Ecossistema SaaS e Lógica Central**:
  - Tabela `school_invitations` restaurada e aprovisionada no Supabase de produção, fechando a lacuna de 30/31 tabelas no verificador (`npm run siga:sql:verify`). As verificações da base de dados encontram-se a 100%.
  - Nova suite `tests/saas/public-signup.test.ts` construída para atestar e cobrir a proteção heurística de limite de taxa (*rate-limiting* por IP e por Email) no percurso do Funil Comercial (Inscrição Escolar SaaS).
- **Testes da Área Pedagógica (`tests/pedagogica/pautas.test.ts`)**:
  - **Expandido** de 6 para **24 testes**.
  - Cobertura completa adicionada para: `isGrade`, `normalizeGrade`, `roundGrade`, `formatGrade`.
  - Novos testes para `calculateExamFinalGrade` com verificação de pesos (ex. NF = MFD*0.6 + Exame*0.4) e handling de fallbacks null.
  - Novos testes para `deriveElectronicStatusClass` garantindo as cores corretas por estado (verde/APROVADO, vermelho/REPROVADO, âmbar/ADMITIDO).
- **Testes de Alertas no Dashboard (`tests/dashboard/alerts.test.ts`)**:
  - **Expandido** de 2 para **9 testes** abrangendo todos os 4 tipos de avisos (`candidaturas`, `matricula`, `documentos`, `faturas`).
  - Cobertura completa de singulares, plurais e rotas de encaminhamento (links e painéis de definições).
- **Inteligência Preditiva (Fase 2 - ML Suggestions)**:
  - Novo motor `dashboard-overview` embutido. Sugestões contextuais (`dashboard-suggestion-rules.ts`) analisam candidaturas pendentes, configuração do ano letivo e calendário. As sugestões geradas mapeiam diretamente para o `ContextualActionsPanelHost` na *home* da escola.
  - Criado o `narrative-engine.ts` que compila relatórios contextuais em formato SMS humano a partir de *snapshots*. O motor infere e acopla a sugestão "Partilhar Relatório de Inteligência" sempre que um encarregado esteja associado ao perfil.
- **Validação & Estado**:
  - `npm run siga:check`: **100% aprovado**.
  - `npm test`: **102 ficheiros · 721 testes aprovados** (100% verde em Node 24).

## Próximos passos úteis

0. **Ecossistema:** seguir Fases 10–13 em `ARCHITECTURE_HARMONIZATION.md`. Não
   unificar frontends. Não apagar `/saas-admin` sem destino no ADMIN.
0b. **Dívida UI:** realtime nas DMs e canais de comunicação.
0c. **Integrações:** credenciais reais de portal bancário e sincronização automática EMIS.
1. Utilizador aplica o SQL; confirmar com `npm run siga:sql:verify`.
2. Manter commits pequenos por alteração e nunca incluir `.env` nem `.claude/worktrees/`.
3. Aceitar candidatura cria aluno, encarregado (se veio no formulário) e opcionalmente turma (`classGroupId`). Sem turma fica `applicant`. Em `/alunos`: **Turma** (candidato), **Mudar** (activo), **Estado** e PDF **Oficial**. Campanha de matrícula (Definições) liga a `/documentos#modelos` para talões.
4. Emitir em `/documentos` usa o modelo `.hbs` escolhido em **Modelos de impressão** (Ver / Editar / Usar). Cabeçalho da página tem botão **Modelos** (`#modelos`). Atalhos: Definições → Escola → **Atalhos**, `/configuracoes?painel=documentos` ou campanha de matrícula. A lista de pedidos também tem **Oficial**. A ficha do aluno emite **Boletim**, **Histórico**, **Declaração** e **Mais modelos** (dossiê, certificado, credenciais). Pedagógica: pauta, boletim, mapa, acta e validação. Workspace do professor: **Diário**. Relatórios académicos e talões de candidatura/matrícula também. Sem modelo ou se falhar, cai no PDF MINED. Pedidos já emitidos têm **PDF**. Pedidos em curso: **Recusar** e **Cancelar**. Ficha também: **Fatura** e **Documento**.
5. Pedagógica: **Atribuir professor** liga `class_subjects.teacher_id`. Disciplinas: **Editar** e **Desactivar**. Horários: **Copiar** slot para outro dia. Na pauta, **Copiar trimestre anterior** preenche MAC/NPP/NPT (depois Guardar). Cabeçalho da área pedagógica tem **Pauta Oficial** e **Turmas Oficial**; grelha e centro de avaliação também. Centro de avaliação: **Imprimir** usa `issuePrintDocument` (pauta oficial), não `window.print`.
6. Dashboard: candidatos abrem Confirmar Matrícula. Comunicados publicados aparecem no início. Em `/comunicacoes`: **Editar**, **Arquivar**, **Republicar**, **Imprimir** e **Oficial**. `/calendario` e `/alunos` **Oficial** usam o modelo de serviço. `/pessoas` tem **Oficial** do corpo docente e do registo central. `/acessos` imprime **Credenciais**, **Oficial contas** e **Oficial equipa**. Ficha do professor também tem **Credenciais**. `/acessos`: **Reenviar** copia o link de convite/recuperação.
7. `/faturas`: **Fatura** e **Receber**/**Recibo** usam o modelo `service-document` com secção **Dados de pagamento** (IBAN em Definições → Financeiro). Lista de faturas tem **Oficial**. Sem recibos: **Anular**. Ficha do aluno (Admin) também recebe. Caixa: **Recibo** no lançamento e **Oficial** na lista. Planos: **Talão**. Relatório financeiro **Oficial** (completo) e **Oficial cobrança** / **Oficial categorias** — todos com IBAN/logótipo quando configurados. Dashboard mostra pedidos de documento pendentes e liga a `/documentos`.
8. Ficha do professor: **Editar**, **Atribuir disciplina** e **Desligar**. Registo central: **Editar** pessoa. Relatórios académicos têm PDF **Oficial**. Relatórios financeiros também têm **Oficial**.
9. `/calendario`: Admin/Secretaria **Editar** e **Apagar** períodos (`terms`). Cada período tem **Imprimir**; a lista tem PDF **Oficial**. Pedagógica → Horários: lista de slots com **Remover** (`deleteScheduleSlot`). Planos de pagamento pendentes têm **Cancelar**.
10. Convite/cargo Professor cria ficha HR (`ensureTeacherHrRecord`). Liga `teachers.user_id` se a coluna existir; senão resolve por email.
11. Gateway real Multicaixa/Unitel — fora de âmbito (só config + plano `pending_gateway`).
12. Sidebar: hover expande, modal encolhe. Árvore Curso/Nível → turmas → disciplinas. Primário/iniciação abre pauta da turma; I/II ciclo abre a disciplina do professor. **Navegação:** sidebar e launcher derivam de `navigation-catalog.ts`; logótipo da escola só no topo da sidebar; `npm run siga:check-nav` valida cobertura por papel.
13. Integrações catalog-ready estão ligadas em todos os módulos autenticados (toolbars `InstalledModuleTools`, WhatsApp/Resend por linha, botões SIGE/AGT). Relatórios académicos e financeiros copiam resumo Resend. Definições → Integrações reflecte estado real; Gmail mostra nota quando Resend já está instalado. `/alterar-senha` explica 2FA. Configurações vivem no modal (`SettingsCenter`); `/configuracoes?painel=integracoes` abre o painel e redirecciona para `/`; `/configuracoes?painel=documentos` abre `/documentos#modelos`.
14. **Identidade Angola:** BI/NIF com `AngolaIdentityField` (validar formato + BI online) em `/pessoas`, matrícula interna e `/matricula/$slug` — validação Zod no servidor (`personCoreFieldsSchema`). Escola: NIF AGT, logótipo (URL ou upload), dados bancários e AGT em Definições. Perfil: telemóvel em Definições → Conta (`profiles.phone` no SQL). Ficha da pessoa: lista `person_documents` e **Adicionar documento**; BI sincroniza `national_id`. Aplicar `APPLY_IN_SQL_EDITOR.sql` inclui bucket `school-logos`.

## Checklist manual — integrações (após SQL)

1. Definições → Integrações: instalar **WhatsApp Business**, **Resend** e **Multicaixa Express** (consentimento + capacidades).
2. Waffle: apps aparecem na secção correcta; estado «Ligado» após instalar.
3. `/comunicacoes`: publicar canal E-mail copia texto; cartões têm WhatsApp/Resend.
4. `/matricula/$slug` (público): **WhatsApp** e **E-mail** da secretaria só com integração; sem instalar, contactos ocultos.
5. `/financeiro` e `/faturas`: toolbars Multicaixa/AGT; plano com referência EMIS.
6. `/acessos`: Reenviar + E-mail/WhatsApp na linha de convite.
7. `npm test` (Node 24) — inclui `tests/integrations/*` e `tests/documents/*`. CI (`.github/workflows/ci.yml`) corre lint + test + build.
8. **Desempenho:** Definições → Desempenho ou consola `window.__sigaPerf`. Pré-busca ao hover no menu (dados + chunks Recharts); pesquisa debounced 220 ms. Impressão oficial carrega motor só ao clicar (`print-issue-loader`).
9. `/documentos#modelos`: escolher **Usar** num modelo; emitir declaração na ficha do aluno e lista **Oficial** em comunicados/caixa.

## Não seguir relatórios antigos

Explorações pré-ciclo 1–6 estão desactualizadas. Já existem: `/matricula/$slug`, `SequentialSheetModal`, WhatsApp na turma, `ListFilterBar` + param `lf`, feed ICS (`terms`), MFA TOTP, grants, planos de pagamento, workspace do professor, lançador waffle no cabeçalho (apps + integrações, incl. AGT). Cada integração tem pacote de instalação com permissões. Funções entram nos ecrãs via `InstalledModuleTools` / `hasCapability`. Rotas públicas: `publicInstalledProviderIds` + `publicSchoolPhone` / `publicSchoolEmail` (telefone/e-mail só quando WhatsApp/Resend instalados). Sem HTTP a terceiros.

Testes: **Node 24**. Node 26 neste macOS aborta (`dyld libc++`, exit 134).
