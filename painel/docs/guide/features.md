# Funcionalidades & permissões

Visão das capacidades do ecossistema **SIGA Plus** e dos papéis de acesso na app escolar (SIGA).

::: tip Mapa operacional
Rotas, sidebar, launcher e matriz RBAC actualizada:
**[Navegação SIGA](/siga/navegacao)**.
:::

---

## Cinco aplicações

| App | Função | Onde |
| --- | --- | --- |
| **WEB** | Marketing, planos, wizard «criar escola» | `painel/web` |
| **ADMIN** | SaaS Control Center (tenants, subscrições, domínios) | `painel/admin` |
| **SIGA** | Operação diária da escola | raiz do repositório |
| **PAYFLOW** | Cobrança, recibos e conciliação | `painel/payflow` |
| **DOC** | Manuais (este site) | `painel/docs` |

Detalhe arquitectural: [Ecossistema](/arquitetura/).

---

## Módulos SIGA (gestão escolar)

| Área | Rotas principais | Skill / inventário |
| --- | --- | --- |
| Dashboard | `/` | `siga-dashboard` |
| Alunos | `/alunos` | `siga-alunos` |
| Pessoas | `/pessoas`, `/professores/{id}` | `siga-pessoas` |
| Pedagógica | `/pedagogica`, `/relatorios/academicos` | `siga-pedagogica` |
| Planos de Aula | `/planos-aula` | `siga-lesson-plans` |
| Calendário | `/calendario`, ICS | `siga-calendario` |
| Tesouraria | `/financeiro`, `/faturas`, `/relatorios/financeiros` | `siga-financeiro` (+ PayFlow) |
| Documentos | `/documentos` | `siga-documentos` |
| Arquivos | `/arquivos` | `siga-arquivos` |
| Importação | `/importar` | `siga-importar` |
| Comunicações | `/comunicacoes` | `siga-comunicacoes` |
| Catracas | `/catracas` | `siga-catracas` |
| Acessos & 2FA | `/acessos` | `siga-acessos` |
| Matrícula pública | `/matricula/{slug}` + Definições | `siga-matricula` |
| Integrações | Definições → Integrações | `siga-integracoes` |

Inventário técnico: `scripts/siga/modules.json` e `docs/agents/MODULES.md`.

---

## Papéis na escola (RBAC)

Papéis principais: **Administrador**, **Secretaria**, **Tesouraria**, **Professor**, **Encarregado**, **Aluno**.

- **Administrador** — todos os módulos + Definições (`/configuracoes`).
- **Secretaria** — pessoas, alunos, documentos, importação, pedagógica, arquivos; sem tesouraria completa nem definições.
- **Tesouraria** — caixa, faturas, relatórios financeiros, importação de pagamentos; sem secretaria.
- **Professor** — pedagógica, planos de aula, calendário, arquivos, comunicações; portal dedicado na sidebar.
- **Encarregado / Aluno** — portais simplificados (notas, propinas, documentos no seu contexto).

O plano SaaS (`plan-features.ts`) pode ocultar módulos mesmo com papel correcto. Grants por utilizador sobrepõem-se ao papel por módulo.

Matriz completa: [Navegação SIGA](/siga/navegacao#matriz-por-papel-resumo).

---

## ADMIN (plataforma SaaS)

Operadores `platform_admins` usam o **ADMIN**, não a sidebar escolar:

- `/tenants` — escolas provisionadas
- `/subscriptions`, `/settings/billing` — planos e facturação SaaS
- `/domains`, `/platform-admins`, `/audit`

Manual: [Control Center](/admin/control-center).

---

## Integrações catalog-ready

Instalação em Definições → Integrações; acções nos ecrãs via `InstalledModuleTools`.

- Pagamentos: [EMIS / Multicaixa e Unitel](/integracoes/emis-multicaixa-unitel)
- Produção gateway: [Checklist](/integracoes/gateway-producao)
- Exportação fiscal: [SAFT-AO / AGT](/financeiro/saft-agt-exportacao)

---

## Navegação na interface SIGA

| Superfície | Descrição |
| --- | --- |
| **Sidebar** | Secções por papel (`portal-engine.ts`) |
| **Launcher (waffle)** | Atalhos a módulos — ícones Lucide |
| **Definições** | Modal: escola, matrícula, integrações, financeiro, segurança |
| **Perfil** | `/perfil` — conta e foto |

O logótipo da escola aparece **apenas** no topo da sidebar.

Auditoria no código: `npm run siga:check`.

---

## Ligações úteis

- [Navegação e permissões (SIGA)](/siga/navegacao)
- [Segurança de rotas (modelo RBAC)](/guide/route-security)
- [Criar escola (WEB)](/web/criar-escola)
- [Componentes UI (template DOC)](/components/)
