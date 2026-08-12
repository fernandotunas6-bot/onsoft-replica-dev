# SIGA — Sistema Integrado de Gestão Académica

Aplicação de gestão escolar para estudantes, matrículas, área pedagógica, documentos,
facturação, caixa, relatórios, comunicações e acessos.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://onsoft-replica-dev.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b42f51d7-4a07-403d-a7db-39d6d06f5cd6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Supabase

Copie `.env.example` para `.env` e preencha apenas as variáveis públicas usadas pelo browser:

```sh
cp .env.example .env
```

- `VITE_SUPABASE_PUBLISHABLE_KEY` aceita `sb_publishable_...` ou a chave legada `anon`.
- Nunca coloque `sb_secret_...` ou `service_role` numa variável `VITE_*`.
- `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` devem existir somente no ambiente
  seguro do servidor/deploy (necessário para convites em `/acessos`).

### Aplicar migrações

Preferido (projecto ligado):

```sh
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

No projecto SGA (`xodgfmxiaunpamctfeea`) **não** corra `pending_feature_migrations.sql`,
`all_migrations_combined.sql` nem as migrações `2026081114*` isoladas — dependem de
`current_school_id()` do schema Lovable, que o SGA não tem.

No SQL Editor do SGA corra, por esta ordem:

1. `supabase/APPLY_IN_SQL_EDITOR.sql` — colunas financeiras em falta
2. `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql` — matrícula pública, WhatsApp da turma,
   grants, feed ICS, integrações e planos de pagamento

O segundo script cria `current_school_id()` a partir de `school_memberships`.

Para validar as migrações e os invariantes de segurança com o Supabase local activo:

```sh
supabase db lint --local --fail-on error
supabase test db --local supabase/tests/profiles_connections_security_test.sql
supabase test db --local supabase/tests/people_module_security_test.sql
supabase test db --local supabase/tests/school_announcements_security_test.sql
supabase test db --local supabase/tests/subjects_term_grades_security_test.sql
supabase test db --local supabase/tests/class_schedule_slots_security_test.sql
```

O módulo académico usa tabelas normalizadas e reutilizáveis (`people`, `person_documents`,
`person_roles`, `person_relationships`, `person_school_links`, `students`,
`student_guardians`, `academic_years`, `courses`, `grade_levels`, `rooms`, `class_groups`,
`enrollments`, `subjects`, `term_grades` e `class_schedule_slots`). A view `student_directory`
entrega a listagem pronta para a interface sem ignorar as políticas RLS das tabelas de origem.

As operações compostas usam RPCs transacionais. Por exemplo, `enroll_new_student` cria pessoa,
papel e aluno numa única transação: qualquer falha reverte o conjunto inteiro. Actualizações de
ficha usam a coluna `version` para detectar edições concorrentes antes de sobrescrever dados.

Consulte [docs/SECURITY.md](docs/SECURITY.md) para o modelo de RLS, privilégios e gestão de
credenciais.

## Agentes e módulos

Handoff: [docs/agents/CONTINUE.md](docs/agents/CONTINUE.md). Skills: `.cursor/skills/siga*/`.

```sh
npm run siga:check      # inventário dos módulos
npm run siga:sql        # SQL a aplicar no SGA
npm run siga:scaffold -- diario [--route=/diario] [--with-page]
npm test                # Vitest (Node 24; inclui tests/integrations/*)
```

### Integrações (catalog-ready)

Instalar no waffle ou em Definições → Integrações. Cada app grava `grantedCapabilities` em `school_integrations`; os botões aparecem via `InstalledModuleTools` / `hasCapability`. Sem chamadas HTTP a terceiros. Rotas públicas (`/matricula`, `/calendario/ics`) só expõem `installedProviders` e contactos filtrados (`publicSchoolPhone`, `publicSchoolEmail`). Ver skill `siga-integracoes` e checklist em [docs/agents/CONTINUE.md](docs/agents/CONTINUE.md).
