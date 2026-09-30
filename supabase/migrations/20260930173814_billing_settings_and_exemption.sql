-- Captured verbatim from applied Supabase migration; already active in production.
CREATE TABLE IF NOT EXISTS public.saas_billing_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  charging_enabled boolean NOT NULL DEFAULT true,
  trial_days smallint NOT NULL DEFAULT 14,
  periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  notice text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_billing_settings_singleton CHECK (id = 1),
  CONSTRAINT saas_billing_settings_trial_days_check CHECK (trial_days BETWEEN 0 AND 90),
  CONSTRAINT saas_billing_settings_periods_array CHECK (jsonb_typeof(periods) = 'array')
);

DROP TRIGGER IF EXISTS saas_billing_settings_touch_updated_at ON public.saas_billing_settings;
CREATE TRIGGER saas_billing_settings_touch_updated_at
  BEFORE UPDATE ON public.saas_billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.saas_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_billing_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_billing_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.saas_billing_settings TO service_role;

INSERT INTO public.saas_billing_settings (id, charging_enabled, trial_days, periods)
VALUES (
  1,
  true,
  14,
  '[
    {"code": "monthly", "enabled": true, "discount_pct": 0},
    {"code": "quarterly", "enabled": true, "discount_pct": 5},
    {"code": "semiannual", "enabled": true, "discount_pct": 10},
    {"code": "yearly", "enabled": true, "discount_pct": 16.67}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS billing_exempt_reason text;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_period text;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_period_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_period_check
  CHECK (billing_period IS NULL OR billing_period IN ('monthly', 'quarterly', 'semiannual', 'yearly'));
