/**
 * Migrations para Payment Configuration
 *
 * Execute estas migrations no seu banco de dados Supabase
 * para criar as tabelas necessárias para gerenciar pagamentos
 */

-- ========================================================================
-- 1. Configuração de Pagamento por Escola (Multi-tenant)
-- ========================================================================

CREATE TABLE IF NOT EXISTS school_payment_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'appypay'
  market_type VARCHAR(50) NOT NULL, -- 'school_tuition'

  -- AppyPay Credenciais (Encrypted at rest)
  appypay_merchant_id VARCHAR(255) NOT NULL,
  appypay_bearer_token TEXT NOT NULL, -- Encrypted
  appypay_webhook_secret TEXT NOT NULL, -- Encrypted

  -- Aplicações habilitadas (GPO, UMM, REF, eTPA)
  enabled_application_ids UUID[] NOT NULL DEFAULT '{}',
  default_application_id UUID,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Constraints
  UNIQUE(school_id, market_type),
  CHECK (provider = 'appypay'),
  CHECK (market_type IN ('school_tuition', 'school_other_services'))
);

CREATE INDEX idx_school_payment_config_school_id ON school_payment_configurations(school_id);
CREATE INDEX idx_school_payment_config_is_active ON school_payment_configurations(is_active);

-- ========================================================================
-- 2. Configuração Master de SIGA Plus (SaaS)
-- ========================================================================

CREATE TABLE IF NOT EXISTS siga_saas_payment_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL DEFAULT 'appypay',

  -- AppyPay Master Credenciais
  appypay_merchant_id VARCHAR(255) NOT NULL,
  appypay_bearer_token TEXT NOT NULL, -- Encrypted
  appypay_webhook_secret TEXT NOT NULL, -- Encrypted

  -- Aplicações habilitadas
  enabled_application_ids UUID[] NOT NULL DEFAULT '{}',
  default_application_id UUID,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_siga_saas_config_is_active ON siga_saas_payment_config(is_active);

-- ========================================================================
-- 3. Planos SaaS (Essencial, Pro, Enterprise, etc)
-- ========================================================================

CREATE TABLE IF NOT EXISTS siga_saas_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- "Plano Essencial", "Plano Pro"
  description TEXT,

  -- Preço
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'AOA', -- AOA, USD, EUR
  billing_cycle VARCHAR(50) NOT NULL, -- 'monthly', 'quarterly', 'annually'

  -- AppyPay Application para este plano
  payment_application_id UUID NOT NULL,
  payment_provider VARCHAR(50) NOT NULL DEFAULT 'appypay',

  -- Features
  features TEXT[] NOT NULL DEFAULT '{}',
  max_students INTEGER,
  max_staff INTEGER,
  max_modules INTEGER,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_published BOOLEAN DEFAULT false, -- Visível para escolas?

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_siga_saas_plans_is_active ON siga_saas_plans(is_active);
CREATE INDEX idx_siga_saas_plans_is_published ON siga_saas_plans(is_published);
CREATE INDEX idx_siga_saas_plans_billing_cycle ON siga_saas_plans(billing_cycle);

-- ========================================================================
-- 4. Subscrição de Escola a Plano SaaS
-- ========================================================================

CREATE TABLE IF NOT EXISTS school_plan_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES siga_saas_plans(id) ON DELETE RESTRICT,

  -- Período
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Pagamento
  status VARCHAR(50) NOT NULL, -- 'pending_payment', 'active', 'suspended', 'expired', 'cancelled'
  last_payment_date TIMESTAMP WITH TIME ZONE,
  next_billing_date DATE NOT NULL,

  -- Transação
  last_transaction_id VARCHAR(255),
  failure_reason TEXT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Constraints
  UNIQUE(school_id, plan_id),
  CHECK (status IN ('pending_payment', 'active', 'suspended', 'expired', 'cancelled')),
  CHECK (start_date < end_date),
  CHECK (start_date <= next_billing_date)
);

CREATE INDEX idx_school_subscriptions_school_id ON school_plan_subscriptions(school_id);
CREATE INDEX idx_school_subscriptions_status ON school_plan_subscriptions(status);
CREATE INDEX idx_school_subscriptions_next_billing ON school_plan_subscriptions(next_billing_date);

-- ========================================================================
-- 5. Log de Eventos de Pagamento (Auditoria)
-- ========================================================================

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL,
  market_type VARCHAR(50) NOT NULL, -- 'school_tuition', 'siga_plus_plans'

  -- Evento
  type VARCHAR(50) NOT NULL, -- 'payment.received', 'payment.failed', 'payment.pending'
  provider VARCHAR(50) NOT NULL, -- 'appypay'
  status VARCHAR(50) NOT NULL, -- 'succeeded', 'failed', 'pending'

  -- Detalhes do Pagamento
  amount DECIMAL(10, 2),
  currency VARCHAR(3),
  payment_method VARCHAR(50), -- 'GPO', 'UMM', 'REF', 'eTPA'
  external_transaction_id VARCHAR(255) NOT NULL,
  reference VARCHAR(255), -- Para rastrear subscrição ou mensalidade

  -- Detalhes do Pagador
  payer_email VARCHAR(255),
  payer_phone VARCHAR(50),
  payer_name VARCHAR(255),

  -- Falha
  failure_reason TEXT,

  -- Metadata
  metadata JSONB,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Constraints
  UNIQUE(id),
  CHECK (type IN ('payment.received', 'payment.failed', 'payment.pending', 'payment.refunded')),
  CHECK (status IN ('succeeded', 'failed', 'pending'))
);

CREATE INDEX idx_payment_events_school_id ON payment_events(school_id);
CREATE INDEX idx_payment_events_status ON payment_events(status);
CREATE INDEX idx_payment_events_external_txn ON payment_events(external_transaction_id);
CREATE INDEX idx_payment_events_reference ON payment_events(reference);
CREATE INDEX idx_payment_events_created_at ON payment_events(created_at DESC);

-- ========================================================================
-- 6. Enable UUID Extension
-- ========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================================================
-- 7. RLS Policies (Row Level Security)
-- ========================================================================

-- Escola só vê sua própria configuração
ALTER TABLE school_payment_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Escola acessa própria config"
  ON school_payment_configurations
  FOR SELECT
  USING (auth.uid() IN (
    SELECT auth_id FROM school_staff
    WHERE school_id = school_payment_configurations.school_id
    AND role = 'admin'
  ));

-- Staff vê eventos de pagamento da sua escola
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff vê pagamentos da própria escola"
  ON payment_events
  FOR SELECT
  USING (school_id IN (
    SELECT school_id FROM school_staff
    WHERE auth_id = auth.uid()
  ));

-- ========================================================================
-- 8. Views Úteis
-- ========================================================================

-- View: Estatísticas de Pagamento por Escola
CREATE OR REPLACE VIEW v_school_payment_stats AS
SELECT
  s.id AS school_id,
  s.name AS school_name,
  COUNT(pe.id) AS total_payments,
  SUM(CASE WHEN pe.status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded_count,
  SUM(CASE WHEN pe.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
  SUM(CASE WHEN pe.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
  SUM(CASE WHEN pe.status = 'succeeded' THEN pe.amount ELSE 0 END) AS total_amount,
  MAX(pe.created_at) AS last_payment_date
FROM schools s
LEFT JOIN payment_events pe ON s.id = pe.school_id
GROUP BY s.id, s.name;

-- View: Subscrições Ativas
CREATE OR REPLACE VIEW v_active_subscriptions AS
SELECT
  sps.id,
  sps.school_id,
  s.name AS school_name,
  sps.plan_id,
  ssp.name AS plan_name,
  ssp.amount AS monthly_amount,
  sps.status,
  sps.next_billing_date,
  sps.created_at
FROM school_plan_subscriptions sps
JOIN schools s ON sps.school_id = s.id
JOIN siga_saas_plans ssp ON sps.plan_id = ssp.id
WHERE sps.status IN ('active', 'pending_payment');

-- ========================================================================
-- 9. Triggers para Atualizar updated_at
-- ========================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_school_payment_config_updated
BEFORE UPDATE ON school_payment_configurations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tr_siga_saas_config_updated
BEFORE UPDATE ON siga_saas_payment_config
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tr_siga_saas_plans_updated
BEFORE UPDATE ON siga_saas_plans
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tr_school_subscriptions_updated
BEFORE UPDATE ON school_plan_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ========================================================================
-- 10. Dados de Exemplo (Comentado)
-- ========================================================================

/*
-- Inserir planos de exemplo
INSERT INTO siga_saas_plans (name, description, amount, billing_cycle, payment_application_id, features, max_students, is_published)
VALUES
  ('Plano Essencial', 'Para pequenas escolas', 25000.00, 'monthly', 'app-uuid-1', ARRAY['email', 'sms'], 100, true),
  ('Plano Pro', 'Para escolas médias', 50000.00, 'monthly', 'app-uuid-1', ARRAY['email', 'sms', 'whatsapp', 'reportes'], 500, true),
  ('Plano Enterprise', 'Para grandes escolas', 100000.00, 'monthly', 'app-uuid-1', ARRAY['email', 'sms', 'whatsapp', 'api', 'suporte_premium'], NULL, true);

-- Inserir configuração master SaaS
INSERT INTO siga_saas_payment_config (appypay_merchant_id, appypay_bearer_token, appypay_webhook_secret, enabled_application_ids)
VALUES
  ('siga-plus-master', 'sk_live_xxxxx', 'whsec_xxxxx', ARRAY['app-uuid-1', 'app-uuid-2']);
*/

-- ========================================================================
-- Done!
-- ========================================================================
-- Todas as tabelas, índices, e políticas foram criadas com sucesso!
