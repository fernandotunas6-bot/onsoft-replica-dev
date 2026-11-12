# Auditoria das 18 funções `SECURITY DEFINER` expostas a `authenticated`

**Data:** 02/11/2026 | **Sistema:** SIGA Plus | **Fonte:** observações read-only do Supabase Advisor, `pg_proc`, `pg_get_functiondef` e `pg_constraint`.

## Âmbito e veredicto inicial

O Advisor identificou **18 funções `SECURITY DEFINER` executáveis por `authenticated`** no esquema `public`. Verificou-se para as 18 que `has_function_privilege('anon', oid, 'EXECUTE') = false` e `has_function_privilege('authenticated', oid, 'EXECUTE') = true`. Todas as 18 têm `search_path` explícito (`''` ou `pg_catalog, public`).

**Isto é uma superfície privilegiada deliberada, não uma prova de exploração.** A própria documentação Supabase recomenda analisar a intenção antes de mudar funções ou privilégios. Nenhuma conta de outra escola foi usada nestas observações; logo, **o isolamento entre tenants ainda não ficou provado em testes autenticados**.

Não executar `REVOKE EXECUTE`, `ALTER FUNCTION`, `SECURITY INVOKER`, migrações ou alterações de RLS em produção nesta fase. O frontend, triggers e políticas podem depender destas funções.

## Inventário por risco funcional

| Função pública | Classe | Revisão necessária |
| --- | --- | --- |
| `can_manage_students()` | Autorização alunos | Delega em `current_school_role_is`/`current_profile_role`; testar mudança do contexto escolar |
| `can_read_students()` | Autorização alunos | Delega em papel da escola; restringir leitura por turma/aluno nas políticas consumidoras |
| `current_profile_role()` | Contexto do utilizador | Consulta associação activa e `auth.uid()`; confirmar hierarquia de cargos |
| `current_school_id()` | Selecção escolar | O cabeçalho `x-siga-school-id` é validado contra vínculo activo; testar cabeçalho falso e escola revogada |
| `current_school_role_is(text[])` | Autorização por papel | Delega nas funções de contexto; testar perfis com vários cargos |
| `current_teacher_can_manage_class_subject(uuid,uuid)` | Professor/turma/disciplina | Confirma escola, professor e associação activa; testar IDs de escola adversária |
| `current_teacher_id()` | Contexto docente | Verificar vínculo e estado do professor |
| `current_user_can_manage_assessment_item(uuid,uuid,uuid)` | Notas e itens | Confirma escola e atribuição docente; testar turma/disciplinas cruzadas |
| `current_user_can_manage_assessment_score(uuid,uuid,uuid)` | Notas por aluno | Liga avaliação à matrícula e escola; testar aluno não inscrito e escola adversária |
| `has_school_permission(uuid,text)` | Permissões RBAC | Compara membro activo e cargo; testar permissões de outras escolas |
| `hr_redeem_teacher_qr_secure(text,float8,float8,float8)` | RH e presenças | Exige `auth.uid()`, sessão QR e avaliação; confirmar validade de token, latitude e revogação |
| `is_platform_admin()` | Administrador SaaS | Validar fonte de autoridade e privilégios de platform-admin |
| `is_school_admin(uuid)` | Administração escolar | Validar vínculo activo e roles |
| `is_school_finance(uuid)` | Financeiro | Garantir que permissões não chegam a dados de outra escola |
| `is_school_member(uuid)` | Vínculo escolar | Verifica `school_memberships` activa por `school_id` e `auth.uid()`; não basta por si só para autorizar notas ou RH |
| `is_school_office(uuid)` | Secretaria | Testar limitação de funções administrativas |
| `merge_school_subjects(uuid,uuid,uuid[])` | **Escrita académica** | Inspecção directa: exige `auth.uid()`, `private.is_aal2()`, `private.has_permission(school_id,'academic.subjects.manage')` e confirma todas as disciplinas na escola-alvo; testar cross-tenant em staging |
| `school_logo_folder_ok(text)` | Storage | Confirma escola actual, secretaria e pasta escolar; testar pastas de outro tenant |

## Evidência adicional validada

1. `merge_school_subjects` limita a junção a 20 disciplinas por operação, valida `school_id` e bloqueia disciplinas fora da escola, usando actualizações por `school_id`; inclui 2FA AAL2. **Sem indício imediato de bypass por parâmetros** na definição inspeccionada.
2. `private.has_permission` verifica `auth.uid()`, associação activa, escola e o código da permissão. `private.is_aal2` lê o AAL do token JWT.
3. `current_school_id` rejeita um `x-siga-school-id` inexistente ou de escola sem vínculo activo, em vez de confiar directamente no cabeçalho.
4. `hr_redeem_teacher_qr_secure` delega a `hr_redeem_teacher_qr`. A função delegada verifica professor associado à ocorrência, sessão QR activa, validade e evidência de presença recente; o fluxo requer testes de tempo, duplicação e concorrência.
5. `member_roles` possui FKs compostas `(school_id,membership_id)` e `(school_id,role_id)`; `role_permissions` possui FK `(school_id,role_id)`. Impedem associações cruzadas simples mesmo que algumas queries usem só `role_id`.
6. Não foram lidos dados de alunos, professores ou pagamentos. Apenas metadados e definições de funções; **nenhuma alteração SQL foi executada**.

## Testes obrigatórios antes de qualquer mudança

- Criar **duas escolas de staging distintas**, utilizadores com e sem vínculo, papéis de professor, secretaria, financeiro, admin e plataforma; nunca reutilizar produção.
- Com token escolar A, chamar cada RPC com IDs da escola B. Recusar sempre a leitura/escrita indevida, incluindo após revogação de vínculo, mudança de escola no cabeçalho e token expirado.
- Para `merge_school_subjects`, testar com e sem AAL2, sem permissão, com `keep_subject_id` estrangeiro e `merge_subject_ids` mistos; confirmar atomicidade da transacção e ausência de alterações noutros tenants.
- Para QR de presença, testar token expirado, reutilizado, roubado, ausência de evidência, professores de outra escola e tentativas concorrentes; confirmar que não se cria evento de remuneração antes da revisão RH.
- Rever os consumidores (RLS policies, triggers, código da app) de cada RPC antes de decidir movê-la de `public` para esquema não exposto ou revogar `EXECUTE`.

## Decisões e continuidade Claude Code

**Estado actual:** revisão de código e metadados concluída para a primeira passagem; **testes de autorização real ainda pendentes**. Recomendação: **manter em revisão**, não intervir directamente na base em produção. Prioridade seguinte é P0 de staging: construir matriz de cenários de acesso e preparar testes autenticados. Só propor migrações isoladas depois de verificar consumidores, dependências, impacto e plano de rollback.

**Referências:**
- [Supabase Security Advisor](https://supabase.com/docs/guides/observability/advisors)
- [Supabase: segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
