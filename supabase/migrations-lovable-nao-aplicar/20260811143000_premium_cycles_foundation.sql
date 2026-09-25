-- Ciclos 3–6: WhatsApp da turma, grants por professor, feed ICS,
-- prestações, catálogo de integrações. Additive sobre o schema SGA.
-- current_school_id() no SGA lê school_memberships (APPLY_ENROLLMENT_AND_PREMIUM.sql).

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id
  FROM public.school_memberships
  WHERE user_id = (SELECT auth.uid())
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_school_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;

ALTER TABLE public.class_groups
  ADD COLUMN IF NOT EXISTS whatsapp_invite_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_group_name text;

CREATE TABLE IF NOT EXISTS public.staff_module_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  level text NOT NULL CHECK (level IN ('Nenhum', 'Leitura', 'Escrita', 'Total')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (school_id, user_id, module_key)
);

CREATE INDEX IF NOT EXISTS staff_module_grants_user_idx
  ON public.staff_module_grants (school_id, user_id);

ALTER TABLE public.staff_module_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_module_grants FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_module_grants TO authenticated;
GRANT ALL ON public.staff_module_grants TO service_role;

CREATE POLICY "Read own or admin staff grants"
  ON public.staff_module_grants
  FOR SELECT TO authenticated
  USING (school_id = (SELECT public.current_school_id()));

CREATE POLICY "Admins manage staff grants"
  ON public.staff_module_grants
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, user_id)
);

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.calendar_feed_tokens TO authenticated;
GRANT ALL ON public.calendar_feed_tokens TO service_role;

CREATE POLICY "Read own calendar feed token"
  ON public.calendar_feed_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.school_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (
    status IN ('disconnected', 'configured', 'connected', 'error')
  ),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (school_id, provider)
);

ALTER TABLE public.school_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_integrations FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.school_integrations TO authenticated;
GRANT ALL ON public.school_integrations TO service_role;

CREATE POLICY "Manage school integrations in own school"
  ON public.school_integrations
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

CREATE TABLE IF NOT EXISTS public.finance_payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id uuid,
  student_id uuid,
  channel text NOT NULL DEFAULT 'cash' CHECK (
    channel IN (
      'cash',
      'multicaixa',
      'transfer',
      'express',
      'multicaixa_express',
      'unitel_money'
    )
  ),
  installments integer NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 24),
  reference text,
  status text NOT NULL DEFAULT 'pending_gateway' CHECK (
    status IN ('pending_gateway', 'scheduled', 'settled', 'cancelled')
  ),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.finance_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_plans FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.finance_payment_plans TO authenticated;
GRANT ALL ON public.finance_payment_plans TO service_role;

CREATE POLICY "Manage payment plans in own school"
  ON public.finance_payment_plans
  FOR ALL TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));
