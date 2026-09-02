# Navegação e permissões (SIGA)

Mapa alinhado com o código em `navigation-catalog.ts`, `portal-engine.ts` e `access-policy.ts`.

## Sidebar vs launcher

| Superfície | O quê |
| --- | --- |
| **Sidebar** | Navegação principal por secção e papel |
| **Launcher (waffle)** | Atalhos rápidos a módulos — ícones premium Lucide, **sem logótipo da escola** |
| **Definições** | Modal `/configuracoes` — escola, matrícula, integrações, financeiro, segurança |
| **Perfil** | `/perfil` — conta, foto, telemóvel |

O **logótipo institucional** aparece **só** no botão do topo da sidebar (dropdown da conta).

## Módulos e rotas

| Módulo | Rota principal | Rotas relacionadas |
| --- | --- | --- |
| Dashboard | `/` | — |
| Alunos | `/alunos` | ficha `/alunos/{id}` |
| Pessoas | `/pessoas` | ficha professor `/professores/{id}` |
| Pedagógica | `/pedagogica` | tabs: turmas, notas, horários, chamada |
| Planos de Aula | `/planos-aula` | — |
| Calendário | `/calendario` | feed ICS `/calendario/ics` |
| Tesouraria | `/financeiro` | `/faturas`, `/relatorios/financeiros` |
| Documentos | `/documentos` | modelos em `#modelos` |
| Arquivos | `/arquivos` | waffle (biblioteca Moodle) |
| Importar | `/importar` | Excel/CSV central |
| Comunicações | `/comunicacoes` | — |
| Relatórios académicos | `/relatorios/academicos` | — |
| Catracas | `/catracas` | cartão virtual, dispositivos |
| Acessos | `/acessos` | convites, grants, 2FA |
| Matrícula pública | Definições → Matrícula | `/matricula/{slug}` (público) |
| Integrações | Definições → Integrações | catalog-ready |

## Matriz por papel (resumo)

| Rota / área | Admin | Secretaria | Tesouraria | Professor | Encarregado | Aluno |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| `/` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/configuracoes` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/pessoas`, `/alunos`, `/documentos` | ✅ | ✅ | ❌ | ❌ | ✅* | ✅* |
| `/importar` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `/financeiro` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `/faturas`, `/relatorios/financeiros` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `/pedagogica`, `/calendario`, `/comunicacoes` | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| `/planos-aula`, `/arquivos` | ✅ | ✅ | ✅** | ✅ | ❌ | ✅** |
| `/relatorios/academicos` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `/acessos`, `/catracas` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/perfil`, `/alterar-senha` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

\* Encarregado e aluno: documentos e dados limitados ao seu contexto (portal).  
\** Tesouraria e aluno: arquivos conforme grants e plano.

## Secções da sidebar (administração)

1. **Académico** — dashboard, área pedagógica (turmas, notas, horários, presenças, calendário, planos)
2. **Secretaria** — pessoas, importação, alunos, documentos, arquivos
3. **Financeiro** — caixa, faturas
4. **Relatórios** — financeiros e académicos
5. **Gestão e Comunicação** — catracas, acessos, comunicados
6. **Sistema** — definições (submenus), perfil

Secretaria e Tesouraria veem subconjuntos filtrados por `access-policy.ts` e plano SaaS (`plan-features.ts`).

## Auditoria automática

No repositório SIGA:

```sh
npm run siga:check        # inventário + testes de navegação
npm run siga:check-nav    # só testes navigation-catalog
```

Inventário de módulos: `docs/agents/MODULES.md`.

## Fora da sidebar SIGA

- **Control Center SaaS** — app ADMIN (`/tenants`, `/subscriptions`, …)
- **Comercial** — WEB (`/`, `/pricing`, `/start`)
- **Documentação** — este site DOC
