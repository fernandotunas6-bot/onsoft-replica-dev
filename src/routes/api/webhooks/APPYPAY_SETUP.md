# AppyPay Payment Gateway Integration

Integração profissional com AppyPay Payment Gateway via webhook. Suporta notificações de pagamento multicanal (email, SMS, WhatsApp).

## 🔧 Configuração

### 1. Variáveis de Ambiente

Adicione ao `.env.local`:

```bash
# AppyPay API Configuration
APPYPAY_BASE_URL=https://gwy-api-tst.appypay.co.ao
APPYPAY_API_VERSION=v1
APPYPAY_BEARER_TOKEN=seu_bearer_token_aqui
APPYPAY_WEBHOOK_SECRET=seu_webhook_secret_aqui
```

### 2. Registrar Webhook no AppyPay

1. Acesse o painel AppyPay
2. Vá para Webhooks → Criar Novo
3. Configure:
   - **URL**: `https://seu-dominio.com/api/webhooks/appypay-payment`
   - **Eventos**: `payment.succeeded`, `payment.failed`
   - **Secret**: Use o mesmo value de `APPYPAY_WEBHOOK_SECRET`

### 3. Testar Webhook

```bash
curl -X POST http://localhost:3000/api/webhooks/appypay-payment \
  -H "Content-Type: application/json" \
  -H "X-AppyPay-Signature: seu_signature_aqui" \
  -d '{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "merchantId": "merchant-123",
    "applicationId": "app-gpo-123",
    "transactionId": "txn-12345",
    "amount": 500.00,
    "currency": "AOA",
    "status": "succeeded",
    "paymentMethod": "GPO",
    "payerEmail": "user@example.com",
    "payerPhone": "+244912345678",
    "payerName": "João Silva",
    "reference": "REF-2024-001",
    "timestamp": "2026-09-12T10:30:00Z"
  }'
```

## 📊 Arquitetura

```
AppyPay Webhook
      ↓
/api/webhooks/appypay-payment
      ↓
AppyPayAdapter.processPaymentEvent()
      ↓
SIGA Communication Service
      ↓
SMS/Email/WhatsApp Notifications
```

## 🔄 Fluxo de Pagamento

1. **Pagamento Recebido no AppyPay**
   - Cliente paga via GPO/UMM/REF/eTPA
   - AppyPay processa a transação

2. **Webhook Enviado**
   - AppyPay envia POST para `/api/webhooks/appypay-payment`
   - Headers incluem `X-AppyPay-Signature`

3. **Validação**
   - Sistema valida assinatura HMAC-SHA256
   - Valida schema do payload

4. **Processamento**
   - AppyPayAdapter.processPaymentEvent() é chamado
   - Prepara dados para Communication Service

5. **Notificação**
   - Communication Service envia notificação
   - Suporta email, SMS, WhatsApp
   - Log em `communication_dispatches`

## 📝 Tipos de Eventos

| Status | Tipo | Descrição |
|--------|------|-----------|
| `succeeded` | `payment.received` | Pagamento recebido com sucesso |
| `failed` | `payment.failed` | Pagamento falhou |
| `pending` | `payment.pending` | Pagamento aguardando confirmação |

## 🔐 Segurança

- ✓ Assinatura HMAC-SHA256 validada
- ✓ Env vars protegidas (nunca expõe token)
- ✓ Payload validado com Zod schema
- ✓ Retry automático (exponential backoff)
- ✓ Logging seguro (sem expor dados sensíveis)

## 🎯 Próximos Passos

1. **Integração com Communication Service**
   ```typescript
   // Em AppyPayAdapter.processPaymentEvent()
   await communicationService.send({
     to: event.payerEmail || event.payerPhone,
     templateKey: 'PAYMENT_RECEIVED',
     channels: ['email', 'sms', 'whatsapp'],
     variables: {
       amount: event.amount,
       currency: event.currency,
       reference: event.reference
     }
   })
   ```

2. **Templates de Notificação**
   - `PAYMENT_RECEIVED` — Confirmação de pagamento
   - `PAYMENT_FAILED` — Falha na transação
   - `PAYMENT_RECEIPT` — Recibo detalhado

3. **Finance Dashboard**
   - Listar aplicações (métodos) disponíveis
   - Cache de aplicações
   - Filtros por status/tipo/data

## ⚠️ Tratamento de Erros

| Código | Significado | Ação |
|--------|-------------|------|
| `401` | Assinatura inválida | AppyPay rejeita; nunca retenta |
| `400` | Payload inválido | Log de erro; verificar integração |
| `202` | Recebido, falha ao processar | AppyPay pode retentara depois |
| `500` | Erro no servidor | Log; AppyPay retentará depois |

## 📞 Suporte

Para troubleshoot:
1. Verificar logs: `grep "AppyPay Webhook" logs/`
2. Validar assinatura: `openssl dgst -sha256 -hmac "secret" payload.json`
3. Checar env vars: `echo $APPYPAY_WEBHOOK_SECRET`
