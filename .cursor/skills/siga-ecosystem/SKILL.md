---
name: siga-ecosystem
description: >-
  Defines the SIGA Plus five-app ecosystem (WEB, ADMIN, SIGA, PAYFLOW, DOC):
  responsibilities, URLs, tenant provisioning, and what must not move
  between apps. Use when working across painel/web, painel/admin,
  painel/docs, saas-admin, criar escola, billing SaaS, landing, or architecture.
---

# Ecossistema SIGA Plus

Ler primeiro [docs/agents/ARCHITECTURE_HARMONIZATION.md](../../../docs/agents/ARCHITECTURE_HARMONIZATION.md).

```text
WEB vende.    ADMIN controla.    SIGA trabalha.    PAYFLOW cobra.    DOC explica.
```

| App | Pasta | Porta | Faz | Não faz |
| --- | ----- | ----- | --- | ------- |
| WEB | `painel/web` | 5174 | Landing, planos, wizard criar escola | Alunos, notas, tesouraria escolar |
| ADMIN | `painel/admin` | 3005 | Tenants, billing SaaS, domínios | Pautas, propinas, operação diária |
| SIGA | raiz `/` | 3006 | Operação da escola já criada | Pricing, signup comercial, SaaS global |
| PAYFLOW | `painel/payflow` | 3007 | Cobrança, recibos, conciliação | Cadastro de alunos/escolas |
| DOC | `painel/docs` | 5173 | Manuais, API, arquitectura | UI operacional ou comercial |

## Sempre

- Preservar frontend/design/framework de cada app. Não unificar UI.
- Não criar `/pricing` nem wizard comercial com componentes do SIGA.
- Não apagar função deslocada: criar destino → ligar → testar → remover.
- URLs: `src/lib/ecosystem-urls.ts` + `VITE_WEB_URL` / `VITE_SIGA_URL` /
  `VITE_PAYFLOW_URL` / `VITE_ADMIN_URL` / `VITE_DOCS_URL`. Sem hardcode de produção.
- 1 BD, N tenants. Isolamento operacional = `school_id` / `current_school_id()`.
- Administrador escolar ≠ `platform_admins`. Financeiro escolar ≠ billing SaaS.

## Skills por app

- WEB → `siga-web` · ADMIN → `siga-admin` · DOC → `siga-docs`
- Backend SaaS ainda no SIGA → `siga-saas` (`src/features/saas`)
- Módulos escolares → `siga-<modulo>`
