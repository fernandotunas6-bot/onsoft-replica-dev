---
name: siga-docs
description: >-
  Extends the SIGA Plus documentation site (painel/docs): manuals, API,
  architecture, changelog. Use when editing VitePress pages, sidebar, or
  help links from SIGA/WEB/ADMIN to DOC.
---

# DOC — documentação do ecossistema

Arquitectura: [ARCHITECTURE_HARMONIZATION.md](../../../docs/agents/ARCHITECTURE_HARMONIZATION.md).
Skill de limites: `siga-ecosystem`.

- Pasta: `painel/docs`
- Stack: VitePress + Vue 3 (preservar tema/frontend)
- Dev: `npm run dev` → `:5173`
- Config: `.vitepress/config.ts`

## Responsabilidade

Documentar SIGA Plus, Admin SaaS, WEB, APIs, arquitectura, BD, integrações,
manuais, changelog, políticas. Links a partir do SIGA devem abrir o **artigo**
(ex. pautas → `docs/.../siga/pautas`), não um duplicado dentro do SIGA.

## Organização alvo

`SIGA Plus` · `SaaS Admin` · `WEB` · `API` · `Arquitetura` · `Integrações` ·
`Changelog`

Manuais ecossistema: `painel/docs/web/`, `painel/docs/admin/`, `painel/docs/siga/`, `painel/docs/arquitetura/`.

## Não fazer aqui

UI operacional ou comercial. Não copiar o design do SIGA/WEB/ADMIN.
Não reescrever o tema VitePress para unificar visual.

## Estado (auditoria)

- Manuais reais: `/siga/navegacao`, `/guide/features`, `/guide/project-structure`, `/guide/installation`, `/guide/sql-sga`, `/guide/choosing-framework`, `/guide/tech-stack`, `/admin/*`, `/web/*`, `/arquitetura/*`, `/integracoes/*`.
- Links no SIGA: `DOC_PATHS` + `getSigaNavDocUrl()` + `DocHelpButton` (módulos com PageHeader + alunos/pessoas).
- Secções `/vite/`, `/nextjs/`, `/components/`, `/theme-customizer/` ainda são template UI — não as tratar como mapa do produto.