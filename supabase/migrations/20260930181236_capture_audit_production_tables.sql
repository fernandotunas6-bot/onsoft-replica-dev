-- Captured from production catalog on 2026-09-30; no inferred columns.
-- Preserve server-only access; no data changes or browser grants.
CREATE TABLE IF NOT EXISTS public.saas_billing_settings (
  id smallint DEFAULT 1 NOT NULL,
  charging_enabled boolean DEFAULT true NOT NULL,
  trial_days smallint DEFAULT 14 NOT NULL,
  periods jsonb DEFAULT '[]'::jsonb NOT NULL,
  notice text,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT saas_billing_settings_periods_array CHECK ((jsonb_typeof(periods) = 'array'::text)),
  CONSTRAINT saas_billing_settings_pkey PRIMARY KEY (id),
  CONSTRAINT saas_billing_settings_singleton CHECK ((id = 1)),
  CONSTRAINT saas_billing_settings_trial_days_check CHECK (((trial_days >= 0) AND (trial_days <= 90)))
);
ALTER TABLE public.saas_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_billing_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_billing_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.saas_billing_settings TO service_role;
CREATE TABLE IF NOT EXISTS public.saas_signup_leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  session_id uuid NOT NULL,
  last_step smallint DEFAULT 1 NOT NULL,
  plan_code text,
  school_name text,
  email text,
  contact_name text,
  contact_phone text,
  email_verified_at timestamp with time zone,
  completed_at timestamp with time zone,
  tenant_id uuid,
  reminder_count smallint DEFAULT 0 NOT NULL,
  last_reminder_at timestamp with time zone,
  unsubscribed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT saas_signup_leads_email_check CHECK (((email IS NULL) OR (email = lower(btrim(email))))),
  CONSTRAINT saas_signup_leads_pkey PRIMARY KEY (id),
  CONSTRAINT saas_signup_leads_session_key UNIQUE (session_id),
  CONSTRAINT saas_signup_leads_step_check CHECK (((last_step >= 1) AND (last_step <= 10)))
);
ALTER TABLE public.saas_signup_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_signup_leads FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_signup_leads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.saas_signup_leads TO service_role;
CREATE INDEX IF NOT EXISTS saas_signup_leads_followup_idx ON public.saas_signup_leads USING btree (updated_at) WHERE ((completed_at IS NULL) AND (email_verified_at IS NOT NULL) AND (unsubscribed_at IS NULL));
CREATE INDEX IF NOT EXISTS saas_signup_leads_email_idx ON public.saas_signup_leads USING btree (email) WHERE (email IS NOT NULL);
CREATE INDEX IF NOT EXISTS saas_signup_leads_tenant_idx ON public.saas_signup_leads USING btree (tenant_id) WHERE (tenant_id IS NOT NULL);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='saas_signup_leads_tenant_id_fkey' AND conrelid='public.saas_signup_leads'::regclass) THEN ALTER TABLE public.saas_signup_leads ADD CONSTRAINT saas_signup_leads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL; END IF; END $$;
