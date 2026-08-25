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
Inventário: [scripts/siga/modules.json](../../../scripts/siga/modules.json).

## Sempre

- Estender, não reescrever páginas/schemas/server existentes.
- Node 24 (`v26` aborta com `dyld libc++`, exit 134).
- Não aplicar migrações Lovable ao SGA. SQL: `npm run siga:sql`.
- Não commitar `.env`. Não force-push (Lovable).
- Tabelas novas: `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql`.

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
| Documentos            | `siga-documentos`   |
| Calendário / ICS      | `siga-calendario`   |
| Comunicações          | `siga-comunicacoes` |
| Acessos / 2FA         | `siga-acessos`      |
| Matrícula pública     | `siga-matricula`    |
| Integrações           | `siga-integracoes`  |
| Arquivos              | `siga-arquivos`     |

## Stack

TanStack Start + Router + React Query + Zod + `createServerFn`. Escrita SGA com `loadSgaAdminClient`. Listas: `usePersistedListFilters` + `ListFilterBar`. Modais grandes: `SequentialSheetModal`.

Integrações: instalar no waffle/definições → `grantedCapabilities` em `school_integrations` → botões via `InstalledModuleTools` / `hasCapability`. Sem HTTP a terceiros; rotas públicas só recebem `installedProviders` + contactos filtrados (`publicSchoolPhone` / `publicSchoolEmail`).
