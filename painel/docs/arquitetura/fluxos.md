# Fluxos e provisionamento

## Nova escola

```text
Visitante → WEB (conhece o produto / vê planos)
  → Começar agora → wizard WEB
      1. Instituição
      2. Responsável
      3. Plano
      4. Conta do administrador inicial
      5. Endereço SIGA (ex. colegioesperanca.portal-siga.com)
      6. Revisão e criar
  → `POST /api/saas/signup` (mesmo `provisionTenantCore`, um só banco)
  → bootstrapSchoolDefaults (ano lectivo, propinas, matrícula pública, turma)
  → resposta inclui bootstrapSeeded + adminTenantsUrl
  → ADMIN `/tenants` passa a ver o cliente
  → SIGA fica pronto → onboarding → operação
```

O formulário é do WEB. O provisionamento é da camada SaaS (backend / ADMIN).
Não se cria escola dentro do SIGA Plus.

Lookup público: `GET /api/saas/tenants/lookup?slug=...`

## Cliente existente

```text
Diretor → SIGA (trabalho diário)
  Precisa de plano / upgrade → WEB /pricing
  Precisa de ajuda → DOC (artigo da página)
Proprietário da plataforma → ADMIN
```

## Hostname

```text
esperanca.portal-siga.com
  → resolvedor de domínio → tenant → escola → utilizador → permissões
  → a interface mostra só essa escola
```

## Depois da criação

A escola recebe estado de subscrição (`ACTIVE`, `TRIAL`, `PAST_DUE`,
`SUSPENDED`) e as funcionalidades do plano. A gestão comercial continua no
ADMIN; o SIGA só pergunta se pode usar o sistema e quais os módulos activos.

### Utilização e métricas

- `tenant_usage` regista alunos e staff **por tenant** (via `school_id`).
- Após cada provisionamento, o SIGA sincroniza a utilização inicial.
- No ADMIN `/tenants`, **Sync utilização** recalcula a partir dos alunos reais.
- Métricas globais no ADMIN usam a soma de `tenant_usage`, não a tabela
  `students` inteira.

### Rotas ADMIN (`platform_admins`)

| Rota | Função |
| --- | --- |
| `/tenants` | Escolas clientes, estado, plano, sync utilização |
| `/platform-admins` | Conceder/revogar operadores da plataforma |
| `/audit` | Últimos eventos `saas_audit_logs` |
| `/domains` | Subdomínios portal-siga + domínios custom (`tenant_domains`) |
| `/subscriptions` | Histórico de subscrições (`subscriptions`) |
| `/settings/billing` | Catálogo de planos SaaS |

Todas exigem sessão Supabase com registo em `platform_admins`.

### Domínios customizados

```text
Operador → ADMIN /domains → Registar hostname (pending)
  → DNS: CNAME → {slug}.portal-siga.com
     ou TXT _siga-verify.{host} = siga-verify={tenant_id}
  → POST /api/saas/domains/verify → activa se DNS correcto
  → alternativa: activar manual (active) ou marcar failed
Subdomínio `{slug}.portal-siga.com` nasce no provisionamento (tipo subdomain).
```

Resolução no SIGA: subdomínio → slug; hostname custom activo → `tenant_domains`.

API: `GET/POST /api/saas/domains`, `POST /api/saas/domains/status`,
`POST /api/saas/domains/verify`.

Manual: [Domínios (ADMIN)](/admin/domains).

### Financeiro pós-provisionamento

- Bootstrap cria `fee_plans` + itens (`tuition`, `enrollment`) com valores por defeito.
- Administrador ajusta em Definições → **Financeiro** (`upsertFeePlanSettings`).
- `/financeiro` e `/faturas` alertam se não houver plano activo (`missingActiveFeePlan`).
- Contratos de cobrança (`finance_contracts`) surgem na primeira emissão de fatura.

### Gateway Multicaixa / Unitel

```text
Tesouraria → plano pending_gateway (referência EMIS determinística)
  → pagador liquida no terminal
  → EMIS POST /api/finance/gateway/confirm
     Unitel POST /api/finance/gateway/unitel/confirm
     { apiKey, reference, amount, invoiceId? }
  → register_payment + plano settled
  → alternativa: confirmar manualmente na UI (PaymentReferenceCard)
```

- **Entidade EMIS por escola:** Definições → Integrações → Multicaixa → campo «Merchant EMIS» (`merchantId` / `emisEntity`, 4–6 dígitos). Sem valor usa `99824` (demo).
- **API key:** `webhookApiKey` gerada na instalação da integração (não confundir com merchant).
- **Unitel:** URL dedicada `/api/finance/gateway/unitel/confirm` — ver manual [EMIS / Multicaixa e Unitel](/integracoes/emis-multicaixa-unitel).

Dev local: `SIGA_GATEWAY_DEV_API_KEY` + `invoiceId` no corpo (ver `.env.example`).

Simulador CLI:

```sh
npm run siga:gateway-simulate -- --invoice-id=<uuid-fatura> [--amount=45000]
```

Teste @live na CI: `gateway-live.spec.ts` (ver [manual EMIS/Unitel](/integracoes/emis-multicaixa-unitel) e [checklist produção](/integracoes/gateway-producao)).

### Escola demo (seed SQL)

Para ambientes de demonstração com turmas e alunos pré-carregados:

```sh
npm run siga:sql          # scripts canónicos
npm run siga:sql:demo     # ordem SEED_ESCOLA_DEMO
npm run siga:seed-demo    # gera SEED_ESCOLA_DEMO_FULL.sql
```

Slug público: `dom-afonso-demo` → `/matricula/dom-afonso-demo`.

O seed `SEED_ESCOLA_DEMO.sql` liga automaticamente o tenant SaaS
(`dom-afonso-demo.portal-siga.com`) para a escola aparecer no ADMIN `/tenants`
e responder ao lookup `GET /api/saas/tenants/lookup?slug=dom-afonso-demo`.

### Subscrições (`subscriptions`)

```text
Provisionamento → linha em subscriptions (plano + trial/activo)
ADMIN «Gerir» plano/trial → actualiza tenants + sync subscriptions
Operador → ADMIN /subscriptions → filtrar por escola, ver período e MRR
```

API: `GET /api/saas/subscriptions`, `POST /api/saas/subscriptions/backfill` (escolas antigas sem linha).

### Verificação local (Fase 13)

```sh
npm run dev:ecosystem    # SIGA :3006 · WEB :5174 · ADMIN :3005 · DOC :5173
npm run siga:e2e-smoke   # smoke HTTP das 5 apps + lookup + domains/verify
npm run siga:e2e-live    # provisionamento real (secrets Supabase)
```

Fluxo manual: WEB `/start` → escola no ADMIN `/tenants` → login SIGA →
[onboarding](/web/onboarding-pos-criacao).
