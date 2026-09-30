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
