-- Fase 5 - Tabela de Mailboxes Profissionais
-- Não é uma migração Lovable. Correr via npm run siga:sql

CREATE TABLE IF NOT EXISTS tenant_mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  provider TEXT NOT NULL DEFAULT 'simulated', -- 'zoho' | 'google' | 'simulated'
  provider_account_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'suspended' | 'deleted'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email)
);

-- RLS
ALTER TABLE tenant_mailboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can do everything on mailboxes" 
ON tenant_mailboxes FOR ALL TO authenticated
USING ( 
  EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) 
);

-- Permite leitura pela escola
CREATE POLICY "Tenants can view their own mailboxes" 
ON tenant_mailboxes FOR SELECT TO authenticated
USING ( 
  tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()) 
);
