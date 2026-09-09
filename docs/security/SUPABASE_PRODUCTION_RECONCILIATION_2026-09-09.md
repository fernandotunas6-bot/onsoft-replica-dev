# Reconciliação Supabase de produção — 2026-09-09

## Estado

Projeto canónico: `xodgfmxiaunpamctfeea` (`Sga`, `eu-west-3`).

Este documento regista o inventário somente leitura executado em produção e os
gates obrigatórios antes de aplicar SQL. Não contém credenciais nem dados
pessoais.

- 149 tabelas em `public`; todas têm RLS habilitado.
- 40 migrations registadas em `supabase_migrations.schema_migrations`.
- Última migration registada: `20260903074402`.
- 20 tabelas `hr_*` e 15 tabelas `alumni_*` existem, mas não aparecem no
  histórico de migrations.
- 18 tabelas públicas têm RLS sem policy; 15 pertencem a Alumni. As restantes
  são `notification_preferences`, `school_integration_secrets` e
  `slug_reservations`.
- Não existem views públicas, Edge Functions ou branches de staging.
- O conector SQL disponível está em modo somente leitura.

## Hardening seguro já preparado

`supabase/APPLY_MISSING_FROM_VERIFY.sql` passou a revogar `EXECUTE` de
`PUBLIC`, `anon` e `authenticated` nas funções internas:

- `handle_new_user()`;
- `hr_gate_teacher_compensation_by_assurance()`;
- `rls_auto_enable()`.

Elas são funções de trigger/event trigger, não endpoints RPC. A execução pelos
triggers do PostgreSQL não depende de grants para os clientes. O bloco é
condicional e idempotente.

`validate_issued_document(text)` permanece público intencionalmente. Antes de
produção ainda é obrigatório rever entropia do código, rate limiting e
minimização do payload.

## Bloqueio: PR #8 não é aplicável como está

As migrations da PR #8 referenciam códigos que não existem no catálogo de
produção, entre eles:

- `access.read`, `access.manage`, `school.roles.manage`;
- `school.settings.update`;
- `finance.read`, `finance.plans`;
- `enrollments.read`, `enrollments.create`, `enrollments.approve`;
- `grades.read`, `grades.create`, `grades.update`;
- `lesson_plans.read`, `lesson_plans.manage`;
- `files.read`, `files.upload`, `files.delete`,
  `files.manage_system`.

Produção usa o catálogo enterprise, por exemplo:

- `rbac.memberships.read/manage`;
- `schools.settings.read/create`;
- `finance.settings.read/manage`, `finance.invoices.read`;
- `students.enrollments.read/create/update`;
- `assessment.grades.read/manage/submit/homologate/reopen`;
- `files.objects.read/create/update/delete`;
- `documents.*`.

Consequência: aplicar a PR #8 diretamente faria
`public.has_school_permission(...)` devolver falso para utilizadores
não-administradores e poderia bloquear fluxos legítimos. As quatro migrations
da PR #8 não devem ser aplicadas ao SGA sem tradução para o catálogo enterprise
e testes reais.

## Falhas confirmadas em produção

1. Políticas de `staff_module_grants`, `school_integrations`,
   `finance_payment_plans`, matrículas, documentos, avaliações, planos de
   aula e arquivos ainda concedem acesso com base apenas em membership em
   vários caminhos.
2. Storage `school-logos` permite escrita autenticada sem validar a escola
   codificada no path.
3. Storage `siga-files` depende de `current_school_id()`, que escolhe a
   primeira membership ativa e é ambígua para utilizadores multi-escola.
4. Os triggers de integridade
   `trg_member_roles_tenant_integrity` e
   `trg_school_invitations_role_integrity` não existem.
5. A policy `Public insert open enrollment applications` contém a expressão
   tautológica `forms.school_id = forms.school_id`. Não existe constraint
   composta que obrigue `enrollment_applications.school_id` a corresponder
   à escola do formulário.
6. Três funções internas `SECURITY DEFINER` estão expostas como RPC anónimo
   até o hardening ser aplicado.
7. RH e Alumni foram criados fora do histórico canónico, impedindo reprodução
   confiável do schema.

## Ordem obrigatória de correção

1. Não aplicar as migrations da PR #8 diretamente.
2. Manter `private.has_permission(school_id, code)` e
   `private.is_aal2()` como base do RBAC enterprise já presente.
3. Criar uma matriz explícita de cada operação para os códigos enterprise.
4. Corrigir a policy pública de candidatura para comparar
   `enrollment_forms.school_id = enrollment_applications.school_id`.
5. Adicionar integridade tenant para `member_roles` e
   `school_invitations`, com funções de trigger sem acesso RPC.
6. Reescrever políticas sensíveis e Storage usando o `school_id` da própria
   linha/path, nunca a primeira membership.
7. Recuperar migrations de RH e escolher uma única implementação Alumni antes
   de registrar o drift.
8. Testar anon, aluno, professor, encarregado, tesouraria, secretaria, direção
   e platform admin em duas escolas.
9. Executar advisors de segurança e performance.
10. Só então aplicar um patch canónico versionado à produção.

## Restrições

- Nunca aplicar `all_migrations_combined.sql`,
  `supabase/pending_feature_migrations.sql` ou
  `supabase/migrations/20260810122022_foundation_schema.sql` ao SGA.
- Não fazer merge ou deploy desta branch antes de validação PostgreSQL real.
- Não guardar `service_role`, password, PAT ou connection strings no Git.
