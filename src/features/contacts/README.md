# Contact Verification & Communication Preferences

Módulo responsável por gerenciar perfis de verificação de contacto multi-canal (email, SMS, WhatsApp) e preferências de comunicação dos utilizadores.

## Estrutura

### Tabelas de Base de Dados

#### `contact_verification_profiles`

Rastreia o estado de verificação de cada canal de comunicação por utilizador.

Campos principais:

- `email_verified` — Email confirmado
- `phone_verified` — Telefone confirmado (SMS)
- `whatsapp_verified` — WhatsApp confirmado
- `preferred_communication_channel` — Canal preferido (email|sms|whatsapp)
- `preferred_language` — Idioma preferido

#### `user_communication_preferences`

Define quais categorias de comunicação o utilizador quer receber.

Categorias:

- `security_enabled` — Avisos de segurança (sempre obrigatório)
- `academic_enabled` — Notificações académicas (notas, faltas, etc)
- `financial_enabled` — Notificações financeiras (pagamentos, recibos)
- `attendance_enabled` — Avisos de presença/faltas
- `calendar_enabled` — Eventos de calendário escolar
- `announcements_enabled` — Comunicados escolares
- `events_enabled` — Eventos escolares
- `documents_enabled` — Documentos disponíveis
- `marketing_enabled` — Comunicações comerciais/newsletters

### Serviços

#### `ContactVerificationService`

Classe estática com operações de verificação e gerenciamento de contactos.

Métodos principais:

- `getOrCreateProfile(userId, schoolId)` — Obtém ou cria o perfil
- `markEmailAsVerified(userId)` — Marca email como verificado
- `markPhoneAsVerified(userId)` — Marca telefone como verificado
- `markWhatsappAsVerified(userId)` — Marca WhatsApp como verificado
- `setPreferredChannel(userId, channel)` — Define canal preferido
- `updateCommunicationCategories(userId, categories)` — Atualiza preferências
- `resolveChannel(profile, preferredChannels)` — Resolve qual canal usar

### Server Functions (RPCs)

#### `getContactVerificationProfileFn`

GET — Obtém o perfil de verificação do utilizador actual.

Requer autenticação.

#### `getCommunicationPreferencesFn`

GET — Obtém as preferências de comunicação do utilizador.

Requer autenticação.

#### `setPreferredCommunicationChannelFn`

POST — Define o canal preferido.

Input:

```typescript
{
  channel: "email" | "sms" | "whatsapp";
}
```

#### `updateCommunicationPreferencesFn`

POST — Atualiza as preferências de categorias.

Input (todas opcionais):

```typescript
{
  academic?: boolean,
  financial?: boolean,
  attendance?: boolean,
  calendar?: boolean,
  announcements?: boolean,
  events?: boolean,
  documents?: boolean,
  marketing?: boolean
}
```

## Integração com Autenticação

### Magic Link Login

Quando um utilizador faz login via magic link, o email é automaticamente marcado como verificado.

Fluxo:

1. Utilizador solicita magic link
2. Email é enviado
3. Utilizador clica no link e faz login
4. Frontend chama `syncMagicLinkVerificationFn`
5. Email é marcado como verificado

### Password Reset

Quando um utilizador reseta a password via email, o email é marcado como verificado.

Fluxo:

1. Utilizador solicita reset
2. Email de reset é enviado
3. Utilizador clica no link e reseta a password
4. Frontend chama `syncPasswordResetVerificationFn`
5. Email é marcado como verificado

## Verificação de Contactos

### Fluxo de Verificação de Email

1. Utilizador adiciona novo email em "Minha Conta → Segurança"
2. Email é salvo como `email_verified = false`
3. Sistema envia OTP via email (usando OtpService)
4. Utilizador coloca código de 6 dígitos
5. Se correto: `ContactVerificationService.markEmailAsVerified()`
6. Email passa a `email_verified = true` com timestamp

### Fluxo de Verificação de Telefone

1. Utilizador adiciona número em "Minha Conta → Comunicação"
2. Telefone é salvo como `phone_verified = false`
3. Sistema envia OTP via SMS (usando OtpDispatcher)
4. Utilizador coloca código
5. Se correto: `ContactVerificationService.markPhoneAsVerified()`

### Fluxo de Verificação de WhatsApp

1. Utilizador adiciona número WhatsApp em "Minha Conta → Comunicação"
2. Sistema envia OTP via WhatsApp (usando OtpDispatcher)
3. Utilizador coloca código
4. Se correto: `ContactVerificationService.markWhatsappAsVerified()`

## Escolha de Canal para Envio

Quando um evento (ex: nota publicada) dispara uma notificação:

1. `Communication Service` resolve qual canal usar:
   - Procura canais verificados para o utilizador
   - Aplica fallback configurado (WhatsApp → SMS → Email)
   - Respeita preferências do utilizador
   - Respeita categoria de comunicação (se desabilitada, não envia)

2. Exemplo:
   ```typescript
   const profile = await ContactVerificationService.getOrCreateProfile(userId);
   const channels = ["whatsapp", "sms", "email"]; // fallback
   const channel = ContactVerificationService.resolveChannel(profile, channels);
   // Se whatsapp_verified: usa WhatsApp
   // Else if phone_verified: usa SMS
   // Else if email_verified: usa Email
   // Else: retorna null
   ```

## Security

- **RLS (Row Level Security):** Utilizador só acessa seus próprios perfis e preferências
- **Service Role:** Tem acesso total para operações do sistema
- **Audit Trail:** `contact_verification_profiles` registra timestamps de verificação
- **Mandatory Categories:** Segurança não pode ser desabilitada

## Futuro

- [ ] Dashboard visual de verificação
- [ ] UI para gerenciar preferências
- [ ] Confirmação dupla (email + SMS) para operações sensíveis
- [ ] Histórico de mudanças de contacto
- [ ] Alertas de contacto suspeito
- [ ] Sincronização com provedores de SMS/WhatsApp
