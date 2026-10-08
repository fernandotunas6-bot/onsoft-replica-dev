-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-06
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 2 migrações da auditoria 13:
--   A2: as datas do ano lectivo passam a ter de cobrir os períodos dele. Hoje encurtar o
--       ano deixa trimestres fora dele sem erro. A gravação normal do calendário (ano e
--       trimestres juntos) continua a passar.
--   A8: o bucket público school-logos deixa de aceitar SVG (os ecrãs já só enviam
--       PNG, JPEG e WebP).
-- Nenhuma mexe em dados. Ensaiadas em PGlite (tests/sql/academic-year-covers-terms.mjs e
-- tests/sql/school-logos-no-svg.mjs): cada uma corre duas vezes.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20261006180000_academic_year_dates_cover_terms.sql ══════════
-- As datas do ano lectivo têm de continuar a cobrir os períodos dele (auditoria 13, A2).
--
-- O gatilho public.guard_term_within_year já impede gravar um período fora do ano. Mas
-- mudar as datas do **ano** não olhava para os períodos que ele já tinha: encurtar o ano
-- deixava trimestres fora dele, e as notas, as faltas e as pautas desses trimestres
-- passavam a cair fora do ano lectivo. Na produção (leitura de 2026-10-06) há um período
-- assim, de 11/08, anterior ao gatilho dos períodos.
--
-- O gatilho é de restrição e diferido (verificado no COMMIT), porque
-- public.save_academic_calendar actualiza primeiro o ano e só depois os trimestres: um
-- gatilho imediato recusava encurtar o ano e mover os trimestres na mesma gravação.
-- Só corre quando starts_on ou ends_on mudam de facto, e lê as datas do ano como estão
-- no fim da transacção. Não mexe em dados: o período órfão da produção fica como está, e
-- essa escola só voltará a poder mudar as datas do ano depois de o corrigir (a mensagem
-- diz qual é). Idempotente.

CREATE OR REPLACE FUNCTION private.guard_academic_year_covers_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  year_row public.academic_years%rowtype;
  outside record;
begin
  if new.starts_on is not distinct from old.starts_on
     and new.ends_on is not distinct from old.ends_on then
    return null;
  end if;

  -- As datas como ficam no fim da transacção (o ano pode ter sido gravado outra vez).
  select * into year_row from public.academic_years where id = new.id;
  if not found then
    return null;
  end if;

  select t.name, t.starts_on, t.ends_on into outside
  from public.terms t
  where t.academic_year_id = year_row.id
    and (t.starts_on < year_row.starts_on or t.ends_on > year_row.ends_on)
  order by t.sequence
  limit 1;

  if found then
    raise exception using errcode = '23514',
      message = format(
        'O período «%s» (%s a %s) fica fora das novas datas do ano lectivo (%s a %s). Acerte ou apague o período primeiro.',
        outside.name,
        to_char(outside.starts_on, 'DD/MM/YYYY'), to_char(outside.ends_on, 'DD/MM/YYYY'),
        to_char(year_row.starts_on, 'DD/MM/YYYY'), to_char(year_row.ends_on, 'DD/MM/YYYY'));
  end if;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION private.guard_academic_year_covers_terms() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_academic_year_covers_terms ON public.academic_years;
CREATE CONSTRAINT TRIGGER trg_guard_academic_year_covers_terms
  AFTER UPDATE OF starts_on, ends_on ON public.academic_years
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.guard_academic_year_covers_terms();


-- ══════════ 20261006181000_school_logos_no_svg.sql ══════════
-- O bucket público `school-logos` deixa de aceitar SVG (auditoria 13, A8).
--
-- 20260928130000 já limita o NOME do envio a .png/.jpg/.jpeg/.webp, mas o tipo
-- servido é o `contentType` do envio, e 20261004220451 voltou a pôr image/svg+xml
-- na lista do bucket. Um `logo-<n>.png` enviado como image/svg+xml passava a política
-- e era servido publicamente como SVG (imagem que pode levar código). Os dois ecrãs
-- de definições já só enviam PNG, JPEG e WebP: nada da aplicação depende do SVG.
--
-- Não apaga objectos: o único SVG lá guardado (emblem-angola.svg, de 25/09) fica;
-- a aplicação usa o emblema de /brands. Idempotente.

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
 WHERE id = 'school-logos'
   AND allowed_mime_types IS DISTINCT FROM ARRAY['image/png', 'image/jpeg', 'image/webp'];


-- ══════════ Confirmar ══════════
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_guard_academic_year_covers_terms' AND NOT tgisinternal)
      THEN 'aplicada'
    ELSE 'por aplicar'
  END AS "20261006180000 datas do ano lectivo",
  CASE
    WHEN to_regclass('storage.buckets') IS NOT NULL
     AND coalesce((xpath('//ok/text()', query_to_xml(
           'select not (''image/svg+xml'' = any (coalesce(allowed_mime_types, array[''image/svg+xml'']))) as ok
              from storage.buckets where id = ''school-logos''', false, true, '')))[1]::text = 'true', false)
      THEN 'aplicada'
    ELSE 'por aplicar'
  END AS "20261006181000 logótipos sem SVG";
