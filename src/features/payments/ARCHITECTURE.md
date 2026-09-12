# AppyPay Payment Integration Architecture

Arquitetura profissional de integração com AppyPay Payment Gateway, suportando multi-tenant e SaaS.

## 🎯 Objetivos

- ✓ Cada escola tem sua própria configuração AppyPay independente
- ✓ SIGA Plus (SaaS) recebe pagamentos de planos via AppyPay
- ✓ Webhooks roteiam automaticamente para escola ou SaaS baseado no `merchantId`
- ✓ Agnóstico de provider (trocar AppyPay por Stripe, PayPal, etc no futuro)
- ✓ Notificações multicanal (email, SMS, WhatsApp) para pagamentos
- ✓ Integração com SIGA Communication Layer

## 📊 Arquitetura Geral

```
┌─────────────────────────────────────────────────────────┐
│                     AppyPay API                          │
│  (GPO, UMM, REF, eTPA - Métodos de pagamento angolanos) │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ Webhook POST
                         ↓
┌─────────────────────────────────────────────────────────┐
│   /api/webhooks/appypay-payment (Endpoint Único)        │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ Detecta merchantId
                         ↓
        ┌────────────────┴────────────────┐
        │                                 │
        ↓ (Escola)                        ↓ (Master)
┌──────────────────────┐      ┌──────────────────────┐
│  School Tuition      │      │  SIGA Plus SaaS      │
│  Payment Handler     │      │  Plan Handler        │
└──────────────────────┘      └──────────────────────┘
        │                              │
        │ Valida signature             │ Valida signature
        │ Parse payload                │ Parse payload
        │ Log evento                   │ Log evento
        ↓                              ↓
┌──────────────────────┐      ┌──────────────────────┐
│  Notificar Aluno:    │      │  Atualizar Sub:      │
│  - Email             │      │  - Active            │
│  - SMS               │      │  - Suspended         │
│  - WhatsApp          │      │  - Expired           │
└──────────────────────┘      └──────────────────────┘
```

## 🏛️ Estrutura de Dados

### 1. School Payment Configuration (Multi-tenant)

Cada escola tem sua própria configuração AppyPay:

```sql
CREATE TABLE school_payment_configurations (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL,
  provider VARCHAR NOT NULL, -- 'appypay'
  market_type VARCHAR NOT NULL, -- 'school_tuition'
  appypay_merchant_id VARCHAR NOT NULL,
  appypay_bearer_token VARCHAR NOT NULL,  -- Encrypted
  appypay_webhook_secret VARCHAR NOT NULL, -- Encrypted
  enabled_application_ids UUID[] NOT NULL, -- [app-gpo, app-umm, ...]
  default_application_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(school_id, market_type)
);
```

### 2. SIGA SaaS Payment Config (Master)

Configuração centralizada para SIGA Plus:

```sql
CREATE TABLE siga_saas_payment_config (
  id UUID PRIMARY KEY,
  provider VARCHAR NOT NULL, -- 'appypay'
  appypay_merchant_id VARCHAR NOT NULL,
  appypay_bearer_token VARCHAR NOT NULL,  -- Encrypted
  appypay_webhook_secret VARCHAR NOT NULL, -- Encrypted
  enabled_application_ids UUID[] NOT NULL,
  default_application_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 3. SIGA SaaS Plans

Planos disponíveis com preços:

```sql
CREATE TABLE siga_saas_plans (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,           -- "Plano Essencial", "Plano Pro", etc
  description TEXT,
  amount DECIMAL(10, 2) NOT NULL,  -- 5000.00 AOA
  currency VARCHAR DEFAULT 'AOA',  -- AOA, USD, EUR
  billing_cycle VARCHAR NOT NULL,  -- 'monthly', 'quarterly', 'annually'
  payment_application_id UUID NOT NULL, -- Qual aplicação usar no AppyPay
  payment_provider VARCHAR DEFAULT 'appypay',
  features TEXT[],                 -- ["feature1", "feature2", ...]
  max_students INTEGER,            -- Limit de alunos
  max_staff INTEGER,               -- Limit de staff
  max_modules INTEGER,             -- Limit de módulos/courses
  is_active BOOLEAN DEFAULT true,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 4. School Plan Subscription

Subscrição de uma escola a um plano SaaS:

```sql
CREATE TABLE school_plan_subscriptions (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  status VARCHAR NOT NULL, -- 'pending_payment', 'active', 'suspended', 'expired'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  next_billing_date DATE NOT NULL,
  last_payment_date TIMESTAMP,
  last_transaction_id VARCHAR,
  failure_reason TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(school_id, plan_id)
);
```

### 5. Payment Events Log

Log audit de todos os eventos de pagamento:

```sql
CREATE TABLE payment_events (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL,
  market_type VARCHAR NOT NULL, -- 'school_tuition' ou 'siga_plus_plans'
  type VARCHAR NOT NULL,        -- 'payment.received', 'payment.failed', etc
  provider VARCHAR NOT NULL,    -- 'appypay'
  status VARCHAR NOT NULL,      -- 'succeeded', 'failed', 'pending'
  amount DECIMAL(10, 2),
  currency VARCHAR,
  payment_method VARCHAR,       -- 'GPO', 'UMM', 'REF', 'eTPA'
  external_transaction_id VARCHAR NOT NULL,
  payer_email VARCHAR,
  payer_phone VARCHAR,
  payer_name VARCHAR,
  reference VARCHAR,
  failure_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP
);
```

## 🔄 Fluxos

### Fluxo 1: Aluno Pagando Mensalidade (Escola)

```
1. Aluno acessa portal da escola
2. Clica "Pagar Mensalidade"
3. É redirecionado ao AppyPay
4. Escolhe método (GPO, UMM, REF, eTPA)
5. Paga com sucesso

6. AppyPay envia webhook:
   POST /api/webhooks/appypay-payment
   {
     "id": "evt-123",
     "merchantId": "escola-123-merchant",
     "applicationId": "app-gpo",
     "amount": 5000.00,
     "status": "succeeded",
     "payerEmail": "aluno@example.com",
     "payerPhone": "+244912345678"
   }

7. Sistema detecta merchant = escola 123
8. Valida assinatura com webhook_secret da escola
9. Cria PaymentEvent no log
10. Chama SIGA Communication Service
11. Envia notificação:
    - Email: "Pagamento confirmado de 5,000 AOA"
    - SMS: "Mensalidade recebida. Obrigado!"
    - WhatsApp: Comprovante em PDF
```

### Fluxo 2: Escola Contratando Plano SaaS

```
1. Escola acessa siga-plus.com/plans
2. Vê planos disponíveis (Essencial, Pro, Enterprise)
3. Clica "Assinar Plano Pro"
4. Cria subscrição com status: pending_payment
5. É redirecionado ao AppyPay

6. Paga com sucesso
7. AppyPay envia webhook:
   POST /api/webhooks/appypay-payment
   {
     "id": "evt-456",
     "merchantId": "siga-plus-master",
     "applicationId": "app-umm",
     "amount": 50000.00,  -- 50,000 AOA por mês
     "status": "succeeded",
     "reference": "subscription-xyz", -- ID da subscrição
     "payerEmail": "admin@escola.com"
   }

8. Sistema detecta merchant = master
9. Busca subscrição por reference ID
10. Atualiza status para: active
11. Cria PaymentEvent no log
12. Ativa features do plano para escola
13. Envia notificação ao admin:
    - Email: "Plano ativado com sucesso"
    - SMS: "Seu acesso SIGA Pro está ativo"
```

### Fluxo 3: Pagamento Falha

```
1. Aluno tenta pagar
2. Cartão recusado ou outro erro
3. AppyPay envia webhook com status: failed

4. Sistema processa:
   - Detecta escola correta
   - Valida signature
   - Parse evento com failureReason: "Insufficient funds"
   - Cria PaymentEvent com status: failed

5. Para subscrição SaaS:
   - Atualiza status para: suspended
   - Desativa features da escola
   - Envia notificação: "Pagamento recusado. Tente novamente."
```

## 🔐 Segurança

### Validação de Webhook

1. **Assinatura HMAC-SHA256**
   - AppyPay assina cada webhook com webhook_secret
   - Sistema valida signature antes de processar
   - Rejeita se inválido (401 Unauthorized)

2. **Isolamento por merchantId**
   - Cada evento tem merchantId da origem
   - Sistema roteia para escola certa
   - Previne cross-tenant data leaks

3. **Credenciais Criptografadas**
   - Bearer tokens armazenados encrypted
   - Webhook secrets nunca em logs
   - Acesso controlado por RBAC

### Retry Strategy

- **4xx errors** (401, 400): Não retenta (erro permanente)
- **5xx errors**: AppyPay retenta com exponential backoff
- **202 Accepted**: Recebemos; AppyPay pode retentar se houver erro

## 📁 Estrutura de Arquivos

```
src/features/payments/
├── payment-provider.interface.ts     # Interface abstrata
├── appypay-adapter.ts                # Implementação AppyPay
├── appypay-adapter.test.ts           # Testes
├── payment-configuration.ts          # Resolvers de config
├── payment-webhook-manager.ts        # Manager multi-tenant
└── ARCHITECTURE.md                   # Este arquivo

src/features/integrations/
├── appypay-client.ts                 # Cliente AppyPay

src/routes/api/webhooks/
├── appypay-payment.ts                # Endpoint webhook
└── APPYPAY_SETUP.md                  # Setup guide
```

## 🚀 Próximos Passos

1. **Integração com Communication Service**
   ```typescript
   // Em payment-webhook-manager.ts
   await communicationService.send({
     to: event.payerEmail || event.payerPhone,
     templateKey: 'PAYMENT_RECEIVED',
     channels: ['email', 'sms', 'whatsapp'],
     variables: {
       amount: event.amount,
       reference: event.reference,
       planName: plan?.name
     }
   })
   ```

2. **Templates de Notificação**
   - PAYMENT_RECEIVED
   - PAYMENT_FAILED
   - SUBSCRIPTION_ACTIVATED
   - SUBSCRIPTION_SUSPENDED
   - PLAN_EXPIRING_SOON

3. **Dashboard Finance**
   - Listar aplicações AppyPay
   - Cache e sync automático
   - Estatísticas de pagamentos
   - Histórico por escola

4. **Admin Panel**
   - Criar/editar payment configs por escola
   - Criar/editar planos SaaS
   - Gerenciar subscrições
   - Refunds

5. **Relatórios**
   - Revenue por método de pagamento
   - Taxa de conversão de planos
   - Churn de subscrições
   - Top métodos de pagamento por região

## 📞 Troubleshoot

### Webhook não chega
1. Verificar URL registrada no AppyPay dashboard
2. Verificar firewall/SSL
3. Check logs: `grep "AppyPay Webhook" logs/`

### Assinatura inválida
1. Verificar webhook_secret está correto
2. Validar payload não foi modificado
3. Check header: `X-AppyPay-Signature`

### Evento não processa
1. Verificar merchant_id existe em banco de dados
2. Check se payment config está `is_active = true`
3. Validar schema do payload (Zod errors no log)

### Notificação não envia
1. Verificar Communication Service está ativo
2. Check email/SMS/WhatsApp adapters
3. Verificar templates existem e estão ativas
