-- Ciclo 56 hardening: fechar bypass de assurance no QR e restringir RLS sensível de RH.
-- 1) Compensação de aula só fica validated com evidência check_out auto_approve.
-- 2) Folha/contratos: escrita só Admin/Tesouraria (SELECT mantém membros da escola onde faz sentido).

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

    -- Sem evidência (bypass directo da RPC de redeem) ou rejeição → nunca validated.
    IF v_decision IS NULL OR v_decision = 'reject' THEN
      NEW.validation_status := 'pending';
      NEW.validated_at := NULL;
      NEW.validated_by := NULL;
    ELSIF v_decision <> 'auto_approve' THEN
      NEW.validation_status := 'pending';
      NEW.validated_at := NULL;
      NEW.validated_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Restringir INSERT/UPDATE nas tabelas de folha e vínculo (SELECT continua por membro).
DO $$
DECLARE
  t text;
  pol text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_employments','hr_contracts',
    'hr_compensation_events','hr_payroll_runs','hr_payroll_items',
    'hr_payroll_item_components'
  ] LOOP
    FOREACH pol IN ARRAY ARRAY[
      'Create ' || t || ' in own school',
      'Update ' || t || ' in own school'
    ] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
         school_id = (SELECT public.current_school_id())
         AND (SELECT public.current_profile_role()) IN (''Administrador'',''Tesouraria'')
         AND created_by = (SELECT auth.uid())
       )',
      'Create ' || t || ' finance role', t
    );

    IF t <> 'hr_payroll_item_components' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
           school_id = (SELECT public.current_school_id())
           AND (SELECT public.current_profile_role()) IN (''Administrador'',''Tesouraria'')
         ) WITH CHECK (
           school_id = (SELECT public.current_school_id())
           AND (SELECT public.current_profile_role()) IN (''Administrador'',''Tesouraria'')
         )',
        'Update ' || t || ' finance role', t
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
