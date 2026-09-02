# Arquitetura do ecossistema SIGA Plus

Um ecossistema, quatro responsabilidades, uma experiência integrada.

```text
WEB vende.    ADMIN controla.    SIGA trabalha.    DOC explica.
Todos comunicam. Nenhum substitui o outro. Nenhum precisa do mesmo frontend.
```

## As quatro aplicações

| Aplicação | Função | Pasta | Porta local |
| --- | --- | --- | --- |
| **WEB** | Portal público: marketing, planos, criar escola | `painel/web` | 5174 |
| **ADMIN** | SaaS Control Center: tenants, assinaturas, billing, domínios | `painel/admin` | 3005 |
| **SIGA Plus** | Operação interna da escola já criada | raiz do repositório | 3006 |
| **DOC** | Documentação de todo o ecossistema (este site) | `painel/docs` | 5173 |

Manual SIGA: [Navegação e permissões](/siga/navegacao).

Cada aplicação mantém o seu framework, design system, tipografia e navegação.
A harmonização é de **arquitectura, dados, autenticação e URLs** — não de visual.

```text
                ┌──────────────────┐
                │       WEB        │
                │ Marketing/Vendas │
                └────────┬─────────┘
                         │ signup
                         ▼
                ┌──────────────────┐
                │   SaaS Services  │
                │ Tenant / Billing │
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
                             └─────────────────┘
```

## Leitura seguinte

- [Responsabilidades](/arquitetura/responsabilidades) — o que pertence a cada app
- [Fluxos e provisionamento](/arquitetura/fluxos) — criar escola, hostname, upgrade
- [Manual do ADMIN](/admin/control-center) — Control Center SaaS (tenants, APIs)
- [Wizard WEB `/start`](/web/criar-escola) — criar escola comercialmente

## Aplicações do Ecossistema
 
| App | URL Produção | URL Local | Função |
| --- | --- | --- | --- |
| **WEB** | [siga-web.pages.dev](https://siga-web.pages.dev) | `http://localhost:5174` | Marketing, `/pricing`, wizard `/start` |
| **ADMIN** | [siga-admin.pages.dev](https://siga-admin.pages.dev/tenants) | `http://localhost:3005/tenants` | Control Center SaaS |
| **SIGA** | [portal-siga.com](https://portal-siga.com) | `http://localhost:3006` | Operação escolar |
| **DOC** | [siga-docs.pages.dev](https://siga-docs.pages.dev) | `http://localhost:5173` | Este site |

Configure URLs de produção com `VITE_*` (SIGA/WEB) ou `NEXT_PUBLIC_*` (ADMIN). Ver `npm run siga:sync-env` na raiz do repositório.

Referência para programadores e agentes:
`docs/agents/ARCHITECTURE_HARMONIZATION.md` no repositório.
