-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20260930070505).
-- Aplicada a 2026-09-30 07:05 UTC fora do repositório; trazida para cá a 2026-10-02
-- (auditoria 11, O4). Corpo sem alterações, confirmado por md5 contra o registo.
-- @@corpo-capturado@@
CREATE OR REPLACE FUNCTION public.save_academic_calendar(p_school_id uuid, p_actor_id uuid, p_academic_year_id uuid, p_year_name text, p_starts_on date, p_ends_on date, p_terms jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_year_id uuid;
  v_sequence integer;
  v_term jsonb;
  v_term_name text;
  v_term_start date;
  v_term_end date;
  v_previous_end date := NULL;
  v_existing_count integer;
  v_existing_id uuid;
BEGIN
  IF p_school_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Escola e actor são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.sga_actor_is_academic_manager(p_actor_id, p_school_id) THEN
    RAISE EXCEPTION 'Apenas Administração/Secretaria pode configurar o calendário académico.'
      USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_year_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nome do ano lectivo é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF p_starts_on IS NULL OR p_ends_on IS NULL OR p_starts_on > p_ends_on THEN
    RAISE EXCEPTION 'Intervalo do ano lectivo inválido.' USING ERRCODE = '22007';
  END IF;
  IF p_terms IS NULL OR jsonb_typeof(p_terms) <> 'array' OR jsonb_array_length(p_terms) <> 3 THEN
    RAISE EXCEPTION 'Configure exactamente três trimestres.' USING ERRCODE = '22023';
  END IF;

  FOR v_sequence IN 1..3 LOOP
    SELECT value
      INTO v_term
    FROM jsonb_array_elements(p_terms)
    WHERE (value ->> 'sequence') ~ '^[0-9]+$'
      AND (value ->> 'sequence')::integer = v_sequence;

    IF v_term IS NULL THEN
      RAISE EXCEPTION 'Falta configurar o %º trimestre.', v_sequence USING ERRCODE = '22023';
    END IF;

    IF (
      SELECT count(*)
      FROM jsonb_array_elements(p_terms)
      WHERE (value ->> 'sequence') ~ '^[0-9]+$'
        AND (value ->> 'sequence')::integer = v_sequence
    ) <> 1 THEN
      RAISE EXCEPTION 'O %º trimestre está duplicado.', v_sequence USING ERRCODE = '22023';
    END IF;

    v_term_name := NULLIF(btrim(v_term ->> 'name'), '');
    v_term_start := (v_term ->> 'startsOn')::date;
    v_term_end := (v_term ->> 'endsOn')::date;

    IF v_term_name IS NULL THEN
      RAISE EXCEPTION 'Nome do %º trimestre é obrigatório.', v_sequence USING ERRCODE = '22023';
    END IF;
    IF v_term_start > v_term_end THEN
      RAISE EXCEPTION 'Intervalo do %º trimestre é inválido.', v_sequence USING ERRCODE = '22007';
    END IF;
    IF v_term_start < p_starts_on OR v_term_end > p_ends_on THEN
      RAISE EXCEPTION 'O %º trimestre deve ficar dentro do ano lectivo.', v_sequence
        USING ERRCODE = '22007';
    END IF;
    IF v_previous_end IS NOT NULL AND v_term_start <= v_previous_end THEN
      RAISE EXCEPTION 'O %º trimestre sobrepõe o trimestre anterior.', v_sequence
        USING ERRCODE = '22007';
    END IF;
    v_previous_end := v_term_end;
  END LOOP;

  IF p_academic_year_id IS NOT NULL THEN
    SELECT ay.id
      INTO v_year_id
    FROM public.academic_years ay
    WHERE ay.id = p_academic_year_id
      AND ay.school_id = p_school_id
    FOR UPDATE;

    IF v_year_id IS NULL THEN
      RAISE EXCEPTION 'Ano lectivo não encontrado nesta escola.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT ay.id
      INTO v_year_id
    FROM public.academic_years ay
    WHERE ay.school_id = p_school_id
      AND ay.status = 'active'
    ORDER BY ay.starts_on DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_year_id IS NULL THEN
    INSERT INTO public.academic_years (
      school_id, name, starts_on, ends_on, status, created_by, updated_by
    )
    VALUES (
      p_school_id, btrim(p_year_name), p_starts_on, p_ends_on, 'active', p_actor_id, p_actor_id
    )
    RETURNING id INTO v_year_id;
  ELSE
    UPDATE public.academic_years
    SET name = btrim(p_year_name),
        starts_on = p_starts_on,
        ends_on = p_ends_on,
        status = 'active',
        updated_by = p_actor_id
    WHERE id = v_year_id
      AND school_id = p_school_id;
  END IF;

  PERFORM set_config('siga.defer_term_overlap', 'on', true);

  FOR v_sequence IN 1..3 LOOP
    SELECT value
      INTO v_term
    FROM jsonb_array_elements(p_terms)
    WHERE (value ->> 'sequence')::integer = v_sequence;

    v_term_name := btrim(v_term ->> 'name');
    v_term_start := (v_term ->> 'startsOn')::date;
    v_term_end := (v_term ->> 'endsOn')::date;

    SELECT count(*)::integer, (array_agg(t.id))[1]
      INTO v_existing_count, v_existing_id
    FROM public.terms t
    WHERE t.school_id = p_school_id
      AND t.academic_year_id = v_year_id
      AND t.sequence = v_sequence;

    IF v_existing_count > 1 THEN
      RAISE EXCEPTION 'Existem trimestres duplicados na sequência %. Corrija os dados antes de continuar.', v_sequence
        USING ERRCODE = '23505';
    END IF;

    IF v_existing_count = 1 THEN
      UPDATE public.terms
      SET name = v_term_name,
          starts_on = v_term_start,
          ends_on = v_term_end,
          updated_by = p_actor_id
      WHERE id = v_existing_id
        AND school_id = p_school_id
        AND academic_year_id = v_year_id;
    ELSE
      INSERT INTO public.terms (
        school_id, academic_year_id, name, sequence, starts_on, ends_on, created_by, updated_by
      )
      VALUES (
        p_school_id, v_year_id, v_term_name, v_sequence,
        v_term_start, v_term_end, p_actor_id, p_actor_id
      );
    END IF;
  END LOOP;

  PERFORM set_config('siga.defer_term_overlap', 'off', true);

  IF EXISTS (
    SELECT 1
    FROM public.terms a
    JOIN public.terms b
      ON b.academic_year_id = a.academic_year_id
     AND a.id < b.id
     AND a.starts_on <= b.ends_on
     AND b.starts_on <= a.ends_on
    WHERE a.academic_year_id = v_year_id
  ) THEN
    RAISE EXCEPTION 'Os trimestres sobrepõem-se a outro período do mesmo ano lectivo.'
      USING ERRCODE = '23P01';
  END IF;

  RETURN v_year_id;
END;
$function$;
