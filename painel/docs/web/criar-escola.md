# Criar escola — wizard WEB `/start`

Fluxo comercial para uma nova instituição aderir ao SIGA Plus. A UI é
**sempre do WEB**; o provisionamento corre no backend SIGA (mesma função
`provisionTenantCore` usada pelo ADMIN).

## URL

- Produção: [https://siga-web.pages.dev/start](https://siga-web.pages.dev/start) (ou `http://localhost:5174/start` em desenvolvimento)
- A partir da landing: botão «Começar» / «Criar escola»

Pontes equivalentes (não duplicam o wizard):

- SIGA `/criar-escola` → redirect para `/start`
- SIGA `/saas-admin` → links para WEB e ADMIN

## Passos do wizard

| # | Passo | Dados |
| --- | --- | --- |
| 1 | Instituição | Nome, NIF, cidade, morada, telefone, e-mail |
| 2 | Responsável | Nome, cargo, telefone, e-mail de contacto |
| 3 | Plano | Catálogo via `GET /api/saas/plans` (fallback local se offline) |
| 4 | Conta | Nome e e-mail do administrador inicial da escola |
| 5 | Endereço | Subdomínio `{slug}.portal-siga.com` |
| 6 | Revisão | Confirmação e **Criar escola** |

## API

```http
POST /api/saas/signup
Content-Type: application/json
```

Corpo validado por `publicSchoolSignupInputSchema` (SIGA). Resposta inclui
`tenantId`, `slug`, `hostname`, `sigaUrl`, `adminTenantsUrl`, **`bootstrapSeeded`**
(lista do que o servidor conseguiu semear automaticamente).

Lookup público (sem auth):

```http
GET /api/saas/tenants/lookup?slug={slug}
```

## O que acontece no servidor

Ordem de provisionamento (SGA):

```text
tenants → subscriptions → tenant_domains → schools → Auth invite →
profiles → school_memberships → roles → tenant_usage →
bootstrapSchoolDefaults → saas_audit_logs
```

**Bootstrap automático** (`bootstrapSchoolDefaults`, best-effort):

- Ano lectivo activo
- Plano financeiro (propina + taxa de matrícula por defeito)
- Formulário público de matrícula (`is_open: true`)
- Definições da escola
- Estrutura académica mínima (programa, campus, disciplinas, trimestres, turma)

- Trial: 14 dias por defeito
- Administrador recebe **convite Supabase** por e-mail para definir password
- Subdomínio SIGA fica activo; domínios custom são geridos depois no ADMIN

## Ecrã de sucesso

Após criar:

1. **Abrir o SIGA Plus** — login da escola (`sigaUrl`)
2. **Control Center** — link para ADMIN `/tenants` (`adminTenantsUrl`)
3. **Próximos passos** — [onboarding operacional](/web/onboarding-pos-criacao)
4. A escola aparece em ADMIN `/tenants`

## Erros comuns

| Situação | Causa provável |
| --- | --- |
| 400 «Pedido inválido» | Campos Zod em falta ou slug inválido |
| 400 slug duplicado | Subdomínio já usado |
| 500 em CI sem Supabase | Normal com `SIGA_E2E_CI=1`; smoke tolera 500 |
| Plano não listado | `APPLY_SAAS_PLATFORM.sql` não aplicado no SGA |
| Faturas bloqueadas | Plano financeiro inactivo — Definições → Financeiro |

## Testes locais

```sh
npm run dev:ecosystem
npm run siga:e2e-smoke          # HTTP (lookup, domains/verify 401, 4 apps)
npm run siga:e2e-playwright-ts      # Playwright TS — rotas + wizard
npm run siga:e2e-playwright-live    # Playwright TS @live (comercial + matrícula)
SIGA_E2E_LIVE=1 npm run siga:e2e-playwright   # smoke + TS + Python + @live (requer secret)
SIGA_E2E_LIVE=1 npm run siga:e2e-live-only    # só @live (ecossistema já a correr)
npm run siga:e2e-cleanup-stale -- --dry-run   # tenants E2E órfãos (simulação)
npx playwright show-report playwright-report  # após testes TS com falha
```

Provisionamento `@live` na CI: configurar secrets `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (ver `.env.example`).

Alertas opcionais quando E2E falha na CI:

- **Slack:** secret `SLACK_E2E_WEBHOOK_URL` (Incoming Webhook)
- **E-mail:** secrets `RESEND_API_KEY` + `E2E_ALERT_EMAIL_TO` (+ `E2E_ALERT_EMAIL_FROM` opcional)

Notifica o job `ecosystem-e2e` (PR/push) ou o nocturno `@live`.

Job nocturno `@live`: workflow **E2E @live (nocturno)** — cron 03:00 UTC ou manual
em Actions; usa `npm run siga:e2e-live-only`.

## Escola demo (dados ricos)

Para demonstrações sem wizard comercial:

```sh
npm run siga:sql:demo
npm run siga:seed-demo    # gera SEED_ESCOLA_DEMO_FULL.sql
```

Ver [Onboarding pós-criação](/web/onboarding-pos-criacao).
