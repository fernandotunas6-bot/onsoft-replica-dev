-- ---------------------------------------------------------------------------
-- Fotografias antigas em bucket público (auditoria — não altera nada)
-- ---------------------------------------------------------------------------
-- Contexto: até à correcção do upload, as fotografias de pessoas e alunos eram
-- enviadas para o bucket PÚBLICO `school-logos`, no caminho `avatars/<person_id>-<ts>.<ext>`,
-- sem qualquer prefixo de escola. Ou seja: ficheiros de menores acessíveis por
-- URL pública adivinhável, num namespace partilhado por todas as escolas.
--
-- O código já não cria estes ficheiros: as fotos passaram a ir para o bucket
-- privado `siga-files`, sob o prefixo da escola, e são referenciadas em
-- `people.photo_url` como `siga-file://<id>`, lidas por URL assinada.
--
-- Este script apenas MOSTRA o que ficou para trás. A limpeza é deliberadamente
-- manual: apagar objectos de storage é irreversível e deve ser feita depois de
-- confirmar (e, se necessário, remigrar) cada fotografia.
-- ---------------------------------------------------------------------------

-- 1. Quantas pessoas ainda apontam para uma URL pública de fotografia?
select
  s.name as escola,
  count(*) as fotos_publicas
from public.people p
join public.schools s on s.id = p.school_id
where p.photo_url is not null
  and p.photo_url not like 'siga-file://%'
  and (p.photo_url like '%/school-logos/%' or p.photo_url like '%/avatars/%')
group by s.name
order by fotos_publicas desc;

-- 2. Lista detalhada, para decidir caso a caso.
select
  p.school_id,
  p.id as person_id,
  p.full_name,
  p.photo_url
from public.people p
where p.photo_url is not null
  and p.photo_url not like 'siga-file://%'
  and (p.photo_url like '%/school-logos/%' or p.photo_url like '%/avatars/%')
order by p.school_id, p.full_name;

-- 3. Objectos órfãos no bucket público (o prefixo `avatars/` nunca deveria lá estar;
--    o bucket `school-logos` é legitimamente público, mas só para logótipos).
select
  o.name as caminho,
  o.created_at,
  o.metadata ->> 'size' as bytes
from storage.objects o
where o.bucket_id = 'school-logos'
  and o.name like 'avatars/%'
order by o.created_at desc;

-- ---------------------------------------------------------------------------
-- Passos de limpeza sugeridos (executar só após validação):
--   a) Para cada pessoa listada em (2), voltar a carregar a fotografia pela
--      aplicação — passa a ficar privada e ligada à escola automaticamente.
--   b) Confirmar que `people.photo_url` já não contém URLs públicas.
--   c) Só então remover os objectos listados em (3) do bucket `school-logos`.
-- ---------------------------------------------------------------------------
