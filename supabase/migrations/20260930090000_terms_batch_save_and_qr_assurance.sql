-- 1) Trimestres gravados de uma vez (save_academic_calendar)
--    A função actualizava trimestre a trimestre e o trigger guard_term_within_year
--    comparava cada linha com as outras ainda antigas: avançar as datas do ano
--    (ex.: 1.º trimestre passa a acabar depois de o 2.º antigo começar) falhava a meio
--    com «sobreposição», embora o conjunto novo fosse válido. Agora a verificação de
--    sobreposição fica adiada durante a gravação e é feita uma vez, no fim, sobre
--    todos os períodos do ano.
--
-- 2) hr_evaluate_teacher_attendance_assurance gravava qr_valid = true sempre, mesmo
--    chamada directamente sem QR. Passa a ser verdade só havendo um desafio QR activo
--    para a mesma aula e operação; sem ele o peso do QR não conta e fica o motivo
--    «qr_not_active». O resgate (hr_redeem_teacher_qr) já exigia o token real.
--
-- 3) A versão original de save_academic_calendar usava min(uuid), que não existe no
--    PostgreSQL 17: a função falhava sempre e o botão «Trimestres» nunca gravava.
--
-- Idempotente (CREATE OR REPLACE). As permissões das funções mantêm-se.

CREATE OR REPLACE FUNCTION public.guard_term_within_year()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE y record;
BEGIN
  IF NEW.starts_on IS NOT NULL AND NEW.ends_on IS NOT NULL AND NEW.starts_on >= NEW.ends_on THEN
    RAISE EXCEPTION 'O período tem de terminar depois de começar.' USING ERRCODE = '23514';
  END IF;
  SELECT starts_on, ends_on INTO y FROM academic_years WHERE id = NEW.academic_year_id;
  IF FOUND AND (NEW.starts_on < y.starts_on OR NEW.ends_on > y.ends_on) THEN
    RAISE EXCEPTION 'O período tem de ficar dentro das datas do ano lectivo.' USING ERRCODE = '23514';
  END IF;
  -- save_academic_calendar grava os três trimestres em sequência e verifica a
  -- sobreposição do conjunto no fim (siga.defer_term_overlap, local à transacção).
  IF COALESCE(current_setting('siga.defer_term_overlap', true), '') <> 'on'
     AND EXISTS (SELECT 1 FROM terms t WHERE t.id <> NEW.id AND t.academic_year_id = NEW.academic_year_id
             AND t.starts_on <= NEW.ends_on AND NEW.starts_on <= t.ends_on) THEN
    RAISE EXCEPTION 'O período sobrepõe-se a outro período do mesmo ano lectivo.' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $function$;

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

  -- Validar primeiro todo o payload antes de alterar qualquer linha.
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

  -- Os três trimestres são gravados em sequência; a sobreposição com os valores
  -- antigos (ainda por actualizar) não conta. Verificada no fim, para o conjunto.
  PERFORM set_config('siga.defer_term_overlap', 'on', true);

  FOR v_sequence IN 1..3 LOOP
    SELECT value
      INTO v_term
    FROM jsonb_array_elements(p_terms)
    WHERE (value ->> 'sequence')::integer = v_sequence;

    v_term_name := btrim(v_term ->> 'name');
    v_term_start := (v_term ->> 'startsOn')::date;
    v_term_end := (v_term ->> 'endsOn')::date;

    -- `min(uuid)` não existe no PostgreSQL 17: a versão original falhava SEMPRE aqui.
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

  -- Conjunto final: nenhum período do ano (incluindo outros além dos três) sobreposto.
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

CREATE OR REPLACE FUNCTION public.hr_evaluate_teacher_attendance_assurance(p_occurrence_id uuid, p_purpose text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_accuracy_m double precision DEFAULT NULL::double precision)
 RETURNS TABLE(evidence_id uuid, assurance_score integer, decision text, inside_geofence boolean, distance_from_school_m numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_teacher_user uuid;
  v_policy public.hr_attendance_assurance_policies%ROWTYPE;
  v_score integer := 0;
  v_qr_valid boolean := false;
  v_time_valid boolean := false;
  v_location_supplied boolean := false;
  v_inside boolean := NULL;
  v_distance double precision := NULL;
  v_decision text;
  v_reasons jsonb := '[]'::jsonb;
  v_scheduled timestamptz;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_purpose NOT IN ('check_in','check_out') THEN RAISE EXCEPTION 'Invalid attendance purpose'; END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN RAISE EXCEPTION 'Incomplete location'; END IF;
  IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180) THEN
    RAISE EXCEPTION 'Invalid location';
  END IF;

  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = p_occurrence_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;

  SELECT user_id INTO v_teacher_user
  FROM public.teachers
  WHERE id = v_occ.teacher_id AND school_id = v_occ.school_id AND status = 'active';
  IF v_teacher_user IS DISTINCT FROM v_user THEN RAISE EXCEPTION 'Attendance belongs to another teacher'; END IF;

  SELECT * INTO v_policy
  FROM public.hr_attendance_assurance_policies
  WHERE school_id = v_occ.school_id;

  IF NOT FOUND THEN
    v_policy.school_id := v_occ.school_id;
    v_policy.enabled := true;
    v_policy.geofence_radius_m := 150;
    v_policy.max_location_accuracy_m := 100;
    v_policy.require_location := false;
    v_policy.store_exact_location := false;
    v_policy.checkin_early_minutes := 20;
    v_policy.checkin_late_minutes := 20;
    v_policy.checkout_early_minutes := 20;
    v_policy.checkout_late_minutes := 60;
    v_policy.qr_weight := 30;
    v_policy.identity_weight := 20;
    v_policy.time_weight := 20;
    v_policy.location_weight := 20;
    v_policy.device_integrity_weight := 10;
    v_policy.auto_approve_score := 70;
    v_policy.review_score := 45;
  END IF;

  -- Só há QR válido com um desafio activo desta aula e operação (o que o professor
  -- leu). Antes gravava-se qr_valid = true sempre, mesmo chamando o RPC sem QR.
  v_qr_valid := EXISTS (
    SELECT 1 FROM public.hr_teacher_qr_sessions s
    WHERE s.occurrence_id = v_occ.id
      AND s.school_id = v_occ.school_id
      AND s.purpose = p_purpose
      AND s.status = 'active'
      AND s.expires_at > now()
  );
  IF v_qr_valid THEN
    v_score := v_score + v_policy.qr_weight;
  ELSE
    v_reasons := v_reasons || jsonb_build_array('qr_not_active');
  END IF;
  v_score := v_score + v_policy.identity_weight;

  IF p_purpose = 'check_in' THEN
    v_scheduled := (v_occ.lesson_date::text || ' ' || v_occ.scheduled_starts_at::text || ' Africa/Luanda')::timestamptz;
    v_window_start := v_scheduled - make_interval(mins => v_policy.checkin_early_minutes);
    v_window_end := v_scheduled + make_interval(mins => v_policy.checkin_late_minutes);
  ELSE
    v_scheduled := (v_occ.lesson_date::text || ' ' || v_occ.scheduled_ends_at::text || ' Africa/Luanda')::timestamptz;
    v_window_start := v_scheduled - make_interval(mins => v_policy.checkout_early_minutes);
    v_window_end := v_scheduled + make_interval(mins => v_policy.checkout_late_minutes);
  END IF;

  v_time_valid := now() BETWEEN v_window_start AND v_window_end;
  IF v_time_valid THEN
    v_score := v_score + v_policy.time_weight;
  ELSE
    v_reasons := v_reasons || jsonb_build_array('outside_time_window');
  END IF;

  v_location_supplied := p_latitude IS NOT NULL;
  IF v_location_supplied AND v_policy.center_latitude IS NOT NULL THEN
    v_distance := public.hr_haversine_distance_m(
      p_latitude, p_longitude, v_policy.center_latitude, v_policy.center_longitude
    );
    v_inside := v_distance <= v_policy.geofence_radius_m
      AND COALESCE(p_accuracy_m, v_policy.max_location_accuracy_m + 1) <= v_policy.max_location_accuracy_m;
    IF v_inside THEN
      v_score := v_score + v_policy.location_weight;
    ELSE
      v_reasons := v_reasons || jsonb_build_array(
        CASE WHEN COALESCE(p_accuracy_m, v_policy.max_location_accuracy_m + 1) > v_policy.max_location_accuracy_m
          THEN 'location_accuracy_too_low' ELSE 'outside_geofence' END
      );
    END IF;
  ELSIF v_policy.require_location THEN
    v_reasons := v_reasons || jsonb_build_array('location_required');
  END IF;

  IF v_policy.require_location AND COALESCE(v_inside, false) = false THEN
    v_decision := CASE WHEN v_score >= v_policy.review_score THEN 'review' ELSE 'reject' END;
  ELSIF v_score >= v_policy.auto_approve_score THEN
    v_decision := 'auto_approve';
  ELSIF v_score >= v_policy.review_score THEN
    v_decision := 'review';
  ELSE
    v_decision := 'reject';
  END IF;

  INSERT INTO public.hr_attendance_assurance_evidence (
    school_id, occurrence_id, purpose, actor_user_id,
    qr_valid, identity_valid, time_valid,
    location_supplied, location_accuracy_m, distance_from_school_m, inside_geofence,
    latitude, longitude, device_integrity_provider, device_integrity_valid,
    assurance_score, decision, reasons
  ) VALUES (
    v_occ.school_id, v_occ.id, p_purpose, v_user,
    v_qr_valid, true, v_time_valid,
    v_location_supplied, p_accuracy_m, v_distance, v_inside,
    CASE WHEN v_policy.store_exact_location THEN p_latitude ELSE NULL END,
    CASE WHEN v_policy.store_exact_location THEN p_longitude ELSE NULL END,
    NULL, NULL,
    LEAST(v_score,100), v_decision, v_reasons
  ) RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, LEAST(v_score,100), v_decision, v_inside, v_distance::numeric;
END;
$function$;
