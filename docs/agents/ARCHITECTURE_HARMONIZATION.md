# Arquitetura e Harmonização do Ecossistema SIGA Plus

> **Referência canónica para agentes.** Ler isto antes de alterar código que
> cruze aplicações, provisione escolas, ligue URLs, ou toque em billing SaaS.
> Handoff operacional: [CONTINUE.md](./CONTINUE.md).

**Filosofia:** um ecossistema, cinco responsabilidades, uma experiência integrada.

```text
WEB vende.    ADMIN controla.    SIGA trabalha.    PAYFLOW cobra.    DOC explica.
Todos comunicam. Nenhum substitui o outro. Nenhum precisa do mesmo frontend.
```

**Estado (2026-08-28):** Fases 1–4 e 5–9 (parcial) no código. Wizard WEB
`/start` → `POST /api/saas/signup`. ADMIN `/tenants` consome a mesma API.
`/saas-admin` no SIGA é ponte para o ADMIN. Frontends visuais preservados.

---

## 1. Mapa das cinco aplicações (auditoria)

| App | Pasta | Framework | Entrypoint | Porta dest. | Auth actual |
| --- | ----- | --------- | ---------- | ----------- | ----------- |
| **WEB** | `painel/web` | Vite 7 + React 19 + React Router 7 + Tailwind 4 | `src/main.tsx` → `AppRouter` | **5174** | Sem auth de produto (template) |
| **ADMIN** | `painel/admin` | Next.js 16 App Router + Tailwind 4 | `src/app/page.tsx` | **3005** | Supabase Auth + `platform_admins` (gate cliente + guardas na API SIGA) |
| **SIGA PLUS** | raiz `/` | TanStack Start + Vite + React Query + Zod | `src/routes/__root.tsx` | **3006** | Supabase Auth + `AuthGate` + MFA TOTP |
| **PAYFLOW** | `painel/payflow` | Vinext + React + Cloudflare D1 | `app/page.tsx` | **3007** | Portal do pagador; SSO administrativo por integrar |
| **DOC** | `painel/docs` | VitePress + Vue 3 | `.vitepress/config.ts` | **5173** | Público |

Dev:

```sh
# SIGA   — raiz
npm run dev                          # :3006

# ADMIN
cd painel/admin && npm run dev       # :3005 (já fixo no package.json)

# PAYFLOW
cd painel/payflow && npm run dev      # :3007

# WEB    — forçar 5174 para não colidir com DOC
cd painel/web && npx vite --port 5174

# DOC
cd painel/docs && npm run dev        # :5173 (VitePress)
```

**Colisão conhecida:** Vite do WEB e VitePress do DOC usam ambos 5173 por
omissão. A porta canónica do WEB é **5174** (`src/lib/ecosystem-urls.ts`).

Backend partilhado: **um** Postgres Supabase SGA (`xodgfmxiaunpamctfeea`),
**N** tenants / escolas. Não criar um PostgreSQL por escola.

> **Segurança do ADMIN em produção:** `siga-admin` é publicado no Cloudflare
> Pages como exportação estática. O `middleware.ts` do Next ajuda no servidor
> de desenvolvimento, mas não acompanha `out/` para produção. O limite de
> segurança efectivo é `PlatformAdminGate` no cliente, como defesa de UX, e
> sobretudo as guardas `requirePlatformAdmin*` nas APIs SIGA, que não podem
> confiar na interface. Migrar o ADMIN para SSR/Workers exige uma decisão de
> infraestrutura explícita; nunca assumir que esconder uma rota estática é
> autorização.

---

## 2. Arquitectura conceptual

```text
                    ECOSSISTEMA SIGA PLUS

                           WEB
                    portal público
                         │
            ┌────────────┼─────────────┐
            │            │             │
        Conhecer      Comprar      Criar Escola
            │            │             │
            └────────────┼─────────────┘
                         ↓
                   SaaS Services
              (hoje: src/features/saas
               destino: API partilhada)
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
           ADMIN                 SIGA PLUS
      SaaS Control Center     Gestão da Escola
              │                     │
              │                     │ ajuda
              └──────────┬──────────┘
                         ▼
                        DOC
```

```text
                ┌──────────────────┐
                │       WEB        │
                │ Marketing/Vendas │
                └────────┬─────────┘
                         │ signup
                         ▼
                ┌──────────────────┐
                │   SaaS Services  │
                │ Tenant/Billing   │
                │ Provisioning     │
                └──────┬─────┬─────┘
                       │     │
             ┌─────────┘     └─────────┐
             ▼                         ▼
    ┌─────────────────┐       ┌─────────────────┐
    │      ADMIN      │       │    SIGA PLUS    │
    │ SaaS Control    │       │ Gestão Escolar  │
    └─────────────────┘       └────────┬────────┘
                                      │ ajuda
                                      ▼
                             ┌─────────────────┐
                             │       DOC       │
                             │ Documentação    │
                             └─────────────────┘
```

---

## 3. Papel de cada aplicação

### WEB — venda e aquisição

Landing, funcionalidades, planos, preços, demo, contacto, FAQ, trial,
**wizard de criação de escola** (design do WEB, nunca do SIGA).

Visitante ainda não é utilizador escolar. Jornada comercial.

Rotas alvo: `/` (landing), `/pricing`, `/start` (wizard), `/contact`, `/demo`.

### ADMIN — SaaS Control Center

Verdade administrativa: Tenant, School, Subscription, Plan, Domain, Usage,
Billing, Provisioning, Status. Métricas, trials, suspensões, auditoria SaaS.

**Não** gere alunos, notas nem propinas.

### SIGA PLUS — operação da escola já criada

Académico, pedagógico, financeiro **escolar**, documentos, calendário,
comunicações, arquivos, catracas, acessos **escolares**.

Experiência single-school: o hostname resolve `tenant → school → user →
permissions`. A escola vê só a si. Sem «Seleccionar escola», salvo grupos
empresariais futuros explícitos.

### PAYFLOW — camada financeira transacional

Pagamentos, referências de provedor, estados transacionais, recibos e reconciliação.
Recebe identidade académica e obrigações do SIGA por contrato; não recadastra escola,
aluno, matrícula ou ano letivo. Produção falha de forma fechada sem provedor homologado.

### DOC — documentação do ecossistema

Manuais SIGA, Admin SaaS, Web, APIs, arquitectura, BD, integrações,
changelog, políticas. Consultável a partir das outras apps; sistema
independente.

---

## 4. Matriz de responsabilidades (actual → destino)

| Função | Actual (auditoria) | Destino |
| --- | --- | --- |
| Landing / marketing | WEB `/landing` (raiz redirecciona para `/dashboard` do template) | WEB `/` |
| Planos / pricing | WEB `/pricing` (template) + SIGA `listPlans` | WEB |
| Criar escola (UI) | SIGA `/criar-escola` (ponte para WEB) + wizard ainda em `/saas-admin` | WEB `/start` |
| Signup público (API) | SIGA `signupSchoolPublic` em `features/saas/server.ts` | SaaS Services (backend); UI no WEB |
| Provisionar tenant | SIGA `provisionTenantCore` | SaaS Services; ADMIN consome |
| Control Center SaaS (UI) | SIGA `/saas-admin` (UI completa) | ADMIN |
| Tenants / planos / billing SaaS | Tabelas SGA + UI SIGA | ADMIN |
| Domínios / subdomínios | `tenant_domains` + resolver SIGA | ADMIN gere; SIGA resolve hostname |
| Alunos, turmas, notas, pautas | SIGA | SIGA |
| Propinas / recibos escolares | SIGA `/financeiro` `/faturas` | SIGA cria a obrigação; PayFlow orquestra pagamento e recibo, sem duplicar a verdade |
| Assinatura / upgrade / renovar SIGA | Links e wizard no SIGA | WEB (checkout) + ADMIN (gestão) |
| Manuais / API docs | DOC ainda no template (Vite vs Next, componentes) | DOC (conteúdo do ecossistema) |

**Regra:** não apagar a função no sítio errado. Identificar → criar destino →
ligar backend → actualizar links → testar → só então remover a UI antiga.

---

## 5. Regras não negociáveis

### NÃO

- Reconstruir o projecto, unificar frontends, trocar frameworks, igualar
  fontes/cores/componentes entre apps.
- Importar componentes visuais do SIGA para WEB/ADMIN/DOC ou o inverso.
- Criar páginas «falsas WEB» no SIGA (`/siga/pricing`, wizard comercial com
  UI escolar).
- Mover operação escolar (alunos, notas, propinas) para WEB ou ADMIN.
- Duplicar alunos, matrículas ou regras de propina no PayFlow.
- Marcar como pago por redirect ou ação do browser; confirmação é sempre do backend/provedor.
- Deixar billing SaaS, tenants globais ou «criar escola» como produto SIGA.
- Criar um PostgreSQL por escola.
- Hardcode URLs de produção. Duplicar pricing/subscriptions/manuais.
- Misturar Administrador escolar com Administrador da plataforma.
- Assumir que esconder um botão é segurança.
- Remover funcionalidade sem destino. Quebrar escolas/logins existentes.
- Open redirect (`returnUrl` / `next` sem allowlist).

### SIM

- Preservar cada frontend e design system.
- Harmonizar contratos, APIs, IDs, eventos, URLs, auth e isolamento.
- Ligar comercial → WEB, SaaS → ADMIN, operação → SIGA, ajuda → DOC.
- Centralizar URLs em env + um módulo por app (hoje: `src/lib/ecosystem-urls.ts`).
- Multi-tenant: 1 app, 1 BD, N tenants, N escolas. `school_id` /
  `current_school_id()` isolam o domínio escolar.
- Pacotes partilhados só para types/schemas/clientes API — **nunca** UI.

---

## 6. Dois administradores e dois financeiros

| Conceito | Onde | Quem |
| --- | --- | --- |
| Administrador **escolar** | SIGA | Diretor, Secretário, Tesoureiro (`profiles.cargo`) |
| Administrador da **plataforma** | ADMIN | `platform_admins` — **sem** ligação a cargo escolar |
| Financeiro **escolar** | SIGA | Aluno → propina → escola |
| Billing **SaaS** | ADMIN / WEB | Escola → assinatura → SIGA Plus |

Cargo `Administrador` no SIGA **nunca** implica acesso ao ADMIN SaaS.
`requirePlatformAdmin()` é o portão real.

O SIGA só precisa do estado da subscrição: `ACTIVE` | `TRIAL` | `PAST_DUE` |
`SUSPENDED`, mais feature flags do plano. Não carrega o motor comercial.

---

## 7. Fluxos

### Nova escola

```text
VISITANTE → WEB (conhece / planos / demo OU cadastro)
  → wizard WEB (instituição → responsável → estrutura → plano → conta
     → subdomínio → revisão → criar)
  → API SaaS → Tenant + School + Subscription + Owner + Membership
     + Domain + settings
  → ADMIN regista o cliente
  → SIGA provisionado
  → redirect para SIGA (onboarding: ano lectivo → operação)
```

Wizard: **frontend WEB**. Provisionamento: **SaaS/Admin/backend**.
Trial público actual: 14 dias, honeypot + rate-limit IP/email
(`signupSchoolPublic`).

### Cliente existente

```text
Diretor → SIGA (trabalha)
  Plano/Upgrade → WEB /pricing  (design da landing)
  Documentação  → DOC (artigo da página, p.ex. pautas)
Proprietário da plataforma → ADMIN
```

### Hostname (single-school)

```text
esperanca.portal-siga.com
  → Domain Resolver → tenant_id → school → user → permissions
  → UI só «Colégio Esperança»
```

Código actual: `src/lib/saas/tenant-resolver.ts` +
`src/features/saas/tenant-context.tsx` em `__root.tsx`.
Dev localhost: slug via `localStorage.siga_dev_tenant_slug`.

---

## 8. URLs e variáveis de ambiente

Fonte no SIGA: [`src/lib/ecosystem-urls.ts`](../../src/lib/ecosystem-urls.ts).

| Variável | App | Fallback local |
| --- | --- | --- |
| `VITE_WEB_URL` | WEB | `http://localhost:5174` |
| `VITE_SIGA_URL` | SIGA | `http://localhost:3006` |
| `VITE_PAYFLOW_URL` | PAYFLOW | `http://localhost:3007` |
| `VITE_ADMIN_URL` | ADMIN | `http://localhost:3005` |
| `VITE_DOCS_URL` | DOC | `http://localhost:5173` |

Helpers SIGA: `getPricingUrl()`, `getCreateSchoolUrl()` → `/start`,
`getSaasAdminUrl()`, `getDocUrl(path)`.

ADMIN/WEB/DOC ainda não têm módulo equivalente (Fase 3). Não espalhar
URLs hardcoded. Redirects: só destinos da allowlist das cinco apps.

---

## 9. Autenticação e autorização

| App | Estado | Objectivo |
| --- | --- | --- |
| SIGA | Supabase Auth, sessão, MFA TOTP, `requireSupabaseAuth` | Identidade + autorização **escolar** |
| PAYFLOW | Portal do pagador com sessão curta; SSO administrativo via SIGA (`createPayflowAdminLaunch`) | Reutilizar identidade, tenant, escola e RBAC do SIGA |
| ADMIN | `@supabase/ssr` presente; UI template | Identidade central + `platform_admins` |
| WEB | Público; signup chama API SaaS | Público + criação de conta no provisionamento |
| DOC | Público | Eventual auth só para docs internos |

Não substituir auth de imediato (Fase 10). Meta: uma identidade, memberships
e roles **por aplicação**. Autenticação partilhada **não** é frontend
partilhado. Escola A não vê Escola B — isolamento no servidor/RLS, não só na UI.

---

## 10. Camada de serviços (não ligar frontend a frontend)

Preferir WEB / ADMIN / SIGA → API/Services.

Serviços alvo: `TenantService`, `SchoolProvisioningService`,
`SubscriptionService`, `DomainService`, `BillingService`, `IdentityService`,
`UsageService`.

Hoje o núcleo vive em:

- `src/features/saas/server.ts` — `provisionSchoolTenant`, `signupSchoolPublic`,
  `listTenants`, `getSaaSStats`, `listPlans`, `updateTenantStatusFn`
- `src/features/saas/provisioning-core.ts` — ordem:
  `tenants` → `tenant_domains` → `schools` → Auth user → `profiles` →
  `school_memberships` → `roles`/`member_roles` → `tenant_usage` →
  `saas_audit_logs`. Rollback se falhar depois do user Auth.

Eventos (simples, sem bus complexo enquanto não for preciso):
`school_signup_started`, `tenant_created`, `school_created`,
`subscription_started`, `school_provisioned`, `domain_created`,
`school_activated`, `subscription_changed`, `school_suspended`.

SQL SaaS: `supabase/APPLY_SAAS_PLATFORM.sql` (terceiro, depois dos dois
canónicos). RLS destas tabelas: só `is_platform_admin()`.

---

## 11. Navegação entre sistemas (contratos)

| De | Acção | Para |
| --- | --- | --- |
| SIGA | Ver planos / upgrade / conhecer Business | WEB `/pricing` |
| SIGA | Criar escola | WEB `/start` (hoje ponte `/criar-escola`) |
| SIGA | Ajuda / docs da página | DOC artigo (ex. pautas) |
| SIGA | Cobranças, pagamento e recibos | PAYFLOW, com contexto autorizado e sem tokens na URL |
| SIGA | Gestão global SaaS | ADMIN (não UI SIGA a longo prazo) |
| WEB | Login escola existente | SIGA |
| WEB | Criar escola | WEB onboarding → API → SIGA |
| ADMIN | Abrir escola (autorizado) | SIGA do tenant |
| ADMIN | Estado da camada de cobrança | PAYFLOW `/api/v1/health` (sem propinas) |
| DOC | Produto | WEB, SIGA ou PAYFLOW conforme contexto |

Query strings: contexto útil e não sensível. Nunca `tenant_id` secreto,
tokens, permissões ou dados privados.

---

## 12. Organização alvo do DOC

```text
DOC
├── SIGA Plus (primeiros passos, alunos, professores, turmas,
│              avaliações, financeiro escolar, relatórios)
├── SaaS Admin (tenants, assinaturas, billing, domínios, provisionamento)
├── WEB (portal, planos, criar escola)
├── API
├── Arquitetura  ← estas páginas (painel/docs/arquitetura/)
├── Integrações
└── Changelog
```

Preservar o frontend VitePress. Não duplicar manuais inteiros dentro do SIGA.

---

## 13. Fases (não executar de uma vez)

| Fase | O quê | Estado |
| --- | --- | --- |
| 1 | Auditoria | **Feito** |
| 2 | Limites entre aplicações | **Feito** |
| 3 | Centralizar URLs/config em WEB, ADMIN, DOC | **Feito** (`ecosystem-urls` em cada app) |
| 4 | Navegação entre sistemas | **Feito** (links WEB/ADMIN/SIGA/DOC) |
| 5 | Wizard criação de escola no WEB | **Feito** (`painel/web` `/start`) |
| 6 | Ligar wizard à API SaaS | **Feito** (`POST /api/saas/signup`) |
| 7 | ADMIN consome a mesma verdade SaaS | **Feito** (`/tenants` → `/api/saas/tenants`) |
| 8 | Redirect pós-provisionamento para SIGA | **Feito** (ecrã final do wizard) |
| 9 | Ponte `/saas-admin` → ADMIN; UI SaaS saiu do SIGA | **Feito** |
| 10 | Auth partilhada (sem unificar UI) | **Avançado** (login + `PlatformAdminGate` + middleware `/api/saas/me`) |
| 11 | Autorização por app | Parcial (`platform_admins` vs cargo escolar; rotas produto vivas no ADMIN/WEB) |
| 12 | Tenant isolation (A não vê B) | Parcial (`tenant_usage` + sync por escola) |
| 13 | E2E visitante → WEB → tenant → ADMIN → SIGA | Parcial (`siga:e2e-smoke`, Playwright TS/Python, `@live` com Supabase, gateway EMIS @live, artefactos CI) |

Após cada fase de código: `npm run siga:check`, lint, build, testes (Node 24).

---

## 14. Fora do lugar (não apagar ainda)

1. **`src/routes/saas-admin.tsx`** — ponte para ADMIN. Manter até ADMIN ter
   paridade total (já consome tenants/subscriptions/domains/audit/webhooks).
2. **`src/routes/criar-escola.tsx`** — ponte para WEB `/start`; manter.
3. **Backend SaaS em `src/features/saas`** — API HTTP no processo SIGA
   (destino: serviço partilhado quando estável). Não extrair cedo.
4. **Ficheiros UI monólito** — `settings-panels`, `AssessmentCenter`,
   `FileBrowser`, `pedagogica.tsx` (>1.5k). Extração em curso
   (`settings-security-panel.tsx`).
5. **Integrações catalog-ready sem HTTP** — WhatsApp/Resend/M365 = deep-link /
   copy até credenciais reais; gateway EMIS/Unitel já tem webhook HTTP.

### Pontos fracos — estado (2026-08-29)

| Severidade | Problema | Estado |
| --- | --- | --- |
| Alta | SQL SGA dual-track | **Mitigado** — ordem canónica + `siga:sql` / `siga:sql:verify` + DOC; nunca Lovable no SGA |
| Alta | ADMIN/WEB mail/chat/calendar/tasks demo | **Resolvido** — páginas com funções reais (ADMIN: SaaS; WEB: funil comercial); pontes só em auth/settings legados |
| Alta | Auth Fase 10 (contas escolares no ADMIN) | **Avançado** — login + gate + middleware chama `/api/saas/me` |
| Média | SaaS backend no SIGA | **Aceite** até extrair serviço (ponte consciente) |
| Média | DOC template | **Parcial** — ciclos 46c–f; continuar a substituir páginas kit |
| Média | UI monólito | **Parcial** — SecurityPanel + AssessmentCenter views/dialog extraídos |
| Média | Integrações sem HTTP | **Parcial** — Resend HTTP + gateway; WhatsApp/M365 ainda deep-link |
| Baixa | Porta WEB/DOC 5173 | **Resolvido** — WEB `vite --port 5174 --strictPort` |
| Baixa | Firebase analytics | **Mitigado** — off por defeito (`VITE_FIREBASE_ANALYTICS`) |

---

## 15. Riscos

- Mover `/saas-admin` antes do ADMIN estar ligado a `platform_admins` deixa
  a plataforma sem consola.
- `signupSchoolPublic` sem o wizard WEB correcto = buraco de aquisição.
- Unificar UI «para ficar igual» viola a regra nº 1.
- `studentCount` em stats usa soma de `tenant_usage` (corrigido na Fase 12).
- Redirects livres = open redirect.

---

## 16. Critério de sucesso

- WEB vende e inicia criação de escola.
- ADMIN gere tenant, assinatura, pagamento e domínio.
- SIGA gere só a escola.
- PAYFLOW executa pagamentos e emite recibos confirmados sem duplicar o académico.
- DOC documenta o ecossistema.
- Os cinco comunicam e continuam visualmente independentes.
- Escola nova: WEB → SIGA automaticamente.
- Isolamento: A não vê B.
- SIGA sem responsabilidades comerciais/SaaS desnecessárias.

---

## 17. Skills e ficheiros

| Skill | Quando |
| --- | --- |
| `siga-ecosystem` | Trabalho que cruza apps, URLs, provisionamento, limites |
| `siga-web` | `painel/web` |
| `siga-admin` | `painel/admin` |
| `siga-docs` | `painel/docs` |
| `siga-financeiro` + `siga-ecosystem` | Contratos e integração com `painel/payflow` |
| `siga-saas` | Backend SaaS ainda no SIGA (`features/saas`) |
| `siga` + `siga-<modulo>` | Operação escolar |

SQL SGA: `APPLY_IN_SQL_EDITOR.sql` → `APPLY_ENROLLMENT_AND_PREMIUM.sql` →
`APPLY_SAAS_PLATFORM.sql`. Nunca migrações Lovable.

---

## 18. PayFlow

A integração detalhada, os limites de fonte de verdade e os gates de produção estão em
[`PAYFLOW_INTEGRATION.md`](./PAYFLOW_INTEGRATION.md). O PayFlow usa D1 próprio nesta fase;
as migrações Drizzle de `painel/payflow` nunca são aplicadas ao Supabase SGA.
