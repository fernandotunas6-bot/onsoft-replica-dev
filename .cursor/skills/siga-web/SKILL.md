---
name: siga-web
description: >-
  Extends the SIGA Plus public commercial site (painel/web): landing,
  pricing, FAQ, contact, and the school-creation wizard. Use when editing
  painel/web, /landing, /pricing, /start, or marketing/onboarding UX.
---

# WEB — portal público

Arquitectura: [ARCHITECTURE_HARMONIZATION.md](../../../docs/agents/ARCHITECTURE_HARMONIZATION.md).
Skill de limites: `siga-ecosystem`.

- Pasta: `painel/web`
- Stack: Vite 7 + React 19 + React Router 7 + Tailwind 4 + shadcn
- Dev: `npx vite --port 5174` (não 5173 — colide com DOC)
- Rotas: `src/config/routes.tsx`

## Responsabilidade

Venda e aquisição: apresentação, planos, preços, demo, contacto, FAQ,
**wizard criar escola** (`/start`). Design, tipografia e
componentes **deste** app — nunca os do SIGA.

## Não fazer aqui

Operação escolar (alunos, notas, propinas). Painel SaaS global (isso é ADMIN).
Importar componentes de `src/` (SIGA) ou `painel/admin`.

## Estado (auditoria)

`/` é a landing. Wizard em `/start`. Signup: `POST {SIGA}/api/saas/signup`.
Superfícies vivas: `/dashboard` (visitante), `/pricing`, `/faqs`, `/tasks`
(checklist), `/mail` (contacto), `/chat` (ajuda), `/users` (personas).
Manual DOC: `painel/docs/web/criar-escola.md`.
