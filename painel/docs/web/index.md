# Portal WEB — documentação

O **WEB** (`painel/web`, porta **5174**) é o portal comercial do SIGA Plus:
marketing, planos, FAQ e **wizard de criação de escola**.

Não gere alunos, pautas, propinas nem tenants globais (isso é SIGA / ADMIN).

## Rotas principais

| Rota | Função |
| --- | --- |
| `/` | Landing comercial |
| `/pricing` | Planos e preços |
| `/start` | Wizard «Criar a minha escola» (6 passos) |
| `/faqs` | Perguntas frequentes (template comercial) |

## Leitura seguinte

- [Criar escola (`/start`)](/web/criar-escola) — passos do wizard e API
- [Arquitetura do ecossistema](/arquitetura/)
- [Manual do ADMIN](/admin/control-center) — após provisionamento

Desenvolvimento: `npm run dev` em `painel/web` ou `npm run dev:ecosystem` na raiz.
