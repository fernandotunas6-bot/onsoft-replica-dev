# SQL SGA — checklist operacional

Como aplicar (e verificar) o schema canónico do projecto Supabase **SGA** usado pelas quatro apps.

::: danger Nunca no SGA
Não aplicar `all_migrations_combined.sql`, `pending_feature_migrations.sql`, nem migrações Lovable `2026081114*` isoladas. Ver `supabase/DO_NOT_APPLY_TO_SGA.txt`.
:::

---

## Ordem canónica

No **SQL Editor** do projecto SGA (`xodgfmxiaunpamctfeea`), nesta ordem:

| # | Ficheiro | O que destrava |
| --- | --- | --- |
| 1 | `supabase/APPLY_IN_SQL_EDITOR.sql` | Preferências, telemetria gateway, hotfixes base, buckets `avatars`/`school-logos`, `people.user_id` |
| 2 | `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql` | Matrícula pública, arquivos, avaliação, mensagens, importar, catracas, `current_school_id()`, multi-tenant RBAC, convites, índices de performance |
| 3 | `supabase/APPLY_SAAS_PLATFORM.sql` | Tenants, planos, `platform_admins`, billing SaaS |

```bash
npm run siga:sql           # imprime este checklist no terminal
npm run siga:sql:verify    # smoke HTTP das tabelas (precisa SUPABASE_SECRET_KEY)
npm run siga:sync-env      # propaga .env → WEB/ADMIN
```

---

## Tabelas novas (Ciclo 49 — Identidade Enterprise)

Adicionadas em `APPLY_ENROLLMENT_AND_PREMIUM.sql` como parte da arquitectura global de identidade, RBAC e multi-tenant:

| Tabela | Propósito |
| --- | --- |
| `school_memberships` | Vínculo utilizador ↔ escola com lifecycle (`status`, `invited_at`, `activated_at`) e `UNIQUE(school_id, user_id)` |
| `roles` | Papéis canónicos por escola (`owner`, `admin`, `teacher`, `student`, …) — `is_system` para papéis globais |
| `permissions` | Catálogo granular de permissões (`students.read`, `grades.update`, `finance.invoice`, …) |
| `role_permissions` | Matriz role ↔ permission (N:M) |
| `member_roles` | Papéis atribuídos por membership (N:M `membership_id ↔ role_id`) |
| `school_invitations` | Convites institucionais com `token_hash` SHA-256, expiração e auditoria |

### Funções de segurança (RLS helpers)

| Função | Descrição |
| --- | --- |
| `public.current_school_id()` | UUID da escola activa do utilizador (via `school_memberships`) |
| `public.current_profile_role()` | Código do papel activo (via `member_roles → roles → profiles.cargo` fallback) |
| `public.is_platform_admin()` | `true` se o utilizador está em `platform_admins` |
| `public.is_school_member(uuid)` | `true` se o utilizador tem membership activa na escola indicada |
| `public.has_school_permission(uuid, text)` | `true` se o utilizador tem a permissão granular indicada na escola, ou é admin/director |

---

## Índices de performance adicionados (Fase 14)

Índices compostos para queries frequentes em ambientes com múltiplas escolas:

| Índice | Tabela | Colunas |
| --- | --- | --- |
| `people_school_status_idx` | `people` | `(school_id, status)` WHERE `deleted_at IS NULL` |
| `students_school_status_idx` | `students` | `(school_id, status)` WHERE `deleted_at IS NULL` |
| `enrollments_school_year_status_idx` | `enrollments` | `(school_id, academic_year_id, status)` |
| `enrollments_school_created_desc_idx` | `enrollments` | `(school_id, created_at DESC)` |
| `finance_invoices_school_status_idx` | `finance_invoices` | `(school_id, status)` |
| `finance_invoices_school_created_desc_idx` | `finance_invoices` | `(school_id, created_at DESC)` |
| `school_memberships_user_status_idx` | `school_memberships` | `(user_id, status)` |
| `member_roles_membership_role_idx` | `member_roles` | `(membership_id, role_id)` |
| `school_invitations_school_created_desc_idx` | `school_invitations` | `(school_id, created_at DESC)` WHERE `status = 'pending'` |
| `announcements_school_created_desc_idx` | `announcements` | `(school_id, created_at DESC)` |
| `siga_files_school_created_desc_idx` | `siga_files` | `(school_id, created_at DESC)` WHERE `deleted_at IS NULL` |
| `roles_school_code_idx` | `roles` | `(school_id, code)` |

---

## Patch de lacunas (verify)

Se `npm run siga:sql:verify` listar tabelas em falta (ex. gateway, presença, catracas)
**sem** precisar de reaplicar os 3 scripts inteiros:

1. Abrir `supabase/APPLY_MISSING_FROM_VERIFY.sql`
2. Colar no SQL Editor e executar
3. Voltar a correr `npm run siga:sql:verify` → deve dar 27/27

O patch é idempotente e extrai os blocos canónicos. Não substitui a ordem 1→2→3
em ambientes novos — só fecha buracos.

---

## Checklist pós-aplicar

### Funções e isolamento

- [ ] `select public.current_school_id();` não falha (após membership activa)
- [ ] `select public.is_school_member('<uuid>');` retorna `true` para membro, `false` para não-membro
- [ ] Escola A não vê dados da escola B (RLS / membership)

### Módulos premium (script 2)

- [ ] `/arquivos` sem banner «Tabela SGA ainda não aplicada»
- [ ] `/planos-aula` cria planos
- [ ] Mensagens internas sincronizam (não só «neste dispositivo»)
- [ ] `/matricula/$slug` responde 200 com formulário aberto
- [ ] `/catracas` lista dispositivos / cartões
- [ ] `/importar` cria jobs
- [ ] `/acessos` mostra painel «Convites institucionais» com botão Convidar

### SaaS (script 3)

- [ ] WEB `/start` cria escola (signup API)
- [ ] ADMIN `/tenants` lista o tenant
- [ ] Existe pelo menos um `platform_admins` para o operador

### Storage (reaplicar políticas dos scripts 1–2)

- [ ] `school-logos` — logótipo institucional
- [ ] `siga-files` — privado (`siga-file://` + URL assinada)
- [ ] `avatars` — privado (`siga-avatar://` + URL assinada)

---

## Sintomas se faltar SQL

| Sintoma na UI | Script em falta |
| --- | --- |
| Banner arquivos / IndexedDB local | 2 |
| Planos de aula / Centro de Avaliação pedem SQL | 2 |
| Mensagens só neste dispositivo | 2 |
| Erro «school_memberships not found» em Acessos | 2 |
| Painel de convites vazio / erro 42P01 | 2 (school_invitations) |
| Wizard WEB falha ao criar tenant | 3 |
| ADMIN sem tenants / 401 em `/api/saas/me` | 3 + `platform_admins` |
| Webhooks gateway sem histórico | 1 (`finance_gateway_webhook_events`) |

---

## Ligação às apps

- Operação escolar → [Navegação SIGA](/siga/navegacao)
- Criar escola → [WEB wizard](/web/criar-escola)
- Control Center → [ADMIN](/admin/control-center)
- Instalação geral → [Instalação](/guide/installation)
