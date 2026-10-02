# Auditoria SIGA Plus — 2. Gestão institucional e multi-tenant

**Data:** 2026-09-23 · **Âmbito:** apenas a área 2 · **Código não alterado.**

Cobertura de testes da área: **33 ficheiros em `tests/saas/`**. Verificações adicionais
feitas ao vivo contra a produção (leitura apenas, chave anónima e retrato do esquema).

---

## 2.1 Criação de instituições, configuração inicial, identidade, ano lectivo e níveis

**Parcialmente implementado, com um caminho morto de grande dimensão.**

Existe em produção um assistente de instalação completo, em oito funções `private.*` com
invólucro público: `configure_school_identity_campus`, `configure_academic_structure`,
`configure_financial_plan`, `configure_assessment_rules`, `configure_default_modules`,
`configure_school_owner`, `finalize_installation` e `installer_database_health`
(`supabase/migrations/20260908210000_capture_all_db_functions.sql`). Criam níveis
académicos, curso, classe, ano lectivo, períodos e escala de notas.

**Achado (P1): esse assistente não funciona e ninguém o chama.**

- As oito funções escrevem o progresso em `public.installation_runs`
  (`update public.installation_runs set current_step = …`), e **essa tabela não existe**.
  Confirmado ao vivo: `GET /rest/v1/installation_runs` → `PGRST205`.
- A aplicação **não invoca nenhuma das oito** — zero referências em `src/` a qualquer
  delas.

É a mesma classe de divergência já corrigida noutros módulos: código de produção escrito
contra um modelo que não está lá. O caminho que hoje cria escolas é outro
(`features/saas/school-bootstrap.ts`, `public-signup.ts`, coberto por
`tests/saas/school-bootstrap.test.ts` e `public-signup.test.ts`); as oito funções são peso
morto que aparenta ser a via oficial.

## 2.2 Domínios, subdomínios, planos, subscrições e funcionalidades contratadas

**Implementado.** `tenant_domains` (11 colunas), `reserved_subdomains`, `slug_reservations`
e `school_slug_history` existem. Verificação e sondagem de domínios em
`features/saas/domain-verify.ts` e `domain-polling.ts`, com testes próprios
(`tests/saas/domain-verify.test.ts`, `domain-polling.test.ts`, `platform-domain.test.ts`).

`plans` (13 colunas), `subscriptions` e `subscription_addons` suportam planos e
funcionalidades contratadas; limites por plano com sobreposição por tenant em
`features/saas/plan-features.ts` e `tenant-limits`, com testes de capacidade
(`resolveMaxStudents`, `buildStudentCapacity`).

Corrigido em ciclo anterior e **confirmado aplicado hoje**: `tenant_provisioning` era
actualizada com `dns_status` (a coluna é `domain_status`) e filtrada por `tenant_id`, que
essa tabela não tem — o estado do domínio nunca chegava ao painel. Também
`school_email_routes`, que era escrita com cinco nomes inexistentes; a coluna
`cloudflare_route_id` que faltava **já está em produção**.

## 2.3 Províncias, municípios, turnos, cursos, classes, salas, períodos e calendário

**Implementado.** `schools` e `people` têm `province`/`municipality` (e `commune` em
`people`); `school_shifts`/`school_shift_slots` para turnos; `programs`, `grade_levels`,
`rooms`, `terms`, `academic_years` e `academic_levels` para a estrutura académica.

**Nota:** `school_shifts`, `school_shift_slots`, `subject_types`, `curricula` e
`curriculum_*` constam de `RLS_PENDING` em `tests/security/rls-school-tables.test.ts` —
**têm RLS na produção**, o que falta é a declaração no repositório. Distinção já registada
nesse ficheiro.

## 2.4 Activação, suspensão, reactivação e eliminação sem afectar outros tenants

**Implementado, com defesa na base.** `schools.status`, `tenants.status` e
`tenants.subscription_status` sustentam os estados; o bloqueio por subscrição é aplicado no
cliente (`features/saas/tenant-context.tsx`, via `getTenantAccessBlock`).

O isolamento não depende só da aplicação: existem **7 funções `*_assert_*_same_school`** e
**134 triggers** em produção que recusam linhas a cruzar escolas (por exemplo
`hr_assert_payment_destination_school`, `enforce_person_document_school`). Somado a
**156/156 tabelas com RLS e 296 políticas**, é o ponto mais forte desta área.

**Não verificado:** eliminação de escola (não encontrei caminho de `delete` auditado;
existe `archive_school_record`, que sugere arquivo em vez de eliminação).

## 2.5 Configurações por instituição e acesso da administração global

**Implementado.** `school_settings` por domínio de configuração, `school_branding` para
identidade visual, `staff_module_grants` e `configure_default_modules` para módulos
activos. Administração global via `platform_admins` e `features/saas/platform-guard.ts`,
com `requireTenantAccess` a exigir que a escola da sessão pertença ao tenant pedido, ou
privilégio de plataforma (`platform-guard.ts:28-53`). Testes: `tenant-access.test.ts`,
`tenant-security.test.ts`, `admin-account.test.ts`.

Boa postura confirmada ao vivo: `school_settings` recusa o papel anónimo com `42501`.

## 2.6 Importação/exportação e segregação de ficheiros institucionais

**Implementado e corrigido recentemente.** Motor de importação com 22 módulos, validação
por linha, pré-visualização e `dryRun` em todos (`src/features/import/`), com
`tests/import/` a cobri-los. Cinco importadores escreviam para tabelas do modelo Lovable
(`courses`, `invoices`, `payments`, `class_schedule_slots`) e foram remapeados; o motor de
exportação tinha cinco consultas que devolviam ficheiro vazio, também corrigidas.

Ficheiros institucionais: `siga_files` e `siga_file_events`, com `person_documents`
protegido por trigger de escola.

**Achado (P1): caixas de correio institucionais escrevem para uma tabela que não existe —
e existe outra que serve.** Quatro sítios usam `tenant_mailboxes`
(`features/saas/server.ts:283`, `school-domain-ops.ts:140`, `api/saas/mailboxes.tsx:39` e
`:116`); confirmado ao vivo que **não existe** (`PGRST205`). Mas **`public.mailboxes`
existe**, com `school_id, address, provider, external_id, plan_id, status,
storage_limit_gb`. O mapeamento é directo: `tenant_id`→`school_id` (mais fino),
`email`→`address`, `provider_account_id`→`external_id`; só `display_name` não tem
equivalente.

**Aviso sobre trabalho meu:** a 2026-09-23 escrevi
`supabase/migrations/20260923120000_tenant_mailboxes.sql` para criar `tenant_mailboxes`.
**Essa migração não deve ser aplicada como está** — criaria um segundo modelo de caixas,
paralelo e vazio, ao lado do que a produção já tem. A decisão correcta é entre apontar o
código a `mailboxes` ou justificar por que são conceitos distintos; não é criar o segundo.

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P1** | Assistente de instalação (8 funções de produção) escreve em `installation_runs`, que não existe, e nada o chama | `PGRST205` ao vivo; 0 referências em `src/` |
| **P1** | Caixas institucionais escrevem em `tenant_mailboxes` (inexistente) havendo `public.mailboxes` em produção | 4 locais no código; `PGRST205` ao vivo |
| **P1** | A minha migração `20260923120000_tenant_mailboxes.sql` criaria modelo paralelo — **não aplicar** | este documento |
| **P3** | Eliminação de escola sem caminho auditado encontrado (só `archive_school_record`) | — |
| **P3** | RLS de vários `school_*` por declarar no repositório (existe na base) | `rls-school-tables.test.ts` |

**P0: nenhum.** Nenhuma via de acesso entre tenants encontrada; o isolamento tem RLS,
triggers e funções de asserção a suportá-lo.
