-- SIGA — verificações de 2026-09-26
-- Colar no Supabase → SQL Editor → Run. Só LÊ; não altera nada.
-- Correr bloco a bloco (seleccionar o bloco e Run) e enviar-me os resultados.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Contas de teste que estavam no código (dev@siga.local, admin@escola.ao)
--    Se aparecerem linhas, apagar em Authentication → Users (ver instruções).
-- ─────────────────────────────────────────────────────────────────────────
select u.id,
       u.email,
       u.created_at,
       u.last_sign_in_at,
       u.banned_until,
       (select count(*) from public.school_memberships m where m.user_id = u.id) as escolas
from auth.users u
where lower(u.email) in ('dev@siga.local', 'admin@escola.ao');

-- Em que escolas e com que papel (para confirmar antes de apagar)
select u.email, s.name as escola, r.code as papel, m.status
from auth.users u
join public.school_memberships m on m.user_id = u.id
join public.schools s on s.id = m.school_id
left join public.member_roles mr on mr.membership_id = m.id
left join public.roles r on r.id = mr.role_id
where lower(u.email) in ('dev@siga.local', 'admin@escola.ao');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Políticas do Storage (quem pode ler e gravar ficheiros)
-- ─────────────────────────────────────────────────────────────────────────
select id as bucket, public as publico, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

select policyname as politica, cmd as operacao, roles, qual as condicao_leitura, with_check as condicao_escrita
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Migrações de 24/09 do Lovable (motor de importação) já estão na base?
--    Se as duas consultas devolverem linhas, estão aplicadas.
-- ─────────────────────────────────────────────────────────────────────────
select table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'import_table_specs';

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'import_jobs'
  and column_name in ('schema_version','exchange_mode','source_format','dry_run',
                      'idempotency_key','manifest','dependency_plan')
order by column_name;
