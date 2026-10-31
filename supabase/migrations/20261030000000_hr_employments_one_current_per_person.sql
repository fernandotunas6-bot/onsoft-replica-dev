-- SIGA Plus — Um só vínculo RH em curso por pessoa e escola.
--
-- ensureStaffEmploymentDraft (Pessoas, Professores, Atribuir cargo) e o
-- importador de Funcionários já tratam draft/active/suspended como «vínculo
-- actual» e não criam outro. Sem índice, dois pedidos simultâneos criavam
-- duas fichas em preparação para a mesma pessoa. Cessado/expirado fica no
-- histórico e permite um novo vínculo.
--
-- Não altera nem apaga dados. Se a escola já tiver pessoas com mais de um
-- vínculo em curso, a migração pára sem mudar nada e indica quantas; resolver
-- primeiro em Funcionários (cessar ou eliminar a ficha a mais). Diagnóstico:
--
--   SELECT school_id, person_id, array_agg(id ORDER BY created_at) AS vinculos
--     FROM public.hr_employments
--    WHERE deleted_at IS NULL AND status IN ('draft','active','suspended')
--    GROUP BY school_id, person_id
--   HAVING count(*) > 1;
--
-- Idempotente: pode correr duas vezes.
DO $$
DECLARE
  conflicts integer;
BEGIN
  IF to_regclass('public.hr_employments') IS NULL THEN
    RAISE NOTICE 'hr_employments ausente: índice de vínculo em curso não criado';
    RETURN;
  END IF;
  IF to_regclass('public.hr_employments_one_current_per_person_idx') IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO conflicts
    FROM (
      SELECT 1
        FROM public.hr_employments
       WHERE deleted_at IS NULL AND status IN ('draft', 'active', 'suspended')
       GROUP BY school_id, person_id
      HAVING count(*) > 1
    ) duplicated;
  IF conflicts > 0 THEN
    RAISE EXCEPTION
      'hr_employments: % pessoa(s) com mais de um vínculo em curso na mesma escola. Nada foi alterado; resolva-os em Funcionários e volte a correr a migração.',
      conflicts;
  END IF;

  CREATE UNIQUE INDEX hr_employments_one_current_per_person_idx
    ON public.hr_employments (school_id, person_id)
    WHERE deleted_at IS NULL AND status IN ('draft', 'active', 'suspended');
  COMMENT ON INDEX public.hr_employments_one_current_per_person_idx IS
    'Um vínculo RH em curso (draft/active/suspended) por pessoa e escola.';
END;
$$;
