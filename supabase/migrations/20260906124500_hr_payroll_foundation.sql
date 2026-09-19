-- SIGA / Onsoft — RH e Folha Salarial (fundação)
-- Reutiliza public.people + public.person_roles como fonte única de identidade.
-- Não altera nem substitui tabelas financeiras existentes.

-- ---------------------------------------------------------------------------
-- Departamentos / unidades funcionais
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  name text NOT NULL,
  code text,
  description text,
  parent_department_id uuid REFERENCES public.hr_departments(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX hr_departments_school_name_idx
  ON public.hr_departments (school_id, lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX hr_departments_school_code_idx
  ON public.hr_departments (school_id, lower(code))
  WHERE deleted_at IS NULL AND code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Cargos / funções
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  department_id uuid REFERENCES public.hr_departments(id),
  name text NOT NULL,
  code text,
  category text NOT NULL DEFAULT 'staff' CHECK (category IN (
    'teacher', 'staff', 'director', 'management', 'support', 'other'
  )),
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX hr_positions_school_name_idx
  ON public.hr_positions (school_id, lower(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX hr_positions_school_code_idx
  ON public.hr_positions (school_id, lower(code))
  WHERE deleted_at IS NULL AND code IS NOT NULL;
CREATE INDEX hr_positions_department_idx
  ON public.hr_positions (department_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Vínculo funcional. Uma pessoa pode ter histórico de vários vínculos.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_employments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  person_id uuid NOT NULL REFERENCES public.people(id),
  position_id uuid REFERENCES public.hr_positions(id),
  department_id uuid REFERENCES public.hr_departments(id),
  employee_number text,
  employment_type text NOT NULL CHECK (employment_type IN (
    'permanent', 'fixed_term', 'service_provider', 'intern', 'temporary', 'other'
  )),
  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'draft', 'active', 'suspended', 'terminated', 'expired'
  )),
  hire_date date NOT NULL,
  termination_date date,
  work_location text,
  weekly_hours numeric(6,2) CHECK (weekly_hours IS NULL OR weekly_hours >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (termination_date IS NULL OR termination_date >= hire_date)
);

CREATE UNIQUE INDEX hr_employments_school_employee_number_idx
  ON public.hr_employments (school_id, employee_number)
  WHERE deleted_at IS NULL AND employee_number IS NOT NULL;
CREATE INDEX hr_employments_school_person_idx
  ON public.hr_employments (school_id, person_id) WHERE deleted_at IS NULL;
CREATE INDEX hr_employments_school_status_idx
  ON public.hr_employments (school_id, status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Contratos e regra de remuneração.
-- salary_type permite salário mensal, hora geral ou hora/aula.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  contract_number text,
  contract_type text NOT NULL CHECK (contract_type IN (
    'permanent', 'fixed_term', 'service_provider', 'intern', 'temporary', 'other'
  )),
  salary_type text NOT NULL CHECK (salary_type IN ('monthly', 'hourly', 'lesson_hour')),
  base_salary_kz numeric(14,2) NOT NULL DEFAULT 0 CHECK (base_salary_kz >= 0),
  hourly_rate_kz numeric(14,2) CHECK (hourly_rate_kz IS NULL OR hourly_rate_kz >= 0),
  lesson_hour_rate_kz numeric(14,2) CHECK (lesson_hour_rate_kz IS NULL OR lesson_hour_rate_kz >= 0),
  currency char(3) NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  starts_on date NOT NULL,
  ends_on date,
  payment_day smallint CHECK (payment_day BETWEEN 1 AND 31),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'active', 'suspended', 'ended', 'cancelled'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (
    (salary_type = 'monthly')
    OR (salary_type = 'hourly' AND hourly_rate_kz IS NOT NULL)
    OR (salary_type = 'lesson_hour' AND lesson_hour_rate_kz IS NOT NULL)
  )
);

CREATE UNIQUE INDEX hr_contracts_school_number_idx
  ON public.hr_contracts (school_id, contract_number)
  WHERE deleted_at IS NULL AND contract_number IS NOT NULL;
CREATE INDEX hr_contracts_employment_idx
  ON public.hr_contracts (employment_id) WHERE deleted_at IS NULL;
CREATE INDEX hr_contracts_school_status_idx
  ON public.hr_contracts (school_id, status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Eventos remuneráveis: horas/aulas validadas, horas extra e ajustes positivos.
-- A ligação a horário/aula é feita por source_type/source_id para evitar acoplar
-- esta fundação a uma tabela académica específica antes da integração seguinte.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_compensation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  contract_id uuid REFERENCES public.hr_contracts(id),
  event_date date NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'worked_hour', 'lesson_hour', 'overtime', 'allowance', 'bonus', 'adjustment'
  )),
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_rate_kz numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_rate_kz >= 0),
  amount_kz numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_rate_kz, 2)) STORED,
  source_type text,
  source_id uuid,
  description text,
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

CREATE INDEX hr_compensation_events_payroll_idx
  ON public.hr_compensation_events (school_id, event_date, validation_status)
  WHERE deleted_at IS NULL;
CREATE INDEX hr_compensation_events_employment_idx
  ON public.hr_compensation_events (employment_id, event_date)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX hr_compensation_events_source_idx
  ON public.hr_compensation_events (school_id, source_type, source_id, employment_id, event_type)
  WHERE deleted_at IS NULL AND source_type IS NOT NULL AND source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Folhas salariais por competência.
-- ---------------------------------------------------------------------------
CREATE TABLE public.hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  competence_year integer NOT NULL CHECK (competence_year BETWEEN 2000 AND 2200),
  competence_month smallint NOT NULL CHECK (competence_month BETWEEN 1 AND 12),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'calculating', 'review', 'approved', 'processing', 'paid', 'cancelled'
  )),
  total_gross_kz numeric(16,2) NOT NULL DEFAULT 0 CHECK (total_gross_kz >= 0),
  total_deductions_kz numeric(16,2) NOT NULL DEFAULT 0 CHECK (total_deductions_kz >= 0),
  total_net_kz numeric(16,2) NOT NULL DEFAULT 0 CHECK (total_net_kz >= 0),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CHECK (period_end >= period_start),
  UNIQUE (school_id, competence_year, competence_month)
);

CREATE INDEX hr_payroll_runs_school_status_idx
  ON public.hr_payroll_runs (school_id, status, competence_year DESC, competence_month DESC);

CREATE TABLE public.hr_payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  payroll_run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employment_id uuid NOT NULL REFERENCES public.hr_employments(id),
  contract_id uuid REFERENCES public.hr_contracts(id),
  base_amount_kz numeric(14,2) NOT NULL DEFAULT 0,
  hourly_amount_kz numeric(14,2) NOT NULL DEFAULT 0,
  allowances_kz numeric(14,2) NOT NULL DEFAULT 0,
  bonuses_kz numeric(14,2) NOT NULL DEFAULT 0,
  overtime_kz numeric(14,2) NOT NULL DEFAULT 0,
  deductions_kz numeric(14,2) NOT NULL DEFAULT 0,
  gross_amount_kz numeric(14,2) NOT NULL DEFAULT 0,
  net_amount_kz numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'calculated', 'approved', 'processing', 'paid', 'cancelled'
  )),
  calculation_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (payroll_run_id, employment_id),
  CHECK (gross_amount_kz >= 0),
  CHECK (deductions_kz >= 0),
  CHECK (net_amount_kz >= 0)
);

CREATE INDEX hr_payroll_items_employment_idx
  ON public.hr_payroll_items (school_id, employment_id, payroll_run_id);

-- Componentes detalhados da folha: salário, subsídio, bónus, imposto/desconto etc.
CREATE TABLE public.hr_payroll_item_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  payroll_item_id uuid NOT NULL REFERENCES public.hr_payroll_items(id) ON DELETE CASCADE,
  component_type text NOT NULL CHECK (component_type IN ('earning', 'deduction')),
  code text NOT NULL,
  name text NOT NULL,
  amount_kz numeric(14,2) NOT NULL CHECK (amount_kz >= 0),
  source_type text,
  source_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX hr_payroll_components_item_idx
  ON public.hr_payroll_item_components (payroll_item_id);

-- ---------------------------------------------------------------------------
-- Integridade multi-tenant entre FKs de domínio.
-- Impede referenciar uma pessoa/cargo/contrato de outra escola mesmo que o UUID
-- seja conhecido. Funções de trigger são SECURITY INVOKER.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_assert_same_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school uuid;
BEGIN
  IF TG_TABLE_NAME = 'hr_positions' AND NEW.department_id IS NOT NULL THEN
    SELECT school_id INTO v_school FROM public.hr_departments WHERE id = NEW.department_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school department reference'; END IF;
  ELSIF TG_TABLE_NAME = 'hr_employments' THEN
    SELECT school_id INTO v_school FROM public.people WHERE id = NEW.person_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school person reference'; END IF;
    IF NEW.position_id IS NOT NULL THEN
      SELECT school_id INTO v_school FROM public.hr_positions WHERE id = NEW.position_id;
      IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school position reference'; END IF;
    END IF;
    IF NEW.department_id IS NOT NULL THEN
      SELECT school_id INTO v_school FROM public.hr_departments WHERE id = NEW.department_id;
      IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school department reference'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'hr_contracts' THEN
    SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school employment reference'; END IF;
  ELSIF TG_TABLE_NAME = 'hr_compensation_events' THEN
    SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school employment reference'; END IF;
    IF NEW.contract_id IS NOT NULL THEN
      SELECT school_id INTO v_school FROM public.hr_contracts WHERE id = NEW.contract_id;
      IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school contract reference'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'hr_payroll_items' THEN
    SELECT school_id INTO v_school FROM public.hr_payroll_runs WHERE id = NEW.payroll_run_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school payroll reference'; END IF;
    SELECT school_id INTO v_school FROM public.hr_employments WHERE id = NEW.employment_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school employment reference'; END IF;
  ELSIF TG_TABLE_NAME = 'hr_payroll_item_components' THEN
    SELECT school_id INTO v_school FROM public.hr_payroll_items WHERE id = NEW.payroll_item_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school payroll item reference'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hr_positions_same_school BEFORE INSERT OR UPDATE ON public.hr_positions
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();
CREATE TRIGGER hr_employments_same_school BEFORE INSERT OR UPDATE ON public.hr_employments
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();
CREATE TRIGGER hr_contracts_same_school BEFORE INSERT OR UPDATE ON public.hr_contracts
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();
CREATE TRIGGER hr_compensation_events_same_school BEFORE INSERT OR UPDATE ON public.hr_compensation_events
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();
CREATE TRIGGER hr_payroll_items_same_school BEFORE INSERT OR UPDATE ON public.hr_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();
CREATE TRIGGER hr_payroll_components_same_school BEFORE INSERT OR UPDATE ON public.hr_payroll_item_components
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_same_school();

-- Consistência do departamento-pai.
CREATE OR REPLACE FUNCTION public.hr_assert_department_parent_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_school uuid;
BEGIN
  IF NEW.parent_department_id IS NOT NULL THEN
    IF NEW.parent_department_id = NEW.id THEN RAISE EXCEPTION 'Department cannot be its own parent'; END IF;
    SELECT school_id INTO v_school FROM public.hr_departments WHERE id = NEW.parent_department_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'HR cross-school parent department reference'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER hr_departments_parent_same_school BEFORE INSERT OR UPDATE ON public.hr_departments
  FOR EACH ROW EXECUTE FUNCTION public.hr_assert_department_parent_school();

-- updated_at/version conforme convenção já existente no SIGA.
CREATE TRIGGER hr_departments_set_updated_at BEFORE UPDATE ON public.hr_departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_positions_set_updated_at BEFORE UPDATE ON public.hr_positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_employments_set_updated_at BEFORE UPDATE ON public.hr_employments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_contracts_set_updated_at BEFORE UPDATE ON public.hr_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_compensation_events_set_updated_at BEFORE UPDATE ON public.hr_compensation_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_payroll_runs_set_updated_at BEFORE UPDATE ON public.hr_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER hr_payroll_items_set_updated_at BEFORE UPDATE ON public.hr_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

-- ---------------------------------------------------------------------------
-- RLS: mesma política multi-tenant utilizada pelo módulo Pessoas.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_departments','hr_positions','hr_employments','hr_contracts',
    'hr_compensation_events','hr_payroll_runs','hr_payroll_items',
    'hr_payroll_item_components'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_school_member(school_id))',
      'Read ' || t || ' in own school', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_school_member(school_id) AND created_by = (SELECT auth.uid()))',
      'Create ' || t || ' in own school', t
    );
  END LOOP;
END $$;

-- Tabelas com updated_by suportam UPDATE com isolamento por escola.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_departments','hr_positions','hr_employments','hr_contracts',
    'hr_compensation_events','hr_payroll_runs','hr_payroll_items'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id))',
      'Update ' || t || ' in own school', t
    );
  END LOOP;
END $$;

-- Componentes são imutáveis por UPDATE nesta primeira fase; correções devem ser
-- feitas por recálculo do item enquanto a folha estiver em draft/review.

-- ---------------------------------------------------------------------------
-- Função de cálculo inicial de um item mensal.
-- Soma apenas eventos validados dentro do período da folha e mantém o cálculo
-- auditável em calculation_details. Descontos legais serão acrescentados em
-- migração própria, para não codificar taxas fiscais sem configuração versionada.
-- ---------------------------------------------------------------------------
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
  v_base numeric(14,2) := 0;
  v_hourly numeric(14,2) := 0;
  v_allowances numeric(14,2) := 0;
  v_bonuses numeric(14,2) := 0;
  v_overtime numeric(14,2) := 0;
  v_gross numeric(14,2) := 0;
  v_item public.hr_payroll_items;
BEGIN
  SELECT * INTO v_run FROM public.hr_payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND OR NOT public.is_school_member(v_run.school_id) THEN
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

  IF v_contract.salary_type = 'monthly' THEN
    v_base := v_contract.base_salary_kz;
  END IF;

  SELECT
    COALESCE(sum(amount_kz) FILTER (WHERE event_type IN ('worked_hour','lesson_hour')), 0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'allowance'), 0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'bonus'), 0),
    COALESCE(sum(amount_kz) FILTER (WHERE event_type = 'overtime'), 0)
  INTO v_hourly, v_allowances, v_bonuses, v_overtime
  FROM public.hr_compensation_events
  WHERE school_id = v_run.school_id
    AND employment_id = p_employment_id
    AND event_date BETWEEN v_run.period_start AND v_run.period_end
    AND validation_status = 'validated'
    AND deleted_at IS NULL;

  v_gross := v_base + v_hourly + v_allowances + v_bonuses + v_overtime;

  INSERT INTO public.hr_payroll_items (
    school_id, payroll_run_id, employment_id, contract_id,
    base_amount_kz, hourly_amount_kz, allowances_kz, bonuses_kz, overtime_kz,
    deductions_kz, gross_amount_kz, net_amount_kz, status,
    calculation_details, created_by, updated_by
  ) VALUES (
    v_run.school_id, v_run.id, v_emp.id, v_contract.id,
    v_base, v_hourly, v_allowances, v_bonuses, v_overtime,
    0, v_gross, v_gross, 'calculated',
    jsonb_build_object(
      'salary_type', v_contract.salary_type,
      'contract_id', v_contract.id,
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

REVOKE EXECUTE ON FUNCTION public.hr_calculate_payroll_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_calculate_payroll_item(uuid, uuid) TO authenticated;

COMMENT ON TABLE public.hr_employments IS 'Vínculos laborais sobre a entidade central public.people.';
COMMENT ON TABLE public.hr_contracts IS 'Contratos e regras de remuneração mensal, por hora ou hora/aula.';
COMMENT ON TABLE public.hr_compensation_events IS 'Eventos remuneráveis validados, preparados para integração com presença/horário.';
COMMENT ON TABLE public.hr_payroll_runs IS 'Folhas salariais mensais por escola.';
COMMENT ON FUNCTION public.hr_calculate_payroll_item(uuid, uuid) IS 'Calcula/recalcula um item de folha sem aplicar descontos fiscais não configurados.';
