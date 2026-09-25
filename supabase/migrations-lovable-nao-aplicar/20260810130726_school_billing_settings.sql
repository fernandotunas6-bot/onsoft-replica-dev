CREATE TABLE public.school_billing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  due_day smallint NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28),
  late_fee_percent numeric(5,2) NOT NULL DEFAULT 2 CHECK (late_fee_percent BETWEEN 0 AND 100),
  grace_days smallint NOT NULL DEFAULT 5 CHECK (grace_days BETWEEN 0 AND 60),
  sibling_discount_percent numeric(5,2) NOT NULL DEFAULT 10
    CHECK (sibling_discount_percent BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1
);

INSERT INTO public.school_billing_settings (school_id)
SELECT id FROM public.schools
ON CONFLICT (school_id) DO NOTHING;

CREATE TRIGGER school_billing_settings_set_updated_at
  BEFORE UPDATE ON public.school_billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

CREATE TRIGGER school_billing_settings_audit
  AFTER UPDATE ON public.school_billing_settings
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();

GRANT SELECT ON public.school_billing_settings TO authenticated;
GRANT UPDATE (due_day, late_fee_percent, grace_days, sibling_discount_percent)
  ON public.school_billing_settings TO authenticated;
GRANT ALL ON public.school_billing_settings TO service_role;
ALTER TABLE public.school_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_billing_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY "Finance roles can read billing settings"
  ON public.school_billing_settings FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

CREATE POLICY "Finance roles can update billing settings"
  ON public.school_billing_settings FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  )
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.current_profile_role()) IN ('Administrador', 'Tesouraria')
  );

COMMENT ON TABLE public.school_billing_settings IS
  'Reusable, versioned billing rules. Exactly one server-created row per school.';
