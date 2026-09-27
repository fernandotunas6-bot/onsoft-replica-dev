-- SIGA Plus — auditoria dos buckets e das políticas do Storage (2026-09-27)
--
-- SÓ LÊ. Não cria, não altera e não apaga nada. Colar no SQL Editor → Run e
-- devolver o resultado (uma única linha, uma coluna JSON).
--
-- Porquê à parte: `supabase/PRODUCTION_SNAPSHOT.json` só captura políticas de
-- `public` (`where schemaname='public'` em capture-db-snapshot.mjs), por isso o
-- esquema `storage` nunca entrou em nenhum retrato. É o ponto 5 de
-- docs/agents/SECURITY_AUDIT_2026-09-25.md, e continua por auditar desde 25/09.
--
-- O que se procura, e porquê:
--   · `buckets`     — qual é público. Um bucket público é legível por qualquer
--                     pessoa na Internet que saiba o caminho, sem sessão.
--   · `politicas`   — o repositório tem TRÊS versões contraditórias das políticas
--                     de escrita de `school-logos`, em ficheiros corridos à mão.
--                     Só a base diz qual ficou.
--   · `logos_fora_do_padrao` — AUDIT_LEGACY_PUBLIC_PHOTOS.sql diz que houve
--                     fotografias de pessoas (incluindo menores) enviadas para o
--                     bucket PÚBLICO `school-logos` em `avatars/<person_id>-<ts>`.
--                     Se ainda lá estiverem, estão expostas.
--   · `siga_files_fora_do_padrao` — a aplicação grava
--                     `<escola>/<ano>/<mês>/<área>/<utilizador>/<id>-<nome>`
--                     (6 segmentos). `private.storage_school_id`, que existe na
--                     produção, só reconhece caminhos de 4 segmentos. Se alguma
--                     política a usar, todos os envios do browser são recusados
--                     — e FileBrowser.tsx:653 trata a recusa como «guardar
--                     localmente», sem avisar ninguém.

select jsonb_pretty(jsonb_build_object(

  'capturado_em', now(),

  -- 1. Buckets: qual é público, limites e tipos aceites.
  'buckets', (
    select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]'::jsonb)
    from (
      select id, public, file_size_limit, allowed_mime_types, created_at
      from storage.buckets
    ) b
  ),

  -- 2. RLS nas tabelas do Storage.
  'rls', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabela', c.relname, 'rls', c.relrowsecurity, 'rls_forcada', c.relforcerowsecurity
    ) order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relkind = 'r'
  ),

  -- 3. Todas as políticas do esquema storage, com o predicado inteiro.
  'politicas', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabela', tablename, 'politica', policyname, 'cmd', cmd,
      'papeis', roles, 'permissiva', permissive,
      'usando', qual, 'verificando', with_check
    ) order by tablename, policyname), '[]'::jsonb)
    from pg_policies where schemaname = 'storage'
  ),

  -- 4. Privilégios de tabela: sem GRANT, a política não chega a ser avaliada.
  'grants', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabela', c.relname, 'papel', r.rolname,
      'select', has_table_privilege(r.rolname, c.oid, 'SELECT'),
      'insert', has_table_privilege(r.rolname, c.oid, 'INSERT'),
      'update', has_table_privilege(r.rolname, c.oid, 'UPDATE'),
      'delete', has_table_privilege(r.rolname, c.oid, 'DELETE')
    ) order by c.relname, r.rolname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (select rolname from pg_roles where rolname in ('anon','authenticated')) r
    where n.nspname = 'storage' and c.relkind = 'r' and c.relname in ('objects','buckets')
  ),

  -- 5. Quantos objectos, e quantos prefixos de topo (≈ escolas) por bucket.
  'objectos_por_bucket', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', bucket_id, 'objectos', n, 'prefixos_de_topo', prefixos,
      'sem_dono', sem_dono, 'mais_antigo', mais_antigo, 'mais_recente', mais_recente
    ) order by bucket_id), '[]'::jsonb)
    from (
      select bucket_id,
             count(*) as n,
             count(distinct split_part(name, '/', 1)) as prefixos,
             count(*) filter (where owner is null) as sem_dono,
             min(created_at) as mais_antigo,
             max(created_at) as mais_recente
      from storage.objects group by bucket_id
    ) t
  ),

  -- 6. Bucket público: tudo o que não é um logótipo no formato da aplicação.
  --    A aplicação grava `<uuid da escola>/logo-<13 dígitos>.<ext>` e mais nada.
  'logos_fora_do_padrao', (
    select jsonb_build_object(
      'total', count(*),
      'amostra', coalesce(jsonb_agg(jsonb_build_object(
        'nome', name, 'criado', created_at, 'bytes', (metadata->>'size')
      ) order by created_at) filter (where rn <= 25), '[]'::jsonb)
    )
    from (
      select name, created_at, metadata,
             row_number() over (order by created_at) as rn
      from storage.objects
      where bucket_id = 'school-logos'
        and name !~ '^[0-9a-f-]{36}/logo-[0-9]{13}\.(png|jpg|jpeg|webp|svg)$'
    ) x
  ),

  -- 7. `siga-files`: caminhos que não têm os 6 segmentos que a aplicação gera.
  'siga_files_fora_do_padrao', (
    select jsonb_build_object(
      'total', count(*),
      'amostra', coalesce(jsonb_agg(name order by created_at) filter (where rn <= 25), '[]'::jsonb)
    )
    from (
      select name, created_at,
             row_number() over (order by created_at) as rn
      from storage.objects
      where bucket_id = 'siga-files'
        and array_length(storage.foldername(name), 1) is distinct from 5
    ) y
  ),

  -- 8. `private.storage_school_id` aplicada aos caminhos que existem: quantos
  --    reconhece. Se reconhecer 0, qualquer política que a use nega tudo.
  'storage_school_id_reconhece', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', bucket_id, 'objectos', n, 'reconhecidos', ok
    ) order by bucket_id), '[]'::jsonb)
    from (
      select bucket_id, count(*) as n,
             count(*) filter (where private.storage_school_id(name) is not null) as ok
      from storage.objects group by bucket_id
    ) z
  ),

  -- 9. Avatares: um por utilizador é o esperado; caminhos fora do padrão não.
  'avatars_fora_do_padrao', (
    select jsonb_build_object(
      'total', count(*) filter (
        where (storage.foldername(name))[1] !~ '^[0-9a-f-]{36}$'
      ),
      'objectos', count(*)
    )
    from storage.objects where bucket_id = 'avatars'
  )

)) as auditoria_storage;
