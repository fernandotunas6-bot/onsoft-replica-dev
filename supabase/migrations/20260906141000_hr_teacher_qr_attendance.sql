-- SIGA / Onsoft — presença do professor por QR temporário
-- Complementa a ponte RH ↔ horários sem transformar um simples slot semanal em pagamento.
-- O QR é um desafio efémero por ocorrência e propósito (check-in/check-out).

CREATE TABLE public.hr_teacher_qr_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  occurrence_id uuid NOT NULL REFERENCES public.hr_teacher_lesson_occurrences(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('check_in', 'check_out')),
  token_hash text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (expires_at > issued_at),
  CHECK ((status = 'used') = (used_at IS NOT NULL))
);

CREATE UNIQUE INDEX hr_teacher_qr_sessions_token_hash_idx
  ON public.hr_teacher_qr_sessions (token_hash);
CREATE INDEX hr_teacher_qr_sessions_occurrence_idx
  ON public.hr_teacher_qr_sessions (school_id, occurrence_id, purpose, status, expires_at DESC);

CREATE OR REPLACE FUNCTION public.hr_assert_teacher_qr_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
BEGIN
  SELECT school_id INTO v_school
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = NEW.occurrence_id;

  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school QR occurrence reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_teacher_qr_same_school
  BEFORE INSERT OR UPDATE ON public.hr_teacher_qr_sessions
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_teacher_qr_same_school();

-- Expira automaticamente desafios antigos antes de emitir/usar novos.
CREATE OR REPLACE FUNCTION public.hr_expire_teacher_qr_sessions(p_occurrence_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.hr_teacher_qr_sessions
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at <= now()
    AND (p_occurrence_id IS NULL OR occurrence_id = p_occurrence_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_expire_teacher_qr_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_expire_teacher_qr_sessions(uuid) TO service_role;

-- Resgate atómico do QR pelo professor autenticado.
-- No check-in marca início real. No check-out marca fim real e confirma a aula,
-- gerando o evento remunerável apenas se existir contrato lesson_hour activo.
CREATE OR REPLACE FUNCTION public.hr_redeem_teacher_qr(
  p_token_hash text
)
RETURNS TABLE (
  occurrence_id uuid,
  purpose text,
  compensation_event_id uuid,
  occurrence_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session public.hr_teacher_qr_sessions%ROWTYPE;
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_teacher_user uuid;
  v_rate numeric(14,2);
  v_event_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid QR token';
  END IF;

  PERFORM public.hr_expire_teacher_qr_sessions(NULL);

  SELECT * INTO v_session
  FROM public.hr_teacher_qr_sessions
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'QR challenge not found'; END IF;
  IF v_session.status <> 'active' OR v_session.expires_at <= now() THEN
    RAISE EXCEPTION 'QR challenge expired or unavailable';
  END IF;

  SELECT * INTO v_occ
  FROM public.hr_teacher_lesson_occurrences
  WHERE id = v_session.occurrence_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Lesson occurrence not found'; END IF;
  IF v_occ.status IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Lesson occurrence is not eligible for attendance';
  END IF;

  SELECT user_id INTO v_teacher_user
  FROM public.teachers
  WHERE id = v_occ.teacher_id
    AND school_id = v_occ.school_id
    AND status = 'active';

  IF v_teacher_user IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'QR challenge belongs to another teacher';
  END IF;

  IF v_session.purpose = 'check_in' THEN
    IF v_occ.actual_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'Teacher already checked in for this lesson';
    END IF;

    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_started_at = now(),
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        updated_by = v_user_id
    WHERE id = v_occ.id;

  ELSIF v_session.purpose = 'check_out' THEN
    IF v_occ.actual_started_at IS NULL THEN
      RAISE EXCEPTION 'Check-in is required before check-out';
    END IF;
    IF v_occ.actual_ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'Teacher already checked out for this lesson';
    END IF;
    IF v_occ.contract_id IS NULL THEN
      RAISE EXCEPTION 'Lesson occurrence has no payroll contract';
    END IF;

    SELECT lesson_hour_rate_kz INTO v_rate
    FROM public.hr_contracts
    WHERE id = v_occ.contract_id
      AND school_id = v_occ.school_id
      AND employment_id = v_occ.employment_id
      AND salary_type = 'lesson_hour'
      AND status = 'active'
      AND deleted_at IS NULL
      AND starts_on <= v_occ.lesson_date
      AND (ends_on IS NULL OR ends_on >= v_occ.lesson_date);

    IF v_rate IS NULL THEN
      RAISE EXCEPTION 'No active lesson-hour contract for this occurrence';
    END IF;

    INSERT INTO public.hr_compensation_events (
      school_id, employment_id, contract_id, event_date, event_type,
      quantity, unit_rate_kz, source_type, source_id, description,
      validation_status, validated_at, validated_by, created_by
    ) VALUES (
      v_occ.school_id, v_occ.employment_id, v_occ.contract_id, v_occ.lesson_date,
      'lesson_hour', v_occ.quantity, v_rate, 'teacher_lesson_occurrence', v_occ.id,
      'Aula confirmada por check-in/check-out QR', 'validated', now(),
      v_user_id, v_user_id
    )
    ON CONFLICT (school_id, source_type, source_id, employment_id, event_type)
      WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL
    DO UPDATE SET updated_by = v_user_id
    RETURNING id INTO v_event_id;

    UPDATE public.hr_teacher_lesson_occurrences
    SET actual_ended_at = now(),
        status = 'confirmed',
        evidence_method = 'qr',
        evidence_ref = v_session.id::text,
        confirmed_at = now(),
        confirmed_by = v_user_id,
        compensation_event_id = v_event_id,
        updated_by = v_user_id
    WHERE id = v_occ.id;
  END IF;

  UPDATE public.hr_teacher_qr_sessions
  SET status = 'used', used_at = now(), used_by = v_user_id
  WHERE id = v_session.id;

  RETURN QUERY
  SELECT v_occ.id,
         v_session.purpose,
         CASE WHEN v_session.purpose = 'check_out' THEN v_event_id ELSE NULL::uuid END,
         CASE WHEN v_session.purpose = 'check_out' THEN 'confirmed'::text ELSE 'scheduled'::text END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hr_redeem_teacher_qr(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_redeem_teacher_qr(text) TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.hr_teacher_qr_sessions TO authenticated;
GRANT ALL ON public.hr_teacher_qr_sessions TO service_role;
ALTER TABLE public.hr_teacher_qr_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_teacher_qr_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR reads teacher QR sessions in own school"
  ON public.hr_teacher_qr_sessions FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

CREATE POLICY "HR creates teacher QR sessions in own school"
  ON public.hr_teacher_qr_sessions FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

CREATE POLICY "HR updates teacher QR sessions in own school"
  ON public.hr_teacher_qr_sessions FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

COMMENT ON TABLE public.hr_teacher_qr_sessions IS
  'Desafios QR temporários e de uso único para check-in/check-out do professor em uma ocorrência concreta de aula.';

NOTIFY pgrst, 'reload schema';
