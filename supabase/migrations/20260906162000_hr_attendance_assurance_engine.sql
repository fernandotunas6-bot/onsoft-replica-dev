-- SIGA / Onsoft — motor avançado de confiança para presença docente
-- Combina QR, identidade autenticada, janela temporal, geofence e sinais de integridade.
-- Nenhum sinal isolado é tratado como prova absoluta.

CREATE TABLE public.hr_attendance_assurance_policies (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  center_latitude double precision,
  center_longitude double precision,
  geofence_radius_m integer NOT NULL DEFAULT 150 CHECK (geofence_radius_m BETWEEN 20 AND 5000),
  max_location_accuracy_m integer NOT NULL DEFAULT 100 CHECK (max_location_accuracy_m BETWEEN 10 AND 5000),
  require_location boolean NOT NULL DEFAULT false,
  store_exact_location boolean NOT NULL DEFAULT false,
  checkin_early_minutes integer NOT NULL DEFAULT 20 CHECK (checkin_early_minutes BETWEEN 0 AND 180),
  checkin_late_minutes integer NOT NULL DEFAULT 20 CHECK (checkin_late_minutes BETWEEN 0 AND 180),
  checkout_early_minutes integer NOT NULL DEFAULT 20 CHECK (checkout_early_minutes BETWEEN 0 AND 180),
  checkout_late_minutes integer NOT NULL DEFAULT 60 CHECK (checkout_late_minutes BETWEEN 0 AND 360),
  qr_weight smallint NOT NULL DEFAULT 30 CHECK (qr_weight BETWEEN 0 AND 100),
  identity_weight smallint NOT NULL DEFAULT 20 CHECK (identity_weight BETWEEN 0 AND 100),
  time_weight smallint NOT NULL DEFAULT 20 CHECK (time_weight BETWEEN 0 AND 100),
  location_weight smallint NOT NULL DEFAULT 20 CHECK (location_weight BETWEEN 0 AND 100),
  device_integrity_weight smallint NOT NULL DEFAULT 10 CHECK (device_integrity_weight BETWEEN 0 AND 100),
  auto_approve_score smallint NOT NULL DEFAULT 70 CHECK (auto_approve_score BETWEEN 0 AND 100),
  review_score smallint NOT NULL DEFAULT 45 CHECK (review_score BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CHECK ((center_latitude IS NULL) = (center_longitude IS NULL)),
  CHECK (center_latitude IS NULL OR center_latitude BETWEEN -90 AND 90),
  CHECK (center_longitude IS NULL OR center_longitude BETWEEN -180 AND 180),
  CHECK (qr_weight + identity_weight + time_weight + location_weight + device_integrity_weight <= 100),
  CHECK (auto_approve_score >= review_score)
);

CREATE TRIGGER hr_attendance_assurance_policies_set_updated_at
  BEFORE UPDATE ON public.hr_attendance_assurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TABLE public.hr_attendance_assurance_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  occurrence_id uuid NOT NULL REFERENCES public.hr_teacher_lesson_occurrences(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('check_in', 'check_out')),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  captured_at timestamptz NOT NULL DEFAULT now(),
  qr_valid boolean NOT NULL DEFAULT false,
  identity_valid boolean NOT NULL DEFAULT false,
  time_valid boolean,
  location_supplied boolean NOT NULL DEFAULT false,
  location_accuracy_m numeric(10,2),
  distance_from_school_m numeric(12,2),
  inside_geofence boolean,
  latitude double precision,
  longitude double precision,
  device_integrity_provider text CHECK (device_integrity_provider IS NULL OR device_integrity_provider IN ('play_integrity','app_attest','webauthn','none')),
  device_integrity_valid boolean,
  assurance_score smallint NOT NULL DEFAULT 0 CHECK (assurance_score BETWEEN 0 AND 100),
  decision text NOT NULL CHECK (decision IN ('auto_approve','review','reject')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX hr_attendance_assurance_occurrence_idx
  ON public.hr_attendance_assurance_evidence (school_id, occurrence_id, captured_at DESC);
CREATE INDEX hr_attendance_assurance_decision_idx
  ON public.hr_attendance_assurance_evidence (school_id, decision, captured_at DESC);

CREATE OR REPLACE FUNCTION public.hr_haversine_distance_m(
  p_lat1 double precision,
  p_lon1 double precision,
  p_lat2 double precision,
  p_lon2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 6371000.0 * 2.0 * asin(
    sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2.0), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians(p_lon2 - p_lon1) / 2.0), 2)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.hr_haversine_distance_m(double precision,double precision,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_haversine_distance_m(double precision,double precision,double precision,double precision) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_evaluate_teacher_attendance_assurance(
  p_occurrence_id uuid,
  p_purpose text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_accuracy_m double precision DEFAULT NULL
)
RETURNS TABLE (
  evidence_id uuid,
  assurance_score integer,
  decision text,
  inside_geofence boolean,
  distance_from_school_m numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_occ public.hr_teacher_lesson_occurrences%ROWTYPE;
  v_teacher_user uuid;
  v_policy public.hr_attendance_assurance_policies%ROWTYPE;
  v_score integer := 0;
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

  v_score := v_score + v_policy.qr_weight + v_policy.identity_weight;

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
    true, true, v_time_valid,
    v_location_supplied, p_accuracy_m, v_distance, v_inside,
    CASE WHEN v_policy.store_exact_location THEN p_latitude ELSE NULL END,
    CASE WHEN v_policy.store_exact_location THEN p_longitude ELSE NULL END,
    NULL, NULL,
    LEAST(v_score,100), v_decision, v_reasons
  ) RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, LEAST(v_score,100), v_decision, v_inside, v_distance::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_evaluate_teacher_attendance_assurance(uuid,text,double precision,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_evaluate_teacher_attendance_assurance(uuid,text,double precision,double precision,double precision) TO authenticated;

-- Se uma aula chegar ao motor financeiro com um check-out cuja confiança não é
-- auto_approve, o evento continua auditável mas fica pending e não entra no cálculo
-- da folha (o cálculo actual só soma eventos validated).
CREATE OR REPLACE FUNCTION public.hr_gate_teacher_compensation_by_assurance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_decision text;
BEGIN
  IF NEW.source_type = 'teacher_lesson_occurrence' AND NEW.source_id IS NOT NULL THEN
    SELECT decision INTO v_decision
    FROM public.hr_attendance_assurance_evidence
    WHERE occurrence_id = NEW.source_id
      AND school_id = NEW.school_id
      AND purpose = 'check_out'
    ORDER BY captured_at DESC
    LIMIT 1;

    IF v_decision IS NOT NULL AND v_decision <> 'auto_approve' THEN
      NEW.validation_status := 'pending';
      NEW.validated_at := NULL;
      NEW.validated_by := NULL;
      NEW.description := concat_ws(' · ', NEW.description, 'Presença pendente por confiança multifator');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_gate_teacher_compensation_by_assurance
  BEFORE INSERT OR UPDATE OF validation_status ON public.hr_compensation_events
  FOR EACH ROW EXECUTE FUNCTION public.hr_gate_teacher_compensation_by_assurance();

GRANT SELECT ON public.hr_attendance_assurance_policies TO authenticated;
GRANT SELECT ON public.hr_attendance_assurance_evidence TO authenticated;
GRANT ALL ON public.hr_attendance_assurance_policies, public.hr_attendance_assurance_evidence TO service_role;
ALTER TABLE public.hr_attendance_assurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_assurance_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_assurance_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance_assurance_evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR reads attendance assurance policy"
  ON public.hr_attendance_assurance_policies FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

CREATE POLICY "HR reads attendance assurance evidence"
  ON public.hr_attendance_assurance_evidence FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (
      (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
      OR actor_user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.hr_attendance_assurance_evidence IS
  'Evidências e score multifator da presença docente: QR, identidade, tempo, localização e integridade de dispositivo.';

NOTIFY pgrst, 'reload schema';
