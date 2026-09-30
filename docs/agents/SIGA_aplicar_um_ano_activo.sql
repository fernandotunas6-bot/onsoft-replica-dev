-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-09-30
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: um ano lectivo activo por escola (índice único parcial). Não mexe
-- em dados. Se houver escolas com mais de um ano activo, pára e lista-as: fechar
-- os que sobram primeiro (Calendário Lectivo, ou SQL com o dono).
-- A 2026-09-29: "Colegio Adventista - Huambo" tinha quatro anos activos.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20260930090000_one_active_academic_year.sql ══════════
-- Um ano lectivo activo por escola.
--
-- O SIGA resolve o ano corrente pelo estado `active` (turmas, pautas, propinas,
-- calendário, painel). Com mais de um ano activo cada ecrã podia escolher um
-- diferente. As definições da escola activavam o ano escolhido sem fechar o
-- anterior; o código já foi corrigido (fecha os outros primeiro), e este índice
-- impede que volte a acontecer por qualquer outro caminho.
--
-- A 2026-09-29 uma escola tinha quatro anos activos (um real e três de testes
-- de 09/09, sem matrículas nem turmas). Se ainda houver escolas assim, a
-- migração pára com a lista, em vez de escolher por elas qual fechar.
-- Idempotente.

DO $$
DECLARE
  duplicados text;
BEGIN
  SELECT string_agg(format('%s: %s', s.name, anos), E'\n')
    INTO duplicados
    FROM (
      SELECT y.school_id, string_agg(format('%s (%s)', y.name, y.id), ', ' ORDER BY y.starts_on DESC, y.created_at) AS anos
        FROM public.academic_years y
       WHERE y.status = 'active'
       GROUP BY y.school_id
      HAVING count(*) > 1
    ) d
    JOIN public.schools s ON s.id = d.school_id;
  IF duplicados IS NOT NULL THEN
    RAISE EXCEPTION USING
      message = 'Há escolas com mais de um ano lectivo activo. Feche os que sobram antes de criar o índice.',
      detail = duplicados;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_active_per_school
  ON public.academic_years (school_id)
  WHERE status = 'active';


-- ══════════ Confirmar ══════════
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'academic_years_one_active_per_school'
) THEN 'aplicada' ELSE 'por aplicar' END AS "20260930090000 um ano lectivo activo";
