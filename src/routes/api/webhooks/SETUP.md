# Webhook Setup — Twilio & Meta WhatsApp

Guia para configurar webhooks de status de entrega.

## 1. Twilio SMS Webhooks

### Setup em Twilio Console

1. Ir a: **Messaging** → **Services** → Seu serviço SMS
2. **Sender Configuration** → escolher seu número
3. **Set Event Callbacks** → ativar
4. **Request URL**: `https://seu-dominio.com/api/webhooks/twilio-sms`
5. Ativar eventos:
   - ✅ Message Sent
   - ✅ Message Delivered
   - ✅ Message Failed

### Variáveis de Ambiente

```bash
TWILIO_WEBHOOK_AUTH_TOKEN=your_auth_token_from_twilio_console
```

### Teste Local

```bash
# Enviar um OTP
curl -X POST http://localhost:3000/rpc/requestOtpVerification \
  -H "Content-Type: application/json" \
  -d '{
    "targetIdentifier": "+244923000000",
    "purpose": "login_2fa",
    "preferredChannel": "sms"
  }'

# Simular webhook (IMPORTANTE: gerar signature válida)
# Ver twilio-webhook-handler.ts para entender validação
```

---

## 2. Meta WhatsApp Webhooks

### Setup em Meta Developer Console

1. Ir a: **Apps** → Seu App → **WhatsApp** → **Configuration**
2. **Webhook URL**: `https://seu-dominio.com/api/webhooks/whatsapp-status`
3. **Verify Token**: Criar um token seguro (ex: `openssl rand -base64 32`)
4. **Webhook Fields** (ativar):
   - ✅ messages
   - ✅ message_status
   - ✅ message_template_status_update

### Variáveis de Ambiente

```bash
# Token para verificação de webhook
WHATSAPP_WEBHOOK_VERIFY_TOKEN=seu_verify_token_aleatorio

# Secret da app (para assinatura)
META_APP_SECRET=seu_app_secret_do_console
```

### Teste Local (Verificação)

```bash
# Meta fará um GET assim:
curl "http://localhost:3000/api/webhooks/whatsapp-status?hub.mode=subscribe&hub.challenge=test123&hub.verify_token=seu_verify_token"

# Deve retornar: test123
```

### Teste Webhook Status

```bash
# Simular webhook de entrega
curl -X POST http://localhost:3000/api/webhooks/whatsapp-status \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "statuses": [{
            "id": "wamid.xxxxxxx",
            "status": "delivered",
            "timestamp": "1234567890"
          }]
        }
      }]
    }]
  }'
```

---

## 3. Verificação de Assinatura

### Twilio

Twilio envia `X-Twilio-Signature` (HMAC-SHA1):

```typescript
// Server verifica:
const crypto = require("crypto");
const data = url + bodySortedByKey;
const expected = crypto
  .createHmac("sha1", authToken)
  .update(data)
  .digest("base64");

// Compare com header X-Twilio-Signature
```

### Meta

Meta envia `X-Hub-Signature-256` (HMAC-SHA256):

```typescript
// Server verifica:
const crypto = require("crypto");
const expected = crypto
  .createHmac("sha256", appSecret)
  .update(body)
  .digest("hex");

// Compare com header X-Hub-Signature-256 (sem "sha256=")
```

---

## 4. Debugging

### Ver Logs

```bash
# Twilio Webhooks
tail -f logs/twilio-webhook.log

# WhatsApp Webhooks
tail -f logs/whatsapp-webhook.log
```

### Testar Entrega (Staging)

```bash
# Twilio fornece números de teste
+1-555-555-0100 (SMS OK)
+1-555-555-0101 (SMS Fail)

# Meta fornece números de teste
+1-550-123-4567 (WhatsApp OK)
```

---

## 5. Monitoring

### Registos de Entregas

```sql
-- Ver status de SMS
SELECT * FROM communication_dispatches
WHERE channel = 'sms' AND provider = 'twilio'
ORDER BY created_at DESC;

-- Ver status de WhatsApp
SELECT * FROM communication_dispatches
WHERE channel = 'whatsapp' AND provider = 'meta'
ORDER BY created_at DESC;

-- Ver falhas
SELECT * FROM communication_dispatches
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Alertas Recomendados

- ⚠️ Taxa de falha > 5%
- ⚠️ Tempo médio de entrega > 30s
- ⚠️ Webhooks não recebidos em 5 min

---

## 6. Troubleshooting

### Webhook não recebe mensagens

1. ✅ Verificar URL está correta no console
2. ✅ Certificado SSL válido (Meta requer HTTPS)
3. ✅ Responder com HTTP 200 em < 5 segundos
4. ✅ Verificar firewall/proxy não bloqueia

### Assinatura inválida

1. ✅ Usar token/secret correto do console
2. ✅ Usar body exato (sem modificações)
3. ✅ Comparação case-sensitive

### Mensagens não entregues

1. ✅ Verificar número é E.164 válido
2. ✅ Verificar créditos em Twilio/Meta
3. ✅ Verificar templates aprovados (WhatsApp)
4. ✅ Ver error_details em communication_dispatches

---

## 7. Production Checklist

- [ ] HTTPS certificado válido
- [ ] Variáveis de ambiente configuradas
- [ ] Rate limiting ativo
- [ ] Logs persistidos (não apenas console)
- [ ] Monitoring alertas configurados
- [ ] Backup/recovery plan
- [ ] Testes de failover
- [ ] Documentação atualizada

