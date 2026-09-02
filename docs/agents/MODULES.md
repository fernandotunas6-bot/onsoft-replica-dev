# Mapa de módulos SIGA

Fonte de verdade do inventário: [`scripts/siga/modules.json`](../../scripts/siga/modules.json).  
Navegação (sidebar + launcher): [`src/features/auth/navigation-catalog.ts`](../../src/features/auth/navigation-catalog.ts) + [`portal-engine.ts`](../../src/features/auth/portal-engine.ts).  
Ecossistema (WEB / ADMIN / SIGA / DOC): [`ARCHITECTURE_HARMONIZATION.md`](./ARCHITECTURE_HARMONIZATION.md).

| id            | Skill                 | Sidebar (`navPath`)     | Rotas principais                                      |
| ------------- | --------------------- | ----------------------- | ----------------------------------------------------- |
| dashboard     | `siga-dashboard`      | `/`                     | `/`                                                   |
| alunos        | `siga-alunos`         | `/alunos`               | `/alunos`, `/alunos/$id`                              |
| pessoas       | `siga-pessoas`        | `/pessoas`              | `/pessoas`, `/professores/$id`                        |
| pedagogica    | `siga-pedagogica`     | `/pedagogica`           | `/pedagogica`, `/relatorios/academicos`               |
| lesson-plans  | `siga-lesson-plans`   | `/planos-aula`          | `/planos-aula`                                        |
| calendario    | `siga-calendario`     | `/calendario`           | `/calendario`, `/calendario/ics`                      |
| financeiro    | `siga-financeiro`     | `/financeiro`           | `/financeiro`, `/faturas`, `/relatorios/financeiros`  |
| documentos    | `siga-documentos`     | `/documentos`           | `/documentos`                                         |
| arquivos      | `siga-arquivos`       | `/arquivos`             | `/arquivos`                                           |
| importar      | `siga-importar`       | `/importar`             | `/importar`                                           |
| comunicacoes  | `siga-comunicacoes`   | `/comunicacoes`         | `/comunicacoes`                                       |
| catracas      | `siga-catracas`       | `/catracas`             | `/catracas`                                           |
| acessos       | `siga-acessos`        | `/acessos`              | `/acessos`, `/alterar-senha`                          |
| matricula     | `siga-matricula`      | Definições → matrícula  | `/matricula/$slug` (público)                          |
| integracoes   | `siga-integracoes`    | Definições → integrações| waffle + settings                                     |
| saas          | `siga-saas`           | — (ADMIN / WEB)         | `/saas-admin`, `/criar-escola`                        |

## Navegação

- **Sidebar:** `getPortalNavigation()` filtra por papel, grants e plano.
- **Launcher (waffle):** `WORKSPACE_MODULE_SPECS` → ícones premium em `app-marks.tsx`.
- **Auditoria:** `npm run siga:check-nav` (testes em `tests/auth/navigation-catalog.test.ts`).
- **Inventário + nav:** `npm run siga:check`.
- **Rotas UI:** `src/features/auth/route-inventory.ts` — prefixos conhecidos; DOC: [Navegação SIGA](/siga/navegacao).

Logótipo da escola: **apenas** no topo da sidebar — nunca como ícone decorativo em cartões ou launcher.

## Integrações (catalog-ready)

- Pacotes e capacidades: `features/integrations/install.ts`
- Acções in-app: `features/integrations/actions.ts` + `InstalledModuleTools`
- Instalar/revogar: `features/integrations/server.ts` → `school_integrations`
- Testes: `tests/integrations/install.test.ts`, `launcher.test.ts`, `actions.test.ts`

## Padrão de pastas

```
src/features/<id>/schemas.ts
src/features/<id>/server.ts
src/routes/<rota>.tsx
tests/<id>/schemas.test.ts
.cursor/skills/siga-<id>/SKILL.md
```

Criar o próximo: `npm run siga:scaffold -- <id> --with-page`.
