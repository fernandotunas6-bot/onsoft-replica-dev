# Vias de publicação do ecossistema SIGA Plus

Actualizado a 30/10/2026. Cobre a publicação do código (DOC, WEB, ADMIN, PAYFLOW + D1, SIGA)
na Cloudflare e a aplicação de SQL na base de produção (Supabase `Sga`).

## Resumo

| Via                               | Quando                                          | Precisa de                      |
| --------------------------------- | ----------------------------------------------- | ------------------------------- |
| 1. Contínua (GitHub Actions)      | Sempre: cada merge na `main` publica sozinho    | 3 segredos no GitHub            |
| Vigilância (watchdog)             | De 2 em 2 horas e no fim de cada publicação     | nada além do `GITHUB_TOKEN`     |
| 2. «Run workflow» com apps        | Republicar só parte (ex.: `siga,payflow`)       | os mesmos segredos              |
| 3. Emergência, do computador      | GitHub parado ou sem token                      | `npx wrangler login` + `.env`   |
| 4. Sessão do Claude Code na cloud | Só se configurada (não está)                    | rede + segredos do ambiente     |
| 5. Cloudflare Workers Builds      | Alternativa ao GitHub Actions (não configurada) | ligação Git na Cloudflare       |
| Base de dados                     | Sempre manual e revista                         | SQL Editor ou conector Supabase |

Para saber que versão está no ar:

```bash
curl -sI https://portal-siga.com/ | grep -i x-siga-release
```

Devolve o commit publicado do SIGA. Termina em `-dirty` se a publicação foi feita à mão com
alterações por gravar. Publicações anteriores a 30/10 não têm este cabeçalho.

## 1. Via contínua — GitHub Actions

`.github/workflows/deploy-production.yml` corre a cada push para a `main`, excepto commits só
de `docs/**` ou `*.md`:

1. **Verificar antes de publicar:** contratos SQL, `typecheck`, `lint` e `test`.
2. **Publicar na Cloudflare**, no ambiente `production`:
   1. confirma que os segredos obrigatórios existem;
   2. pergunta à Cloudflare se o token está activo e tem acesso à conta, e diz em português o
      que corrigir;
   3. instala dependências e corre `scripts/deploy-all.mjs`;
   4. confirma o DNS e que o SIGA e o PayFlow respondem.

Uma publicação de cada vez, nunca cancelada a meio.

**Segredos obrigatórios** (Settings → Secrets and variables → Actions → _Repository secrets_,
ou Settings → Environments → `production`; o do ambiente prevalece quando há os dois):

| Nome                                                   | Onde se obtém                                                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                                 | Cloudflare → My Profile → API Tokens → Create Token (modelo _Edit Cloudflare Workers_ + Pages Edit + D1 Edit; sem filtro de IP nem data de fim) |
| `CLOUDFLARE_ACCOUNT_ID`                                | Cloudflare → Workers & Pages → coluna da direita, _Account ID_                                                                                  |
| `SUPABASE_SERVICE_ROLE_KEY` (ou `SUPABASE_SECRET_KEY`) | Supabase → projecto `Sga` → Project Settings → API Keys → _service_role_                                                                        |

Os segredos opcionais (Resend, AppyPay, WhatsApp…) estão em `scripts/worker-secrets.mjs`.
Vazios não apagam o valor que já está no Worker.

## Vigilância do deploy contínuo

`.github/workflows/deploy-watchdog.yml` (script `scripts/siga/deploy-watchdog.mjs`):

- corre de 2 em 2 horas (`:41`), no fim de cada «Deploy produção» e à mão (_Run workflow_);
- compara `x-siga-release` com a `main`. Também conta como em dia uma diferença só em
  documentação;
- se a última publicação falhou **a publicar**, volta a correr só os jobs que falharam, no
  máximo uma vez por verificação e 90 minutos depois da tentativa anterior. Ao fim de 10
  tentativas pede uma execução nova;
- **não repete** quando falharam os testes, os tipos ou o lint, porque isso é do código;
- mantém aberta a issue **«Deploy de produção parado»** (etiqueta `deploy-parado`) com o passo
  que falhou e o que corrigir, e fecha-a quando a produção apanhar a `main`;
- não usa segredos de produção e não publica nada por si.

Corrigido um segredo, a produção apanha a `main` sozinha em menos de 2 horas. Para não
esperar, corra «Deploy contínuo — vigilância» à mão.

Ensaio local, só de leitura (não repete nada nem mexe em issues):

```bash
DEPLOY_WATCHDOG_DRY_RUN=1 GITHUB_REPOSITORY=fernandotunas6-bot/onsoft-replica-dev node scripts/siga/deploy-watchdog.mjs
```

## 2. Republicar só algumas apps

Actions → **Deploy produção** → **Run workflow** → `apps`: `all` (por omissão), ou uma lista
com `siga`, `payflow`, `web`, `admin`, `docs` (ex.: `siga,payflow`). Um nome errado recusa
antes de publicar. As verificações correm na mesma.

## 3. Emergência a partir de um computador, sem API token

Para quando o GitHub Actions está parado ou não há token válido. Usa a sessão do navegador
da Cloudflare em vez de um API Token.

Antes de publicar:

- ter um clone **actualizado da `main`, sem alterações por gravar** (senão o cabeçalho leva
  `-dirty` e a vigilância trata a produção como desactualizada);
- ter Node 24 e bun;
- ter um `.env` na raiz, nunca versionado, com `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.

Actualizar o clone:

```bash
git checkout main && git pull
```

Instalar as dependências do SIGA e dos painéis:

```bash
bun install --frozen-lockfile && npm ci --prefix painel/web && npm ci --prefix painel/admin && npm ci --prefix painel/docs && npm ci --prefix painel/payflow
```

Correr as mesmas verificações do CI:

```bash
bun run typecheck && bun run lint && bun run test
```

Entrar na Cloudflare pelo navegador:

```bash
npx wrangler login
```

Publicar (aqui só o SIGA e o PayFlow; `all` publica tudo):

```bash
SIGA_DEPLOY_AUTH=wrangler-login SIGA_DEPLOY_APPS=siga,payflow node scripts/deploy-all.mjs
```

`SIGA_DEPLOY_AUTH=wrangler-login` tira do ambiente do wrangler qualquer token antigo e é
recusado dentro do GitHub Actions.

## 4. Sessões do Claude Code na cloud (não configurada)

Hoje as sessões não chegam à Cloudflare: a política de rede bloqueia `api.cloudflare.com` e não
há token no ambiente. Para as habilitar como via de emergência:

- no ambiente cloud, permitir `api.cloudflare.com` (Network access);
- guardar `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e as chaves do Supabase como segredos
  do ambiente;
- usar o mesmo comando da via 3, sem `SIGA_DEPLOY_AUTH`.

Recomendado só para emergências: o caminho normal continua a ser a via 1.

## 5. Cloudflare Workers Builds (alternativa, não configurada)

A Cloudflare pode construir e publicar a partir do GitHub sem segredos no GitHub (Workers &
Pages → Worker → Settings → Build → _Connect to Git_). Não está configurada, e não deve
coexistir com a via 1 para o mesmo Worker: as duas publicariam em corrida. Se um dia substituir
a via 1:

- o comando de publicação do SIGA tem de ser `node scripts/deploy-cf.mjs`, que dá o nome do
  Worker, as `vars`, o `keep_vars` e os segredos;
- as verificações (`typecheck`, `lint`, `test`) passam a ter de entrar no comando de build;
- o PayFlow precisa das migrações D1 antes do Worker (`scripts/deploy-all.mjs`, passo 4).

## Base de dados (Supabase `Sga`)

As migrações **não** são aplicadas automaticamente, de propósito. A base é a das escolas reais
(`docs/agents/DATABASE_RULES.md`) e `supabase/migrations` inclui capturas que não se aplicam às
cegas.

1. Cada alteração vem num pacote `docs/agents/SIGA_aplicar_*.sql`: idempotente, ensaiado em
   PGlite (`tests/sql/`) e com uma consulta de confirmação no fim.
2. Aplica-se de uma de duas formas, sempre com autorização do dono:
   - no **Supabase → SQL Editor** (colar o pacote → Run);
   - por uma sessão do Claude Code com o **conector Supabase** (`apply_migration` / `execute_sql`
     no projecto `xodgfmxiaunpamctfeea`).
3. Confirma-se com a consulta do fim do pacote e com `docs/agents/SIGA_confirmar_migracoes.sql`
   (tudo «aplicada»).
4. Código que dependa de SQL novo só entra na `main` depois de o SQL estar aplicado:
   `scripts/siga/check-release-contracts.mjs` recusa publicar sem isso.

## Diagnóstico rápido

| Sintoma (log ou issue)                                               | Causa                                                                              | Correcção                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| «Falta o segredo … no ambiente GitHub 'production'»                  | Segredo apagado, noutro repositório ou no separador errado (Codespaces/Dependabot) | Criar em _Actions_ → Repository secrets (ou Environments → production) |
| «A Cloudflare não aceita este token» / `Invalid access token [9109]` | Token revogado, expirado, colado com espaços, ou Global API Key                    | Criar um API Token novo e substituí-lo no GitHub                       |
| «Token activo mas não tem acesso à conta»                            | _Account Resources_ do token sem a conta do SIGA                                   | Editar o token na Cloudflare                                           |
| Falhou «Verificar antes de publicar»                                 | Testes, tipos ou lint partidos na `main`                                           | Corrigir o código (a vigilância não repete)                            |
| «PayFlow ou SIGA não respondem»                                      | Publicado, mas o serviço não arranca                                               | Health do PayFlow e logs do Worker na Cloudflare                       |
| `x-siga-release` diferente da `main` sem issue aberta                | A vigilância ainda não correu                                                      | Correr «Deploy contínuo — vigilância» à mão                            |
