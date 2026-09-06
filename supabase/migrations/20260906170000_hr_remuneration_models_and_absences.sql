-- SIGA / Onsoft — modelos remuneratórios por contrato e tratamento de faltas
-- Suporta três realidades sem inferir regime jurídico apenas pelo tipo de escola:
-- 1) fixed_deduct_absence: vencimento-base mensal menos faltas não remuneradas;
-- 2) validated_units: soma apenas horas/aulas efectivamente validadas;
-- 3) hybrid: vencimento-base + unidades adicionais, com descontos de faltas quando aplicável.
--
-- As fórmulas de desconto são configuráveis por contrato/política. O sistema não
-- hard-codeia um divisor legal único nem presume que toda falta justificada é paga.

CREATE TABLE public.hr_contract_remuneration_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.hr_contracts(id) ON DELETE CASCADE,
  remuneration_model text NOT NULL CHECK (remuneration_model IN (
    'fixed_deduct_absence', 'validated_units', 'hybrid'
  )),
  -- Usado para converter uma falta em valor quando o contrato é mensal/híbrido.
  -- Ex.: divisor mensal configurado pela instituição e duração padrão de um dia.
  monthly_divisor_days numeric(8,2) CHECK (monthly_divisor_days IS NULL OR monthly_divisor_days > 0),
  standard_workday_minutes integer CHECK (standard_workday_minutes IS NULL OR standard_workday_minutes BETWEEN 30 AND 1440),
  deduct_unjustified_absence boolean NOT NULL DEFAULT true,
  deduct_justified_unpaid_absence boolean NOT NULL DEFAULT true,
  deduct_justified_paid_absence boolean NOT NULL DEFAULT false,
  allow_validated_hour_additions boolean NOT NULL DEFAULT false,
  allow_validated_lesson_additions boolean NOT NULL DEFAULT false,
  allow_overtime_additions boolean NOT NULL DEFAULT true,
  policy_source text NOT NULL DEFAULT 'institution' CHECK (policy_source IN (
    'institution', 'contract', 'public_service', 'collective_agreement', 'other'
  )),
  legal_reference text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (contract_id),
  CHECK (
    remuneration_model = 'validated_units'
    OR (monthly_divisor_days IS NOT NULL AND standard_workday_minutes IS NOT NULL)
  )
);

CREATE INDEX hr_contract_remuneration_policies_school_idx
  ON public.hr_contract_remuneration_policies (school_id, remuneration_model, active);

CREATE TABLE public.hr_absence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  contract_id uuid REFERENCES public.hr_contracts(id),
  absence_date date NOT NULL,
  absence_type text NOT NULL CHECK (absence_type IN (
    'justified_paid', 'justified_unpaid', 'unjustified'
  )),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  -- Multiplicador fica configurável para regimes especiais; 1.0 é o normal.
  deduction_multiplier numeric(6,3) NOT NULL DEFAULT 1 CHECK (deduction_multiplier > 0 AND deduction_multiplier <= 10),
  source_type text,
  source_id uuid,
  reason text,
  evidence_ref text,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN (
    'pending', 'validated', 'rejected', 'cancelled'
  )),
  validated_at timestamptz,
  validated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX hr_absence_events_payroll_idx
  ON public.hr_absence_events (school_id, employment_id, absence_date, validation_status)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX hr_absence_events_source_idx
  ON public.hr_absence_events (school_id, source_type, source_id, employment_id)
  WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hr_assert_remuneration_policy_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.hr_contracts WHERE id = NEW.contract_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school remuneration policy reference';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_assert_absence_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_school uuid;
DECLARE v_contract_employment uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'HR cross-school absence employment reference';
  END IF;

  IF NEW.contract_id IS NOT NULL THEN
    SELECT school_id, employment_id INTO v_school, v_contract_employment
    FROM public.hr_contracts WHERE id = NEW.contract_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN
      RAISE EXCEPTION 'HR cross-school absence contract reference';
    END IF;
    IF v_contract_employment IS DISTINCT FROM NEW.employment_id THEN
      RAISE EXCEPTION 'HR absence contract/employment mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_contract_remuneration_policy_same_school
  BEFORE INSERT OR UPDATE ON public.hr_contract_remuneration_policies
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_remuneration_policy_same_school();
CREATE TRIGGER hr_absence_same_school
  BEFORE INSERT OR UPDATE ON public.hr_absence_events
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_absence_same_school();
CREATE TRIGGER hr_contract_remuneration_policies_set_updated_at
  BEFORE UPDATE ON public.hr_contract_remuneration_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_absence_events_set_updated_at
  BEFORE UPDATE ON public.hr_absence_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.hr_contract_remuneration_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hr_absence_events TO authenticated;
GRANT ALL ON public.hr_contract_remuneration_policies, public.hr_absence_events TO service_role;
ALTER TABLE public.hr_contract_remuneration_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_contract_remuneration_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hr_absence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_absence_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "HR reads remuneration policies in own school"
  ON public.hr_contract_remuneration_policies FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  );
CREATE POLICY "HR creates remuneration policies in own school"
  ON public.hr_contract_remuneration_policies FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  );
CREATE POLICY "HR updates remuneration policies in own school"
  ON public.hr_contract_remuneration_policies FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  );

CREATE POLICY "HR reads absence events in own school"
  ON public.hr_absence_events FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
    AND deleted_at IS NULL
  );
CREATE POLICY "HR creates absence events in own school"
  ON public.hr_absence_events FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  );
CREATE POLICY "HR updates absence events in own school"
  ON public.hr_absence_events FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador','Tesouraria')
  );

-- Motor unificado de cálculo da folha.
-- Mantém compatibilidade com a assinatura existente e acrescenta os três modelos.
CREATE OR REPLACE FUNCTION public.hr_calculate_payroll_item(
  p_payroll_run_id uuid,
  p_employment_id uuid
)
RETURNS public.hr_payroll_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_run public.hr_payroll_runs;
  v_emp public.hr_employments;
  v_contract public.hr_contracts;
  v_policy public.hr_contract_remuneration_policies;
  v_model text;
  v_base numeric(14,2) := 0;
  v_hourly numeric(14,2) := 0;
  v_allowances numeric(14,2) := 0;
  v_bonuses numeric(14,2) := 0;
  v_overtime numeric(14,2) := 0;
  v_absence_deduction numeric(14,2) := 0;
  v_gross numeric(14,2) := 0;
  v_net numeric(14,2) := 0;
  v_item public.hr_payroll_items;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND OR v_run.school_id <> public.is_school_member(v_run.school_id) THEN
    RAISE EXCEPTION 'Payroll run not accessible';
  END IF;
  IF v_run.status NOT IN ('draft', 'calculating', 'review') THEN
    RAISE EXCEPTION 'Payroll run is locked for calculation';
  END IF;

  SELECT * INTO v_emp FROM public.hr_employments
  WHERE id = p_employment_id AND school_id = v_run.school_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employment not found in payroll school'; END IF;

  SELECT * INTO v_contract
  FROM public.hr_contracts
  WHERE employment_id = p_employment_id
    AND school_id = v_run.school_id
    AND deleted_at IS NULL
    AND status = 'active'
    AND starts_on <= v_run.period_end
    AND (ends_on IS NULL OR ends_on >= v_run.period_start)
  ORDER BY starts_on DESC, created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active contract for payroll period'; END IF;

  SELECT * INTO v_policy
  FROM public.hr_contract_remuneration_policies
  WHERE contract_id = v_contract.id AND school_id = v_run.school_id AND active = true;

  IF FOUND THEN
    v_model := v_policy.remuneration_model;
  ELSE
    -- Compatibilidade segura com contratos existentes.
    v_model := CASE
      WHEN v_contract.salary_type = 'monthly' THEN 'fixed_deduct_absence'
      ELSE 'validated_units'
    END;
  END IF;

  IF v_model IN ('fixed_deduct_absence','hybrid') THEN
    v_base := v_contract.base_salary_kz;
  END IF;

  SELECT
    COALESCE(sum(amount_kz) FILTER (
      WHERE event_type = 'worked_hour'
        AND (v_model = 'validated_units' OR (FOUND AND v_policy.allow_validated_hour_additions))
    ), 0),
    COALESCE(sum(amount_kz) FILTER (
      WHERE event_type = 'lesson_hour'
        AND (v_model = 'validated_units' OR (FOUND AND v_policy.allow_validated_lesson_additions))
    ), 0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'allowance'), 0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'bonus'), 0),
    COALESCE(sum(amount_kz) FILTER (
      WHERE event_type = 'overtime'
        AND (NOT FOUND OR v_policy.allow_overtime_additions)
    ), 0)
  INTO v_hourly, v_hourly, v_allowances, v_bonuses, v_overtime
  FROM public.hr_compensation_events
  WHERE school_id = v_run.school_id
    AND employment_id = p_employment_id
    AND event_date BETWEEN v_run.period_start AND v_run.period_end
    AND validation_status = 'validated'
    AND deleted_at IS NULL;

  -- Recalcular hourly total numa única soma para evitar dupla contagem e manter
  -- worked_hour/lesson_hour governados pela política.
  SELECT COALESCE(sum(amount_kz), 0)
  INTO v_hourly
  FROM public.hr_compensation_events
  WHERE school_id = v_run.school_id
    AND employment_id = p_employment_id
    AND event_date BETWEEN v_run.period_start AND v_run.period_end
    AND validation_status = 'validated'
    AND deleted_at IS NULL
    AND (
      (event_type = 'worked_hour' AND (v_model = 'validated_units' OR (FOUND AND v_policy.allow_validated_hour_additions)))
      OR
      (event_type = 'lesson_hour' AND (v_model = 'validated_units' OR (FOUND AND v_policy.allow_validated_lesson_additions)))
    );

  IF v_model IN ('fixed_deduct_absence','hybrid') THEN
    IF NOT FOUND THEN
      -- Contrato mensal legado sem política: mantém salário-base e não inventa
      -- fórmula de desconto. O administrador deve configurar a política antes
      -- de processar faltas remuneratórias automáticas.
      IF EXISTS (
        SELECT 1 FROM public.hr_absence_events ae
        WHERE ae.school_id = v_run.school_id
          AND ae.employment_id = p_employment_id
          AND ae.absence_date BETWEEN v_run.period_start AND v_run.period_end
          AND ae.validation_status = 'validated'
          AND ae.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Monthly contract has validated absences but no remuneration policy';
      END IF;
    ELSE
      SELECT COALESCE(sum(
        CASE
          WHEN ae.absence_type = 'unjustified' AND v_policy.deduct_unjustified_absence THEN
            ((v_contract.base_salary_kz / v_policy.monthly_divisor_days)
              * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
              * ae.deduction_multiplier)
          WHEN ae.absence_type = 'justified_unpaid' AND v_policy.deduct_justified_unpaid_absence THEN
            ((v_contract.base_salary_kz / v_policy.monthly_divisor_days)
              * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
              * ae.deduction_multiplier)
          WHEN ae.absence_type = 'justified_paid' AND v_policy.deduct_justified_paid_absence THEN
            ((v_contract.base_salary_kz / v_policy.monthly_divisor_days)
              * (ae.duration_minutes::numeric / v_policy.standard_workday_minutes)
              * ae.deduction_multiplier)
          ELSE 0
        END
      ), 0)
      INTO v_absence_deduction
      FROM public.hr_absence_events ae
      WHERE ae.school_id = v_run.school_id
        AND ae.employment_id = p_employment_id
        AND (ae.contract_id IS NULL OR ae.contract_id = v_contract.id)
        AND ae.absence_date BETWEEN v_run.period_start AND v_run.period_end
        AND ae.validation_status = 'validated'
        AND ae.deleted_at IS NULL;
    END IF;
  END IF;

  v_gross := v_base + v_hourly + v_allowances + v_bonuses + v_overtime;
  v_absence_deduction := LEAST(v_absence_deduction, v_gross);
  v_net := GREATEST(v_gross - v_absence_deduction, 0);

  INSERT INTO public.hr_payroll_items (
    school_id, payroll_run_id, employment_id, contract_id,
    base_amount_kz, hourly_amount_kz, allowances_kz, bonuses_kz, overtime_kz,
    deductions_kz, gross_amount_kz, net_amount_kz, status,
    calculation_details, created_by, updated_by
  ) VALUES (
    v_run.school_id, v_run.id, v_emp.id, v_contract.id,
    v_base, v_hourly, v_allowances, v_bonuses, v_overtime,
    v_absence_deduction, v_gross, v_net, 'calculated',
    jsonb_build_object(
      'salary_type', v_contract.salary_type,
      'remuneration_model', v_model,
      'contract_id', v_contract.id,
      'absence_deduction_kz', v_absence_deduction,
      'calculated_at', now(),
      'period_start', v_run.period_start,
      'period_end', v_run.period_end
    ),
    auth.uid(), auth.uid()
  )
  ON CONFLICT (payroll_run_id, employment_id) DO UPDATE SET
    contract_id = EXCLUDED.contract_id,
    base_amount_kz = EXCLUDED.base_amount_kz,
    hourly_amount_kz = EXCLUDED.hourly_amount_kz,
    allowances_kz = EXCLUDED.allowances_kz,
    bonuses_kz = EXCLUDED.bonuses_kz,
    overtime_kz = EXCLUDED.overtime_kz,
    deductions_kz = EXCLUDED.deductions_kz,
    gross_amount_kz = EXCLUDED.gross_amount_kz,
    net_amount_kz = EXCLUDED.net_amount_kz,
    status = EXCLUDED.status,
    calculation_details = EXCLUDED.calculation_details,
    updated_by = auth.uid()
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

COMMENT ON TABLE public.hr_contract_remuneration_policies IS
  'Define se o contrato remunera por vencimento-base menos faltas, por unidades validadas, ou em modelo híbrido.';
COMMENT ON TABLE public.hr_absence_events IS
  'Faltas funcionais validadas com classificação remuneratória, duração e multiplicador auditável.';

NOTIFY pgrst, 'reload schema';
