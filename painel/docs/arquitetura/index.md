# Arquitetura do ecossistema SIGA Plus

Um ecossistema, cinco responsabilidades, uma experiência integrada.

```text
WEB vende.    ADMIN controla.    SIGA trabalha.    PAYFLOW cobra.    DOC explica.
Todos comunicam. Nenhum substitui o outro. Nenhum precisa do mesmo frontend.
```

## As cinco aplicações

| Aplicação | Função | Pasta | Porta local |
| --- | --- | --- | --- |
| **WEB** | Portal público: marketing, planos, criar escola | `painel/web` | 5174 |
| **ADMIN** | SaaS Control Center: tenants, assinaturas, billing, domínios | `painel/admin` | 3005 |
| **SIGA Plus** | Operação interna da escola já criada | raiz do repositório | 3006 |
| **PAYFLOW** | Cobrança, recibos e conciliação | `painel/payflow` | 3007 |
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
| **WEB** | [www.portal-siga.com](https://www.portal-siga.com) | `http://localhost:5174` | Marketing, `/pricing`, wizard `/start` |
| **ADMIN** | [admin.portal-siga.com](https://admin.portal-siga.com/tenants) | `http://localhost:3005/tenants` | Control Center SaaS |
| **SIGA** | [portal-siga.com](https://portal-siga.com) / [app.portal-siga.com](https://app.portal-siga.com) | `http://localhost:3006` | Operação escolar |
| **PAYFLOW** | [payflow.portal-siga.com](https://payflow.portal-siga.com) | `http://localhost:3007` | Cobrança e recibos |
| **DOC** | [docs.portal-siga.com](https://docs.portal-siga.com) | `http://localhost:5173` | Este site |

Configure URLs de produção com `VITE_*` (SIGA/WEB) ou `NEXT_PUBLIC_*` (ADMIN). Ver `npm run siga:sync-env` na raiz do repositório.

Referência para programadores e agentes:
`docs/agents/ARCHITECTURE_HARMONIZATION.md` no repositório.
