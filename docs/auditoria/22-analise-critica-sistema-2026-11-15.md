# SIGA Plus — Análise crítica do sistema (15/11/2026)

Continua a [21](./21-analise-critica-ecossistema-2026-11-10.md) (10–11/11). Cobre o SIGA (raiz),
o PayFlow (`painel/payflow`), o segundo backend da app Android (`estudo/yft-school-system`),
o pipeline de publicação e o processo de base de dados. Base `main` `b581530`, ramo
`claude/funny-keller-i4dgj0`.

**Sem SQL, sem deploy, sem escritas na produção e sem alterações ao código** — só este
documento. Os limites estão no fim. Os achados da 21 que continuam abertos (CSP obrigatória,
monólitos, chaves das catracas em texto simples, tecto para `/_serverFn`, staging) não são
repetidos aqui, salvo quando agravam um achado novo.

## Em uma frase

O código está muito testado e é cuidadoso a autenticar, mas os riscos maiores estão nas
**fronteiras de confiança entre as peças**: a sessão de toda a gente vive num cookie legível
por JavaScript e partilhado por todos os subdomínios; uma única chave estática do PayFlow
vale como prova de pagamento e como palavra-passe de administrador; a app Android tem um
segundo backend com a chave de serviço da produção; os tokens de agentes de IA têm o poder
da sessão inteira — e o código publicado a 12/11 depende de uma migração que o próprio
repositório regista como **por aplicar**.

## Linha de base (medida nesta sessão, `main` `b581530`)

| Verificação                           | Resultado                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Vitest                                | 897 ficheiros; **6 418 ✓, 0 ✗**, 25 ignorados (166 s)                                             |
| `tsc --noEmit`                        | 0 erros (88 s)                                                                                    |
| ESLint                                | 0 erros, 61 avisos (49 `react-refresh`, 6 `exhaustive-deps`, 6 `no-explicit-any`)                 |
| `bun audit --audit-level=high`        | 0 vulnerabilidades (900 pacotes)                                                                  |
| Build do SIGA                         | OK em 42 s; 450 ficheiros, 12 MB em `assets/`; os pedaços pesados são todos tardios (abaixo)      |
| Server functions                      | 587; 571 com `requireSupabaseAuth`; 16 públicas declaradas em `server-fn-guards.test.ts`          |
| Ficheiros que usam a chave de serviço | 171 (a RLS não é a fronteira efectiva na maior parte das leituras e escritas)                     |
| Repositório                           | 274 migrações, 218 documentos `.md` (40 274 linhas), `CONTINUE.md` com 6 117 linhas, 10 lockfiles |

Pedaços maiores do cliente (bruto / gzip): `website-preview` 2,3 MB / 315 KB e `content-model`
838 KB / 119 KB (só no Website Studio e no painel do website), `exceljs` 930 KB / 256 KB e
`export-pdf` 434 KB / 138 KB (importação/exportação). Nenhum é importado estaticamente pelo
caminho inicial — não é prioridade.

## Achados, por prioridade

### P0 — O lançamento de notas pode estar parado na produção desde 12/11 (verificar hoje)

- `upsertAssessmentScores` (`src/features/academic/server-legacy.ts:1779`) grava por
  `writeAssessmentScores`, que chama a RPC `siga_write_assessment_scores_atomic` **sem
  alternativa** (`src/features/academic/assessment-score-write.ts:148-171`). Sem a função na
  base, o professor recebe «A gravação segura das notas requer a actualização académica da
  base de dados». O mesmo para devolver trabalhos com nota (`siga_return_task_submission_atomic`,
  `src/features/academic/task-submissions-server.ts:443-459`) e para passar notas de trabalhos
  à pauta (`syncTaskGradesToPauta`, mesmo ficheiro, linha 284).
- O próprio repositório regista as três funções como «ainda NÃO aplicada»:
  `tests/security/espera-migracao.ts:28-33`. O código entrou na `main` com a #443 e foi
  publicado a 12/11; o [handoff da integração](../agents/HANDOFF_INTEGRACAO_PRS_2026-11-12.md)
  passou a migração de pré-requisito do merge a «obrigação em produção».
- **Por que razão o CI está verde:** a lista `FUNCOES_ESPERA_MIGRACAO` existe precisamente para
  tolerar isto. O CI compara o código com o retrato (`PRODUCTION_SNAPSHOT.json`, de 29/10), não
  com a base de destino. Nada no deploy impede publicar código que dependa de SQL por aplicar.

**Correcção**

1. Hoje, no SQL Editor (só catálogo, sem dados):
   `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('siga_write_assessment_scores_atomic', 'siga_return_task_submission_atomic', 'siga_reorganize_enrollment_guarded');`
2. Se faltarem: aplicar `supabase/migrations/20261031000000_academic_write_integrity.sql`
   (decisão do proprietário, depois das [regras da base](../agents/DATABASE_RULES.md)),
   recapturar retrato e tipos (`npm run siga:db-snapshot`, `npm run siga:gen-types`) e esvaziar
   a lista de espera.
3. Estrutural: um portão no `deploy-production.yml` que falhe quando o código chama funções
   que a base de destino não tem — por exemplo, ler o OpenAPI do PostgREST (`GET /rest/v1/`
   com a chave de serviço, só leitura) e comparar com as `.rpc("…")` do código, ou uma RPC
   `siga_schema_contract()` que devolva versões. A regra «o código publicado só depende do que
   a base já tem» deve ser automática, não uma nota de handoff.

### P1-1 — A sessão inteira vive num cookie do domínio-pai, legível por JavaScript

- `src/integrations/supabase/shared-session-storage.ts:72` grava a sessão do Supabase
  (**token de acesso, token de renovação** e utilizador) em cookies
  `Domain=portal-siga.com; Path=/; Secure; SameSite=Lax`, por `document.cookie` (logo, sem
  `HttpOnly`), com `Max-Age` de 400 dias (linha 33). É o armazenamento do cliente do browser
  em todos os subdomínios da plataforma (`src/integrations/supabase/client.ts:68-70`).
- O comentário do ficheiro diz que o acesso é «o mesmo que o `localStorage` tinha». Não é: o
  `localStorage` é de uma origem; este cookie é lido por **qualquer página de qualquer
  `*.portal-siga.com`** e enviado em **todos os pedidos a todos os subdomínios** — o SIGA, os
  websites das escolas (`<slug>.portal-siga.com`), WEB/ADMIN/DOC no Pages e o PayFlow (outro
  Worker, outra base de código, `vinext` 0.0.x).
- Consequência: um XSS em qualquer dessas apps — ou um subdomínio futuro apontado para um
  terceiro (página de estado, domínio de rastreio de e-mail…) — entrega a sessão de quem o
  visitar, incluindo administradores da plataforma em aal2, que passam `requirePlatformAdmin`
  com esse mesmo token. A CSP continua em `Report-Only` com `'unsafe-inline'` no SIGA e no
  website escolar (`src/lib/security-headers.ts:23`, `src/features/school-website/site-http.ts:20`):
  não há barreira contra esse XSS.
- O que está bem (verificado): o website escolar escapa todos os valores das escolas
  (`render-site.ts`, `blog-view.ts`) e os ficheiros carregados são servidos por URLs assinados
  no domínio do Supabase, não nos subdomínios da plataforma. **Não encontrei um XSS concreto** —
  o problema é o raio de impacto de um só.

**Correcção** (por esforço)

1. Já: inventariar o DNS e fixar como regra que nenhum `*.portal-siga.com` aponta para
   terceiros.
2. Curto prazo: CSP obrigatória primeiro no website escolar, no ADMIN e no PayFlow; depois no
   SIGA com _nonces_ (item 1 da 21).
3. Médio prazo: tirar o token de renovação do alcance do JavaScript — sessão gerida pelo
   Worker em cookie `HttpOnly` por anfitrião (padrão BFF), com troca por código de uso único
   ao mudar de subdomínio (o PayFlow já faz isto em `/api/v1/sso/exchange`). Alternativa
   intermédia: o cookie partilhado só com o token de acesso (1 h) e a renovação em
   armazenamento da própria origem.
4. A ponderar: servir os websites das escolas noutro domínio registável. Hoje o website e o
   portal de cada escola são a **mesma origem** (`<slug>.portal-siga.com/` e `/portal`), por
   isso nem um cookie por anfitrião os separa.

### P1-2 — PayFlow: uma chave estática para quatro papéis

A mesma `PAYFLOW_INTEGRATION_API_KEY` serve para:

1. SIGA → PayFlow, sincronização (`src/features/finance/payflow-sync-execute.ts:24`,
   `src/features/finance/server.ts:2988`);
2. PayFlow → SIGA, **liquidação**: `payflowSettlementAuthorized`
   (`src/features/finance/payflow-settlement.ts:23-30`) aceita `Bearer <chave>` e
   `applyPayflowSettlement` emite recibo e dá como paga qualquer fatura de qualquer escola, com
   `school_id` e `invoice_id` do corpo (linhas 32-60);
3. **entrada humana** na consola do PayFlow:
   `painel/payflow/app/api/v1/admin/login/route.ts:44-133` cria uma sessão de 8 h como
   `finance_admin` da escola indicada (ou da primeira, sem `school_id`), com identidade fixa
   `admin_user` e sem 2FA;
4. assinaturas SaaS (`src/features/saas/subscription-server.ts:296`).

Quem tiver a chave (segredos do GitHub, dois Workers, `.env` de quem desenvolve) pode dar
propinas como pagas em qualquer escola e operar o PayFlow como administrador de qualquer
escola, sem rasto individual. Isto contradiz a regra do
[FINANCE_MASTER](../specs/finance/FINANCE_MASTER_2026.md) «nada aparece como pago sem
confirmação do fornecedor»: a «confirmação» é uma cadeia de caracteres partilhada. (O modo por
omissão é produção e o atalho `admin` só existe em sandbox explícito — verificado em
`painel/payflow/lib/runtime.ts`.)

**Correcção**

1. Uma chave por direcção e finalidade (sincronização SIGA→PayFlow, liquidação PayFlow→SIGA).
2. Liquidação assinada com HMAC, carimbo temporal e `payment_id` — reutilizar o esquema que o
   SIGA já tem para o EMIS (`src/features/finance/gateway-webhook-signature.ts`).
3. Desligar a entrada por chave fora do sandbox: o `/api/v1/sso/exchange` (HMAC, `aud`, `exp`,
   `jti` contra repetição) já existe e é o caminho certo.
4. Rodar a chave depois da separação. Teste: liquidação sem assinatura válida → 401.

### P1-3 — A chave de serviço da produção num segundo backend (app Android)

- `.github/workflows/estudo-yft-siga.yml:70-80` põe a `SUPABASE_SERVICE_ROLE_KEY` no Worker
  `estudo/yft-school-system/school-worker` (`siga-yft`, numa conta `workers.dev` pessoal,
  segundo o handoff de 26/10). Esse Worker reimplementa o âmbito — escola, educando,
  professor — com a chave de serviço (`school-worker/src/sga/rest.ts`,
  `school-worker/src/api/sga.ts:48-62`).
- Divergências encontradas: valida o token só em `/auth/v1/user` e **não aplica a confirmação
  2FA no login** (`assertSessionMfa` no SIGA; no Worker não há nenhuma referência a `aal` ou
  MFA) — um token aal1 de uma conta que activou a confirmação é aceite. Também não aplica o
  bloqueio de escola suspensa nem as permissões por módulo. Cada regra nova do SIGA tem de ser
  duplicada noutra base de código, com outros testes e noutra pasta chamada «estudo».
- A chave secreta foi colada numa conversa a 26/10 e não há registo de rotação (21, decisão 2).

**Correcção:** rodar já a chave secreta (nova `sb_secret_…`, actualizar o Worker do SIGA e o
GitHub, revogar a antiga). Levar a app Android para as rotas do SIGA que já existem
(`/api/mobile/absences`, `agenda`, `attendance`, `grades`, `login`, `notifications`,
`presence`, `profile`, `work`) e retirar a chave do Worker do estudo. Até lá, aplicar no
`sga.use('*')` a mesma regra de 2FA (claim `aal` + factores e preferência pela API de
administração).

### P2-1 — Tokens de agentes de IA (OAuth do Supabase + `/mcp`) com o poder da sessão inteira

- O build publica `/mcp` (`src/routes/mcp.ts`, emissor = Supabase Auth, audiência
  `authenticated`) e o consentimento `/.lovable/oauth/consent`
  (`src/routes/[.]lovable.oauth.consent.tsx`). Segundo a
  [documentação do Supabase](https://supabase.com/docs/guides/auth/oauth-server/token-security),
  o token emitido a um cliente OAuth é um JWT normal do projecto, com `role: authenticated`,
  `aal` e uma claim `client_id`, e «as políticas RLS existentes continuam a funcionar».
- `requireSupabaseAuth` (`src/integrations/supabase/auth-middleware.ts:186-199`) aceita qualquer
  JWT válido do projecto e não olha para `client_id`. O token de um agente abre assim as 571
  server functions e o PostgREST, incluindo as escritas permitidas em AAL1 (excepção de
  matrícula, regra 6c-a). O ecrã diz «poderá **consultar** o SIGA Plus em seu nome» e mostra só
  `client.name` — escolhido por quem regista o cliente — sem o destino de regresso.
- Menores: `trustForwardedHost: true` em `src/routes/mcp.ts` (a Cloudflare não remove
  `X-Forwarded-Host`, por isso o metadado do recurso pode ser construído com um anfitrião do
  cliente); o servidor MCP apresenta-se como «Edu's Code Mirror» (`src/lib/mcp/index.ts:9-10`).

**Correcção:** no middleware, recusar tokens com `client_id` fora de uma lista explícita de
funções só de leitura; nas políticas de escrita, `and (auth.jwt() ->> 'client_id') is null`; no
consentimento, mostrar o anfitrião do `redirect_uri` e avisar que o agente actua como a
pessoa; desligar o registo dinâmico de clientes se não for preciso; `trustForwardedHost: false`;
dar ao servidor o nome do produto. Se a funcionalidade não é usada, retirar o plugin e as rotas.

### P2-2 — Publicação: segredos da produção expostos a todas as dependências de build

- O passo «Publicar» de `.github/workflows/deploy-production.yml` (linhas 163-228) corre os
  builds das cinco apps — cinco árvores de dependências (`bun.lock` e quatro `package-lock.json`)
  — com cerca de 40 segredos no ambiente: chave de serviço, segredo JWT, pepper do OTP, Twilio,
  WhatsApp, chave da conta de serviço Google, Zoho… Qualquer pacote comprometido que corra no
  build lê `process.env` e leva tudo.
- Agravantes: `bun-version: latest` em 8 workflows (também no deploy); acções de terceiros por
  etiqueta móvel (`oven-sh/setup-bun@v2`, `cloudflare/wrangler-action@v4`,
  `tauri-apps/tauri-action@v0`, `subosito/flutter-action@v2`, `dtolnay/rust-toolchain@stable`);
  5 workflows sem bloco `permissions:`; o ambiente de onde saem os segredos vem de uma variável
  do repositório (`DEPLOY_ENVIRONMENT`).

**Correcção:** separar o build (sem segredos, artefacto) da publicação (só `wrangler`, com os
segredos do Worker num passo próprio, por exemplo `wrangler secret bulk`); fixar acções por SHA
e a versão do bun; `permissions: contents: read` por omissão em todos os workflows; regras de
protecção no ambiente `production`.

### P2-3 — Webhook EMIS/Unitel: limite por IP antes da assinatura e verificação O(N)

- `runFinanceGatewayWebhook` (`src/features/finance/gateway-webhook-handler.ts:695-754`) gasta o
  limite de 30 pedidos/5 min **por IP antes de verificar a assinatura**. O fornecedor envia as
  confirmações de todas as escolas a partir de poucos IPs: no pico do início do mês, as
  confirmações legítimas recebem 429 e ficam à espera das repetições do fornecedor.
- `resolveGatewaySchoolBySignature` (linhas 60-99) lê todas as integrações configuradas, com o
  segredo em JSON, e calcula um HMAC por chave de cada escola em cada pedido.

**Correcção:** o emissor envia um identificador da chave (por exemplo `X-SIGA-Key-Id` = id da
integração) e o SIGA verifica um só HMAC; o limite por IP passa a contar só as assinaturas
falhadas; depois de verificada, aplica-se um limite por escola.

### P3-1 — Permissões por módulo gravam numa escola suspensa

`setStaffModuleGrant` e `clearStaffModuleGrant` (`src/features/access/grants.ts:69` e `:115`)
usam `requireSgaWriter` simples, que não chama `assertTenantAllowsWrites` (só as variantes
`…ForWrite` o fazem). O contrato `tests/security/module-grant-enforcement.test.ts:165` não cobre
`src/features/access`. Correcção: chamar `assertTenantAllowsWrites(membership.schoolId)` nas
duas funções e incluir `access` no contrato.

### P3-2 — O registo dos documentos emitidos vive na auditoria

A verificação pública `/verificar` lê `audit_logs` por `metadata->>'code'`
(`src/features/documents/verification.ts:246-300`). Mistura auditoria com uma entidade de
negócio: uma política de retenção da auditoria tornaria documentos válidos inverificáveis; o
índice não é único; e duas migrações criam o mesmo índice (`20261013100000`, `20261022081401`).
Correcção: tabela `issued_documents` (código `UNIQUE`, escola, metadados mínimos), por migração
aditiva com cópia dos registos existentes.

### P3-3 — Arquitectura e processo

- **A autorização vive no código.** 171 ficheiros usam a chave de serviço; a RLS só protege o
  acesso directo pela API do Supabase. O contrato de autenticação existe e funciona
  (`server-fn-guards.test.ts`); falta o equivalente para âmbito e para o bloqueio de escrita
  das escolas suspensas. Continuar o ARQ-01 (leituras com `context.supabase`), começado em
  `grants.ts`.
- **Sem pré-produção para SQL.** Lovable ligado à produção, SQL aplicado à mão no SQL Editor,
  deploy contínuo a cada merge e nenhum staging (o branching do Supabase exige o plano Pro). O
  P0 é a consequência directa.
- **Fontes de verdade a mais para o esquema:** 274 migrações, 28 em `migrations-lovable-nao-aplicar`,
  24 do Drizzle, 21 ficheiros `.sql` na raiz de `supabase/`, 30 `SIGA_aplicar_*.sql` em
  `docs/agents/` e `all_migrations_combined.sql` na raiz. Saber o que está aplicado exige
  arqueologia. Proposta: só `supabase/migrations`, com o registo `schema_migrations` da base e
  uma página de estado gerada.
- **Memória em documentos.** 218 documentos (40 mil linhas) e um `CONTINUE.md` de 6 117 linhas
  são lidos como instruções por agentes; o volume já produz contradições e decisões enterradas.
  Proposta: `CONTINUE.md` só com o estado vivo (menos de 200 linhas) e o histórico arquivado
  por data.
- **Dispersão:** dois clientes móveis (`mobile-flutter/` e `estudo/yft-school-system/`) com
  dois backends, desktop Tauri, cinco apps web, três gestores de pacotes e 10 lockfiles. Cada
  peça a mais é mais uma superfície para os achados P1.
- **Truque dos tipos:** `moduleSuffixes: [".sga", ""]` no `tsconfig.json` impede o Lovable de
  sobrescrever os tipos, mas aplica-se a todos os imports do projecto. Funciona; manter
  documentado e testado.

## O que está bem

- Autenticação: 571 das 587 server functions com `requireSupabaseAuth`, contrato no CI e as 16
  públicas justificadas; recuo local do JWT só com assinatura verificada (falha fechada).
- Webhooks EMIS, Resend, Twilio e WhatsApp com assinatura, comparação em tempo constante,
  limite de corpo e limite de pedidos; cron com segredo de 24+ caracteres.
- Falhas fechadas onde importa: 2FA sem confirmação, permissões por módulo, bloqueio de escrita
  das escolas, PayFlow em produção por omissão.
- Verificação pública de documentos com código de 40 bits, limite por IP e titular mascarado.
- Suite de 6 418 testes, `tsc` e lint limpos, auditoria de dependências sem alertas altos.

## Ordem sugerida

| Quando        | O quê                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| Hoje          | P0 (confirmar as funções; aplicar se faltarem); rodar a chave secreta do Supabase (P1-3)   |
| Esta semana   | P1-2 (chaves do PayFlow separadas, liquidação assinada, sem entrada por chave); P3-1; P2-1 |
| Este mês      | P2-2 (pipeline); P2-3 (webhook); app Android nas rotas `/api/mobile/*` (P1-3)              |
| Próximo ciclo | P1-1 (sessão HttpOnly/BFF e CSP obrigatória); portão de esquema no deploy; P3-2; P3-3      |

## Limites desta análise

- **Sem acesso à base de produção:** o conector Supabase desta sessão só vê um projecto inactivo
  e outro sem relação com o SIGA — o projecto SGA não aparece. Nada sobre a produção (funções,
  RLS, Advisor) foi verificado; o P0 está provado pelo código e pelo registo do repositório,
  não pela base.
- **Sem pedidos à produção** (`portal-siga.com`, `*.pages.dev`, PayFlow) e sem reverificar a
  zona Cloudflare.
- **Servidor OAuth do Supabase:** não verifiquei se está activo no projecto; as rotas estão no
  build. O comportamento dos tokens vem da documentação do Supabase.
- Medido com Node 22.23 (o README pede Node 24; o CI usa 24): testes, `tsc`, lint e build
  passaram.
- A procura de falhas de âmbito entre escolas foi heurística (consultas por `id` sem
  `school_id`): os casos vistos eram linhas já validadas antes. Não é prova de ausência.
