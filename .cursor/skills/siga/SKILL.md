---
name: siga
description: >-
  Guides work on SIGA, the Angolan school-management app (TanStack Start,
  Supabase SGA). Use when the user mentions SIGA, gestão escolar, turmas,
  matrícula, tesouraria, Multicaixa, or asks to continue, scaffold a module,
  apply SQL, or hand off to another agent.
---

# SIGA — sistema de gestão escolar

Ler primeiro [docs/agents/CONTINUE.md](../../../docs/agents/CONTINUE.md).
Ecossistema (WEB / ADMIN / SIGA / DOC): [ARCHITECTURE_HARMONIZATION.md](../../../docs/agents/ARCHITECTURE_HARMONIZATION.md) e skill `siga-ecosystem`.
Inventário: [scripts/siga/modules.json](../../../scripts/siga/modules.json).

## Sempre

- Estender, não reescrever páginas/schemas/server existentes.
- Node 24 (`v26` aborta com `dyld libc++`, exit 134).
- Não aplicar migrações Lovable ao SGA. SQL: `npm run siga:sql`.
- Não commitar `.env`. Não force-push (Lovable).
- Tabelas novas: `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql`.
- Tipografia: só Inter, pesos 400 (texto), 500 (rótulos/navegação) e 600 (títulos). `font-bold`/`extrabold`/`black` estão limitados a 600 em `styles.css` — não reintroduzir 700/800 nem outra família. Sem títulos em maiúsculas espaçadas (`uppercase tracking-*`); `uppercase` só em campos que normalizam códigos. A mesma regra vale nos portais `painel/`.
- Ícones: um conceito, um ícone. Módulos, acções e estados vêm de `src/lib/app-icons.ts` (Lucide, traço 1,8). Em chips usar `IconChip`. Exportação oficial = `actionIcons.officialExport` (não `Award`). `tests/ui/app-icons.test.ts` bloqueia colisões.

## Auto-construção

```sh
npm run siga:check
npm run siga:sql
npm run siga:scaffold -- <id> [--route=/caminho] [--with-page]
```

Depois do scaffold: ligar tabela SGA real, path em `access-policy.ts`, teste Zod.

## Skill por módulo

Abrir o skill do módulo antes de editar (`.cursor/skills/siga-<id>/SKILL.md`).

| Módulo                | Skill               |
| --------------------- | ------------------- |
| Dashboard / professor | `siga-dashboard`    |
| Alunos                | `siga-alunos`       |
| Pessoas / docentes    | `siga-pessoas`      |
| Pedagógica / turmas   | `siga-pedagogica`   |
| Tesouraria            | `siga-financeiro`   |
| RH / Folha salarial   | `siga-rh`           |
| Documentos            | `siga-documentos`   |
| Calendário / ICS      | `siga-calendario`   |
| Comunicações          | `siga-comunicacoes` |
| Acessos / 2FA         | `siga-acessos`      |
| Matrícula pública     | `siga-matricula`    |
| Integrações           | `siga-integracoes`  |
| Arquivos              | `siga-arquivos`     |
| Desktop Tauri         | `siga-desktop`      |
| Ecossistema 5 apps    | `siga-ecosystem`    |
| WEB comercial         | `siga-web`          |
| ADMIN SaaS            | `siga-admin`        |
| DOC                   | `siga-docs`         |
| Backend SaaS (ainda no SIGA) | `siga-saas`  |

## Stack

TanStack Start + Router + React Query + Zod + `createServerFn`. Escrita SGA com `loadSgaAdminClient`. Papel e escola: `requireSgaWriterFor("<módulo>", …)` em leituras e `requireSgaWriterForWrite("<módulo>", …)` em escritas — aplicam as permissões por módulo ("Nenhum" e "Leitura") no servidor. Listas: `usePersistedListFilters` + `ListFilterBar`. Modais grandes: `SequentialSheetModal`.

Integrações: instalar no waffle/definições → `grantedCapabilities` em `school_integrations` → botões via `InstalledModuleTools` / `hasCapability`. Sem HTTP a terceiros; rotas públicas só recebem `installedProviders` + contactos filtrados (`publicSchoolPhone` / `publicSchoolEmail`).
