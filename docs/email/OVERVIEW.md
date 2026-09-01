# Arquitectura de E-mail — SIGA Plus

> **Princípio:** Separar claramente responsabilidades de e-mail.
> Nunca misturar e-mail transacional da plataforma com e-mail institucional da escola.

---

## Os Três Tipos de E-mail

### 1. E-mail Transacional da Plataforma

Enviado pelo SIGA em nome da plataforma:

```
noreply@{{DOMINIO_PRINCIPAL}}
notificacoes@{{DOMINIO_PRINCIPAL}}
security@{{DOMINIO_PRINCIPAL}}
billing@{{DOMINIO_PRINCIPAL}}
suporte@{{DOMINIO_PRINCIPAL}}
```

**Finalidades:**
- Recuperação de senha, confirmação de conta
- Matrícula, propinas, recibos, faturas
- Boletins, notas, pautas, faltas
- Avisos, comunicações, suspensão de serviço

**Configuração:** variáveis de ambiente servidor-only.

---

### 2. E-mail Institucional da Escola

Endereço representativo da escola na plataforma:

```
esperanca@{{DOMINIO_PRINCIPAL}}
```

Guardado em `school_email_routes.source_address` (encaminhamento básico)
ou `schools.platform_email` (campo futuro).

No plano básico funciona como **encaminhamento**:

```
esperanca@{{DOMINIO_PRINCIPAL}}
        ↓
colegio@gmail.com
```

---

### 3. Caixas de Correio Profissionais (ADD-ON)

Disponíveis apenas em planos premium / enterprise:

```
direcao@colegioesperanca.ao
secretaria@colegioesperanca.ao
financeiro@colegioesperanca.ao
```

Geridas via `mailboxes` + `email_aliases`.

---

## Encaminhamento de E-mail

### Configuração em `school_email_routes`

```
source_address:      esperanca@{{DOMINIO_PRINCIPAL}}
destination_address: colegio@gmail.com
provider:            cloudflare_email
status:              active
verified:            true
```

### Fluxo

```
E-mail chega a esperanca@{{DOMINIO_PRINCIPAL}}
        ↓
Cloudflare Email Routing
        ↓
Verifica school_email_routes
        ↓
Encaminha para destination_address
```

---

## Autenticação de Domínio (SPF / DKIM / DMARC)

**Obrigatório antes de produção:**

```
SPF:    v=spf1 include:{{EMAIL_PROVIDER_SPF}} -all
DKIM:   configurar via provider (Resend / SendGrid / Cloudflare)
DMARC:  v=DMARC1; p=quarantine; rua=mailto:dmarc@{{DOMINIO_PRINCIPAL}}
```

Sem autenticação adequada, e-mails transacionais vão para spam.

---

## Remetente Personalizado

Para evitar spoofing, usar:

```
From: Colégio Esperança via SIGA <notificacoes@{{DOMINIO_PRINCIPAL}}>
```

Nunca permitir From arbitrário — somente domínios verificados.

---

## Interfaces de Provider

```typescript
interface EmailProvider {
  createRoute(source: string, destination: string): Promise<{ routeId: string }>;
  removeRoute(routeId: string): Promise<void>;
  verifyDomain(domain: string): Promise<{ verified: boolean; records: DnsRecord[] }>;
  sendTransactional(msg: TransactionalEmail): Promise<{ messageId: string }>;
}

interface TransactionalEmail {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Record<string, string>;
}
```

---

## Templates de E-mail

| Template | Evento |
|---|---|
| `welcome` | Escola criada, administrador convidado |
| `password_reset` | Recuperação de senha |
| `payment` / `invoice` / `receipt` | Pagamentos e faturas |
| `grade_notification` | Notas publicadas |
| `absence_notification` | Faltas registadas |
| `subscription_expiration` | Aviso de expiração |
| `domain_verified` | Domínio personalizado verificado |
| `slug_changed` | Aviso de mudança de endereço |

---

## Métricas de Deliverability

```
sent | delivered | bounced | complained | failed
```

Guardar eventos em `email_events` (opcional, sem conteúdo sensível).

---

## Política de E-mail em Suspensão

**Nunca perder e-mails silenciosamente.**

Em suspensão de assinatura:
- Encaminhamentos: manter activos durante grace period
- Notificar escola antes de desactivar
- Definir período de grace configurável (ex.: 15 dias)
- Após cancelamento: documentar política de retenção

---

## Restrições

- Não criar servidor SMTP próprio (complexidade de reputação, SPF, blacklists)
- Usar provider externo: Resend, SendGrid, Cloudflare Email Routing
- Não permitir endereço From arbitrário fornecido pelo cliente
- Rate limiting em envio de e-mail por escola/tenant
