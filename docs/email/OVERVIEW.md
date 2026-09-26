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

---

## Estado Actual — E-mails de Autenticação (2026-09-08)

Auditoria + correcções aplicadas nesta ronda ao ciclo de branding multi-tenant dos
e-mails de Auth. Regra de ouro: **nunca enviar o e-mail nativo genérico "Supabase
Auth" ao utilizador final** — o Supabase é só infraestrutura de tokens/sessões.

### O que já está ligado e a funcionar

| Fluxo | Ficheiro | Envio |
|---|---|---|
| Recuperação de senha | [`src/features/auth/reset-password-server.ts`](../../src/features/auth/reset-password-server.ts) | `generateLink(type:"recovery")` + Resend + `renderResetPasswordEmail` |
| Convite do admin da escola (provisionamento SaaS) | [`src/features/saas/admin-account.ts`](../../src/features/saas/admin-account.ts) | `createUser` + `generateLink(recovery)` + Resend + `renderSchoolInvitationEmail` |
| Convite de utilizador do sistema (equipa da escola) | [`src/features/access/server.ts`](../../src/features/access/server.ts) `inviteSystemUser` / `sendSystemInviteEmail` | idem — corrigido nesta ronda (antes usava `inviteUserByEmail`, e-mail nativo Supabase) |
| Convite institucional por token | `createSchoolInvitation` (mesmo ficheiro) | envio automático best-effort, além do link copiável já existente |
| Magic link (entrar sem senha) | [`src/features/auth/magic-link-server.ts`](../../src/features/auth/magic-link-server.ts) + rota [`auth.magic-link.tsx`](../../src/routes/auth.magic-link.tsx) | `generateLink(type:"magiclink")` + Resend + `renderMagicLinkEmail`; botão em `AuthGate.tsx` |
| Troca de e-mail | [`src/features/auth/email-change-server.ts`](../../src/features/auth/email-change-server.ts) + rota [`auth.email-change.tsx`](../../src/routes/auth.email-change.tsx) | `generateLink(type:"email_change_new")` + Resend + `renderEmailChangeEmail`; formulário em Perfil → Segurança (`EmailChangeForm.tsx`) |

Todos resolvem `schoolName`/`logo_url`/`primary_color` a partir de
`school_settings.domain = 'branding'` (ver `fetchSchoolBranding`, exportado de
`reset-password-server.ts` e reutilizado pelos outros dois) e falham **fechados**:
se o Resend não estiver configurado ou a entrega falhar, nenhum e-mail genérico é
enviado como substituto — a falha fica registada (`saas_audit_logs` no reset de
senha; `inviteDeliveryError` no retorno do convite) para diagnóstico, sem revelar
nada ao utilizador nem quebrar a segurança (anti-enumeração de e-mail mantida).

### Templates prontos mas sem gatilho (não implementados no produto)

- `renderSignupConfirmationEmail` — não há auto-registo público; todas as contas
  nascem já confirmadas via `admin.createUser({ email_confirm: true })`. Fica
  pronto (aceita `logoUrl`/`primaryColor`/branding) para o dia em que o
  auto-registo público for pedido explicitamente.

### Magic link — implementado nesta ronda

Botão "Ou entrar sem senha por link de e-mail" em `AuthGate.tsx`, ao lado do
login por senha. Envia por Resend com o branding da escola resolvida pelo
hostname (mesmo mecanismo do reset de senha), e a rota `/auth/magic-link`
troca o código pela sessão e redirecciona ao portal. Resposta sempre neutra
(anti-enumeração).

**Bug de segurança evitado antes de ir a produção:** a primeira versão gerava
o link com `generateLink(type:"magiclink")`. A documentação do Supabase é
explícita — esse tipo (junto com `signup` e `invite`) **cria a conta
automaticamente** se o e-mail não existir. Isso teria transformado o campo de
"entrar sem senha" num criador de contas arbitrário, quebrando o isolamento
multi-tenant (qualquer e-mail digitado ganharia uma conta `auth.users` nova,
sem `school_memberships`). Corrigido para `type:"recovery"`, que produz um
link com o mesmo mecanismo de sessão sem esse efeito colateral — o conteúdo
do e-mail continua a ser inteiramente nosso (não o template nativo).

### Troca de e-mail — implementado nesta ronda

Card "Endereço de E-mail" em Perfil → Segurança. O utilizador autenticado pede
a troca; a confirmação vai só para o **novo** endereço
(`generateLink(type:"email_change_new")`); a rota `/auth/email-change` conclui
a troca e redirecciona a `/perfil`. Ao contrário do reset de senha, esta acção
é autenticada e auto-iniciada — por isso os erros são reportados directamente
ao utilizador (sem a mensagem neutra usada em fluxos anónimos).

**Dependência de configuração:** se o projecto Supabase tiver "Secure email
change" activado no Dashboard (Authentication → Settings), a confirmação
também exige o e-mail antigo, e este fluxo (que só confirma o novo) nunca
completaria a troca. Se a funcionalidade não completar em produção, desactivar
essa opção ou estender `email-change-server.ts` para enviar também o link
`type:"email_change_current"` ao endereço antigo.

**Inconsistência corrigida:** a primeira versão sempre redireccionava para o
domínio central (`getAppUrl()`), sem o mecanismo de domínio customizado
verificado que o reset de senha e o magic link já tinham (subdomínios
`<slug>.portal-siga.com` sempre voltam ao central — isso está correcto e é o
padrão real; só domínios customizados verificados em `tenant_domains`
preservam a própria origem). Alinhado: agora recebe `hostname` do cliente e
só troca de origem se o domínio verificado pertencer à mesma escola do
utilizador autenticado (comparação por `tenant_id`, não só pelo domínio).

### Login social (Google) — implementado nesta ronda

Botão "Entrar com Google" em `AuthGate.tsx` (`signInWithOAuth({provider:"google"})`).

**Risco tratado — reforçado nesta ronda:** login OAuth cria a conta
`auth.users` automaticamente para qualquer e-mail Google nunca visto
(diferente do login por senha, que só existe para contas já provisionadas por
um administrador — não há auto-registo público no SIGA). A primeira versão só
fazia `signOut` quando a conta não tinha nenhuma `school_memberships` —
suficiente para bloquear o acesso, mas a conta `auth.users` "fantasma"
continuava a existir no banco para sempre.

**Substituído a 2026-09-25 (PR #32).** Durante algum tempo, `verify-oauth-account-server.ts`
apagava a conta `auth.users` de quem entrava com Google sem vínculo. Esse ficheiro e o
atalho `dev-bypass` foram removidos. Hoje:

- existe registo público de conta ("Criar conta" no `AuthGate`, via `requestSignupFn`);
- uma conta sem vínculo activo não é apagada: entra na sessão, **não vê dados de nenhuma
  escola** (o servidor recusa tudo o que exige membership) e o `RouteAccessGate` mostra o
  painel de integração institucional (criar escola ou pedir acesso à secretaria);
- ver `docs/agents/CONTINUE.md` (Ciclo 102).

**Mesmo princípio aplicado a `inviteSystemUser` (bug pré-existente, não
introduzido nesta sessão):** se `createUser` tivesse sucesso mas o perfil, a
membership ou a atribuição de papel falhassem a seguir, a conta ficava órfã
para sempre — as próprias mensagens de erro admitiam isso ("Conta criada, mas
falhou..."). Corrigido: as três etapas críticas (perfil, membership, papel)
agora estão num bloco que, em qualquer falha, apaga a conta recém-criada
(`admin.deleteUser`) antes de propagar o erro. A vinculação a `people` e o
envio do e-mail de acesso continuam best-effort (não críticos para a conta
existir), como já estavam.

**Configuração pendente, fora do alcance de código (você precisa fazer):**
1. Google Cloud Console → criar OAuth 2.0 Client ID (tipo "Web application").
2. Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
   (o Supabase Dashboard mostra o valor exacto em Authentication → Providers → Google).
3. Supabase Dashboard → Authentication → Providers → Google: colar Client ID e
   Client Secret, activar o provider.
4. Confirmar que `https://portal-siga.com` (e subdomínios relevantes) estão em
   Redirect URLs, já que `redirectTo` usa `window.location.origin`.

Sem isso configurado, o botão aparece mas o Supabase devolve erro ao clicar —
tratado com a mensagem "Não foi possível iniciar sessão com o Google.".

### Fluxos de convite que continuam a oferecer canal manual

- `resendSystemInvite` mantém os botões Copiar/WhatsApp/mailto como estavam —
  UX deliberada, não um bug. Adicionado nesta ronda um 4º botão "Enviar
  E-mail" (`sendSystemInviteEmail`) como alternativa automática, sem remover
  os manuais.
- `createSchoolInvitation` agora também envia e-mail automaticamente
  (best-effort), mantendo a cópia do link como estava.

### Variáveis de ambiente necessárias

```
APP_URL=https://portal-siga.com        # getAppUrl() — ponto único de domínio
APP_NAME=SIGA Plus                     # getAppName()
PLATFORM_DOMAIN=portal-siga.com        # getPlatformDomain() — fallback de APP_URL
RESEND_API_KEY=...                     # obrigatório para qualquer envio institucional
RESEND_FROM_EMAIL="SIGA Plus <seguranca@portal-siga.com>"
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...                # server-only, nunca no cliente
```

Trocar de domínio no futuro = só mudar `APP_URL`/`PLATFORM_DOMAIN`. Nenhum destes
três fluxos tem `portal-siga.com` hardcoded fora desse ponto central.

### Configuração pendente no Supabase Dashboard

- **Site URL**: `https://portal-siga.com`
- **Redirect URLs**: incluir `https://portal-siga.com/auth/reset-password`,
  `https://portal-siga.com/auth/magic-link` e
  `https://portal-siga.com/auth/email-change` (e o equivalente por subdomínio
  de escola, se aplicável) — protecção contra open redirect já depende de
  `getAuthResetPasswordUrl()`/`getAuthMagicLinkUrl()`/`getAuthEmailChangeUrl()`
  validarem a origem.
- Nenhuma alteração de DNS foi feita por este agente (fora do escopo autorizado).

### `school_settings` e `school_branding` sob controlo de versão

Ambas só existiam em scripts manuais fora do fluxo de migrations:
- `school_settings` (branding.logo_url, banking, agt, spotlight, pedagogy) —
  [`20260908120000_school_settings_versioned.sql`](../../supabase/migrations/20260908120000_school_settings_versioned.sql).
- `school_branding` (logo_url, primary_color, secondary_color, portal_title) —
  [`20260908130000_school_branding_versioned.sql`](../../supabase/migrations/20260908130000_school_branding_versioned.sql).

**Bug corrigido na própria migration de `school_settings`:** a primeira versão
inventou colunas (`updated_by` + trigger automática) sem checar o uso real do
resto do produto. `school/server.ts`, `documents/server.ts`,
`spotlight/server.ts`, `saas/school-bootstrap.ts` e outros já escrevem nesta
tabela usando `version` (integer, incrementado manualmente) e `changed_by` —
colunas que a migration original não tinha. Aplicada do zero, teria quebrado
todos esses fluxos com "column does not exist". Corrigido para bater
exatamente com o schema já em uso; `school_branding` foi conferida contra
`school-domain-ops.ts` e já estava correta (copiada verbatim do script
original, não inventada).

**Bug corrigido nesta ronda:** o branding tem duas fontes reais, já usadas pelo
painel Definições → Escola (`src/features/school/server.ts`): `logo_url` vem
primeiro de `school_settings`, com fallback para `school_branding`;
`primary_color` só existe em `school_branding` (nunca em `school_settings`). A
primeira versão de `fetchSchoolBranding` só lia `school_settings`, portanto
`primary_color` nunca aparecia nos e-mails mesmo quando a escola o configurava
no painel. Corrigido para ler as duas fontes com a mesma precedência do painel.

### Validação em Produção do Domínio e Disparo Resend (2026-09-11)

- **Domínio:** `portal-siga.com` verificado no Resend (`0d44a3aa-689d-43a5-8f35-f8879b19cd3b`) com DKIM e SPF validados no Cloudflare.
- **Remetente padrão:** `SIGA Plus <noreply@portal-siga.com>`.
- **Chave de API:** Chave ativa configurada no `.env` (`RESEND_API_KEY`), testada diretamente contra a API oficial.
- **Teste de Envio Real:** Disparo de teste executado com sucesso (ID: `4c20d680-a1a5-4925-8d3a-e1e174fa8581`), evento confirmado como `delivered` via Amazon SES Irlanda (`eu-west-1`).

---

## Múltiplos Remetentes no Código (Canais Padronizados)

Implementado em `src/features/integrations/resend-client.ts` através da função `resolveSystemSender(channel, options)`.

| Canal | Propósito | Remetente Padrão (Plataforma) | Com Branding Escolar | Env Override |
|---|---|---|---|---|
| `academic` | Notas, pautas, faltas, boletins | `SIGA Académico <notificacoes@portal-siga.com>` | `{{escola}} via SIGA <notificacoes@portal-siga.com>` | `RESEND_FROM_ACADEMIC_EMAIL` |
| `finance` | Payflow, faturas, recibos, alertas gateway | `SIGA Payflow <financeiro@portal-siga.com>` | `{{escola}} (Financeiro) <financeiro@portal-siga.com>` | `RESEND_FROM_FINANCE_EMAIL` |
| `auth` | Reset de senha, magic link, convites | `SIGA Segurança <seguranca@portal-siga.com>` | `{{escola}} via SIGA <seguranca@portal-siga.com>` | `RESEND_FROM_AUTH_EMAIL` |
| `support` | Atendimento, suporte ao utilizador | `SIGA Suporte <suporte@portal-siga.com>` | `{{escola}} (Suporte) <suporte@portal-siga.com>` | `RESEND_FROM_SUPPORT_EMAIL` |
| `default` | Comunicações gerais da plataforma | `SIGA Plus <noreply@portal-siga.com>` | `{{escola}} via SIGA <noreply@portal-siga.com>` | `RESEND_FROM_EMAIL` |

---

## Cloudflare Email Routing (Aliases Gratuitos)

Permite receber mensagens enviadas para endereços de atendimento e suporte a custo zero, encaminhando automaticamente para uma caixa de entrada existente (ex.: Gmail).

### 1. Registos DNS no Cloudflare (`portal-siga.com`)

| Tipo | Nome | Conteúdo / Destino | Prioridade | TTL |
|---|---|---|---|---|
| `MX` | `@` | `isaac.mx.cloudflare.net` | `9` | Auto |
| `MX` | `@` | `linda.mx.cloudflare.net` | `59` | Auto |
| `MX` | `@` | `amir.mx.cloudflare.net` | `94` | Auto |
| `TXT` | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | — | Auto |

*(O envio de saída do Resend é autenticado através de `bounces.portal-siga.com` CNAME e DKIM `resend._domainkey`, sem colidir com o roteamento de entrada do Cloudflare).*

### 2. Regras de Encaminhamento (Custom Addresses)

No Cloudflare Dashboard: `portal-siga.com` → **Email** → **Email Routing** → **Routing Rules**:

| Endereço Personalizado | Ação | Destino Verificado |
|---|---|---|
| `suporte@portal-siga.com` | Encaminhar para | `seu-email-pessoal@gmail.com` |
| `contacto@portal-siga.com` | Encaminhar para | `seu-email-pessoal@gmail.com` |
| `dmarc@portal-siga.com` | Encaminhar para | `seu-email-pessoal@gmail.com` *(relatórios agregados)* |
| *Catch-all* | Rejeitar (ou descartar) | Proteção contra spam de caixas inexistentes |

---

## Registo DMARC Estrito (`p=reject`)

Para maximizar a entregabilidade na caixa de entrada (inbox rate) e bloquear tentativas de spoofing ou phishing:

### Registo DNS no Cloudflare

```dns
Tipo:    TXT
Nome:    _dmarc
TTL:     Auto (ou 1 hora)
Conteúdo: v=DMARC1; p=reject; sp=reject; pct=100; rua=mailto:dmarc@portal-siga.com; aspf=r; adkim=r
```

### Explicação dos Parâmetros

* `v=DMARC1`: Versão 1 do protocolo DMARC.
* `p=reject`: Política estrita — servidores de destino (Google, Microsoft, Yahoo) rejeitam imediatamente e-mails que não passem na validação DKIM/SPF do SIGA.
* `sp=reject`: Aplica a mesma política estrita de rejeição a todos os subdomínios.
* `pct=100`: Aplica a regra a 100% dos fluxos de envio.
* `rua=mailto:dmarc@portal-siga.com`: Envia relatórios agregados semanais para o alias de recepção gerido pelo Cloudflare Email Routing.
* `aspf=r` e `adkim=r`: Alinhamento flexível/compatível com os subdomínios de retorno do Resend (`bounces.portal-siga.com`).

