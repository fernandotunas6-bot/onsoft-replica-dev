-- Cobrança SaaS por escola (ADMIN → Escolas → escola → Cobrança / Escola pública).
--
-- Uma linha por tenant com o modelo de cobrança (tabela do plano, por aluno ou
-- valor fixo), periodicidade, desconto, vencimento, prazos, métodos de
-- pagamento, contacto de facturação, a pausa das cobranças e a revisão de escola
-- pública (isenta de plano depois de aprovada).
--
-- O efeito no acesso não depende desta tabela: o servidor mantém
-- `tenants.billing_exempt` (já na produção desde 20260930173814) igual a «não
-- cobrar» (pausa em vigor ou escola pública aprovada), e é essa coluna que o
-- SIGA lê para não bloquear a escola por trial ou pagamento.
--
-- Só o servidor (chave de serviço, com platform_admins + aal2) lê e grava:
-- dados de facturação e decisões comerciais não são para o browser.
-- Idempotente: pode correr mais do que uma vez.

CREATE TABLE IF NOT EXISTS public.tenant_billing_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Natureza da instituição para efeitos de cobrança.
  institution_type text NOT NULL DEFAULT 'private',

  -- Como se calcula o valor: tabela do plano, por aluno activo ou valor fixo negociado.
  pricing_model text NOT NULL DEFAULT 'plan',
  price_per_student_aoa numeric(14, 2),
  min_billable_students integer NOT NULL DEFAULT 0,
  fixed_amount_aoa numeric(14, 2),
  billing_period text NOT NULL DEFAULT 'monthly',
  discount_pct numeric(5, 2) NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'AOA',

  -- Prazos.
  due_day smallint NOT NULL DEFAULT 10,
  payment_terms_days smallint NOT NULL DEFAULT 15,
  grace_days smallint NOT NULL DEFAULT 7,
  auto_suspend boolean NOT NULL DEFAULT true,

  -- Modos de pagamento aceites e envio da factura.
  payment_methods text[] NOT NULL DEFAULT ARRAY['bank_transfer']::text[],
  invoice_by_email boolean NOT NULL DEFAULT true,

  -- Contacto e dados de facturação.
  billing_contact_name text,
  billing_email text,
  billing_phone text,
  billing_nif text,
  billing_address text,

  -- Pausa das cobranças (qualquer escola; automática enquanto uma escola pública é revista).
  billing_paused boolean NOT NULL DEFAULT false,
  billing_paused_reason text,
  billing_paused_until date,
  billing_paused_at timestamptz,
  billing_paused_by uuid,

  -- Revisão de escola pública.
  public_review_status text NOT NULL DEFAULT 'not_applicable',
  public_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_official_code text,
  public_supervising_body text,
  public_reviewed_by uuid,
  public_reviewed_at timestamptz,
  public_review_notes text,

  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_billing_profiles_institution_type_check
    CHECK (institution_type IN ('private', 'public', 'public_private', 'community')),
  CONSTRAINT tenant_billing_profiles_pricing_model_check
    CHECK (pricing_model IN ('plan', 'per_student', 'fixed')),
  CONSTRAINT tenant_billing_profiles_per_student_price_check
    CHECK (pricing_model <> 'per_student' OR coalesce(price_per_student_aoa, 0) > 0),
  CONSTRAINT tenant_billing_profiles_fixed_amount_check
    CHECK (pricing_model <> 'fixed' OR coalesce(fixed_amount_aoa, 0) > 0),
  CONSTRAINT tenant_billing_profiles_amounts_check
    CHECK (coalesce(price_per_student_aoa, 0) >= 0 AND coalesce(fixed_amount_aoa, 0) >= 0
           AND min_billable_students >= 0),
  CONSTRAINT tenant_billing_profiles_period_check
    CHECK (billing_period IN ('monthly', 'quarterly', 'semiannual', 'yearly')),
  CONSTRAINT tenant_billing_profiles_discount_check
    CHECK (discount_pct >= 0 AND discount_pct <= 100),
  CONSTRAINT tenant_billing_profiles_currency_check CHECK (currency_code = 'AOA'),
  CONSTRAINT tenant_billing_profiles_due_day_check CHECK (due_day BETWEEN 1 AND 28),
  CONSTRAINT tenant_billing_profiles_terms_check CHECK (payment_terms_days BETWEEN 0 AND 90),
  CONSTRAINT tenant_billing_profiles_grace_check CHECK (grace_days BETWEEN 0 AND 60),
  CONSTRAINT tenant_billing_profiles_methods_check
    CHECK (cardinality(payment_methods) >= 1
           AND payment_methods <@ ARRAY['bank_transfer', 'multicaixa_express',
                                        'multicaixa_reference', 'cash', 'payflow']::text[]),
  CONSTRAINT tenant_billing_profiles_paused_reason_check
    CHECK (NOT billing_paused OR length(btrim(coalesce(billing_paused_reason, ''))) >= 3),
  CONSTRAINT tenant_billing_profiles_review_status_check
    CHECK (public_review_status IN ('not_applicable', 'pending', 'approved', 'rejected')),
  -- Só uma escola pública pode ser aprovada como tal.
  CONSTRAINT tenant_billing_profiles_review_public_check
    CHECK (public_review_status IN ('not_applicable', 'rejected') OR institution_type = 'public'),
  CONSTRAINT tenant_billing_profiles_requirements_object_check
    CHECK (jsonb_typeof(public_requirements) = 'object')
);

DROP TRIGGER IF EXISTS tenant_billing_profiles_touch_updated_at ON public.tenant_billing_profiles;
CREATE TRIGGER tenant_billing_profiles_touch_updated_at
  BEFORE UPDATE ON public.tenant_billing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

ALTER TABLE public.tenant_billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_billing_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_billing_profiles FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tenant_billing_profiles TO service_role;
