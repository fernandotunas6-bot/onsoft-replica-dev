-- SIGA — verificar os pacotes de 22/11/2026 (só leitura). Cada linha deve dizer "aplicada".
-- Supabase → SQL Editor do projecto Sga → colar → Run.
-- Usado a 22/11/2026: as quatro linhas deram "aplicada" no projecto xodgfmxiaunpamctfeea (Sga,
-- main PRODUCTION). Ensaiado em PGlite: "EM FALTA" numa base vazia, "aplicada" pacote a pacote,
-- e de novo "EM FALTA" se authenticated ganhar EXECUTE numa das funções das notas.
with academica as (
  select count(*) = 3
     and bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
     and not bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     and not bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) as ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('siga_write_assessment_scores_atomic',
                      'siga_return_task_submission_atomic',
                      'siga_reorganize_enrollment_guarded')
),
ciclos as (
  select exists (select 1 from pg_trigger t
                  where t.tgname = 'guard_enrollment_cycle' and not t.tgisinternal
                    and t.tgrelid = 'public.enrollments'::regclass)
     and coalesce(position('enforce' in pg_get_functiondef(
           to_regprocedure('private.enrollment_window_open(uuid,uuid,date)'))), 0) > 0 as ok
),
ia_tabelas as (
  select count(*) = 5
     and bool_and(c.relrowsecurity and c.relforcerowsecurity)
     and not bool_or(has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
                  or has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')) as ok
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname in ('siga_ai_settings', 'siga_ai_conversations', 'siga_ai_messages',
                      'siga_ai_documents', 'siga_ai_usage')
),
ia_catalogo as (
  select exists (select 1 from public.module_catalog where code = 'siga-ai') as ok
)
select '1. Escrita académica (3 funções, só o servidor)' as pacote,
       case when ok then 'aplicada' else 'EM FALTA' end as estado from academica
union all
select '2. Ciclos de matrícula (gatilho com interruptor)',
       case when ok then 'aplicada' else 'EM FALTA' end from ciclos
union all
select '3a. SIGA AI: 5 tabelas, só o servidor',
       case when ok then 'aplicada' else 'EM FALTA' end from ia_tabelas
union all
select '3b. SIGA AI: linha no catálogo de módulos',
       case when ok then 'aplicada' else 'EM FALTA' end from ia_catalogo;
