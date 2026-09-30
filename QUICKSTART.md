# 🚀 Quick Start — SIGA Communication Layer

## 1 min Setup

```bash
# 1. Configurar variáveis de ambiente
cp .env.example.siga-communication .env.local

# 2. Preencher credenciais
# RESEND_API_KEY=...
# TWILIO_ACCOUNT_SID=...
# WHATSAPP_ACCESS_TOKEN=...

# 3. Aplicar migração
npm run supabase db push

# 4. Build e start
npm run build && npm run dev
```

## Usar no Código

### Backend — Enviar OTP

```typescript
import { OtpDispatcher } from "@/features/otp";

const dispatcher = new OtpDispatcher();
const result = await dispatcher.requestOtp({
  targetIdentifier: "+244923000000",
  purpose: "login_2fa",
  preferredChannel: "whatsapp", // fallback: SMS → Email
});

console.log(result.channelUsed); // "whatsapp" | "sms" | "email"
```

### Backend — Verificar Contacto

```typescript
import { ContactVerificationService } from "@/features/contacts";

await ContactVerificationService.markEmailAsVerified(userId);
await ContactVerificationService.markPhoneAsVerified(userId);

const profile = await ContactVerificationService.getOrCreateProfile(userId);
const channel = ContactVerificationService.resolveChannel(profile);
```

### Frontend — Mostrar Status

```tsx
import { VerificationStatus } from "@/components/account/VerificationStatus";

export function MyComponent() {
  return <VerificationStatus />;
}
```

### Frontend — Gerenciar Preferências

```typescript
import {
  getCommunicationPreferencesFn,
  updateCommunicationPreferencesFn,
} from "@/features/contacts";

// Ler
const prefs = await getCommunicationPreferencesFn();

// Atualizar
await updateCommunicationPreferencesFn({
  academic: true,
  marketing: false,
});
```

## Rotas Disponíveis

```
POST /api/webhooks/twilio-sms          — Webhook SMS
GET/POST /api/webhooks/whatsapp-status — Webhook WhatsApp
Configurações > Identidade — estado de verificação dos contactos (UI)
```

## Testes

```bash
# Teste unitário
npm run test contact-verification-service.test.ts

# Teste E2E (próximo)
npm run test:e2e
```

## Troubleshooting

❌ **"Resend not configured"**
- Verificar `RESEND_API_KEY` em `.env.local`

❌ **"Twilio credentials missing"**
- Verificar `TWILIO_*` vars

❌ **"WhatsApp template not found"**
- Template precisa ser pré-aprovado na Meta
- Registar em WhatsApp Manager → Templates

✅ **Sucesso!** Mensagens estão sendo entregues.

---

**Pronto em < 5 minutos! 🎉**
