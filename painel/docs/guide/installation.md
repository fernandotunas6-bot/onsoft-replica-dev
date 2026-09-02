# Instalação e arranque local

Como preparar o monorepo **SIGA Plus** (WEB + ADMIN + SIGA + DOC) em desenvolvimento.

::: tip Produção
Escolas novas entram pelo wizard WEB (`/start`), não por «pedido de licença» fictício.
Operadores SaaS usam o **ADMIN** (`platform_admins`).
:::

---

## Requisitos

| Item | Valor |
| --- | --- |
| **Node.js** | **24** LTS (`nvm use 24`) — Node 26 pode falhar neste macOS (`dyld libc++`) |
| **Base de dados** | Projecto Supabase SGA (`xodgfmxiaunpamctfeea`) |
| **Gestor** | `npm` / `bun` (CI usa Bun) |

```bash
cd onsoft-replica-dev
npm install
```

---

## Variáveis de ambiente

Copie `.env.example` → `.env` na raiz. Campos essenciais:

```env
VITE_SUPABASE_URL=https://….supabase.co
VITE_SUPABASE_ANON_KEY=…
SUPABASE_SECRET_KEY=…          # server / provisioning
VITE_WEB_URL=http://localhost:5174
VITE_SIGA_URL=http://localhost:3006
VITE_ADMIN_URL=http://localhost:3005
VITE_DOCS_URL=http://localhost:5173
```

Propagar para WEB e ADMIN:

```bash
npm run siga:sync-env
```

Não commitir `.env`.

---

## SQL no SGA

Checklist completo: **[SQL SGA — checklist operacional](/guide/sql-sga)**.

No SQL Editor do projecto SGA, **nesta ordem**:

1. `supabase/APPLY_IN_SQL_EDITOR.sql`
2. `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql`
3. `supabase/APPLY_SAAS_PLATFORM.sql` (tenants / platform_admins)

```bash
npm run siga:sql           # checklist no terminal
npm run siga:sql:verify    # smoke das tabelas (com secret)
```

**Nunca** aplicar `all_migrations_combined.sql` nem `pending_feature_migrations.sql` ao SGA.

---

## Arranque

```bash
# Quatro apps
npm run dev:ecosystem

# Ou individualmente
npm run dev                 # SIGA :3006
cd painel/web && npm run dev
cd painel/admin && npm run dev
cd painel/docs && npm run dev
```

| App | Porta | Função |
| --- | --- | --- |
| WEB | 5174 | Comercial / criar escola |
| ADMIN | 3005 | Control Center SaaS |
| SIGA | 3006 | Operação escolar |
| DOC | 5173 | Este site |

---

## Validação

```bash
npm run siga:check          # inventário + navegação
npm test                    # Vitest (Node 24)
```

Criar escola de teste: WEB → `/start` → API `/api/saas/signup` → login no SIGA.

---

## Próximos passos

- [Navegação SIGA](/siga/navegacao)
- [Funcionalidades & permissões](/guide/features)
- [Estrutura do projecto](/guide/project-structure)
- [Arquitetura](/arquitetura/)
- [Criar escola (WEB)](/web/criar-escola)
- [Control Center (ADMIN)](/admin/control-center)
