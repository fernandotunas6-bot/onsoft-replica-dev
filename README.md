<div align="center">

<img src="public/icons/icon-512.png" width="88" alt="SIGA" />

# SIGA
### Sistema Integrado de Gestão Académica

**Plataforma completa de gestão escolar** — matrículas, área pedagógica, financeiro,
documentos, comunicações, arquivos e acessos, num único painel.

[![CI](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![TanStack Start](https://img.shields.io/badge/TanStack%20Start-SSR-FF4154?logo=react-query&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-38BDF8?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white)
![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)
![License](https://img.shields.io/badge/license-Privado-lightgrey)

</div>

<br />

## Visão geral

O SIGA cobre o ciclo completo de uma instituição de ensino em Angola — da candidatura
pública à matrícula, passando por pauta, financeiro, biblioteca de arquivos e
comunicação com encarregados — com segurança ao nível da linha (RLS) em cada tabela.

<table>
<tr>
<td width="50%" valign="top">

### 🎓 Académico
- Turmas, disciplinas, horários e pauta
- Centro de avaliação (MAC/NPP/NPT)
- Boletins, históricos e certificados oficiais
- Presença por matrícula

### 👥 Pessoas & Acessos
- Registo central de pessoas, professores e encarregados
- Convites, papéis e *grants* granulares
- 2FA (TOTP) e credenciais impressas

### 💳 Financeiro
- Facturação, caixa e planos de pagamento
- Multicaixa Express / Unitel Money
- Relatórios oficiais com IBAN e logótipo

</td>
<td width="50%" valign="top">

### 📂 Arquivos
- Biblioteca estilo Moodle (pastas, picker, auditoria)
- Ligação a alunos, documentos e turmas
- Metadados obrigatórios e organização automática

### 📣 Comunicação
- Mensagens internas em tempo quase real
- Comunicados com WhatsApp / e-mail
- Notificações e sino operacional

### 🇦🇴 Identidade Angola
- Validação de BI / NIF / IBAN
- Telefone +244 (E.164)
- Documentos e portal AGT

</td>
</tr>
</table>

<br />

## Stack técnica

| Camada | Tecnologia |
| --- | --- |
| Frontend | React 19 · TypeScript · TanStack Start (SSR) · TanStack Router |
| UI | Tailwind CSS 4 · Radix UI · shadcn-style components |
| Dados | Supabase (Postgres, Auth, Storage, RLS) |
| Validação | Zod ponta-a-ponta (schemas partilhados cliente/servidor) |
| Testes | Vitest · testes de segurança SQL (`supabase/tests`) |
| Deploy | Cloudflare Workers (Wrangler) |
| Qualidade | ESLint · Prettier · Lighthouse CI · auditoria de dependências semanal |

<br />

## Começar

```sh
git clone https://github.com/fernandotunas6-bot/onsoft-replica-dev.git
cd onsoft-replica-dev
npm i
cp .env.example .env   # preencher com as credenciais do Supabase
npm run dev
```

> Node **24** é obrigatório (Node 26 falha neste toolchain — `dyld libc++`).

### Scripts úteis

```sh
npm test                 # Vitest
npm run lint              # ESLint
npm run check              # estilo + acessibilidade
npm run siga:check         # inventário dos módulos SIGA
npm run siga:sql           # lembra o SQL a aplicar no Supabase
npm run siga:scaffold -- <modulo> [--route=/caminho] [--with-page]
```

<br />

## Supabase

Copie `.env.example` para `.env` e preencha as variáveis públicas usadas pelo browser.
Nunca coloque `sb_secret_...` / `service_role` numa variável `VITE_*` — essas ficam só
no ambiente seguro do servidor/deploy.

As migrações **não** são aplicadas via `supabase db push` neste projecto. Correr, por
esta ordem, no **SQL Editor** do Supabase:

1. `supabase/APPLY_IN_SQL_EDITOR.sql`
2. `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql`

Ver [supabase/DO_NOT_APPLY_TO_SGA.txt](supabase/DO_NOT_APPLY_TO_SGA.txt) para os
ficheiros que **nunca** devem ser aplicados ao projecto activo, e
[docs/SECURITY.md](docs/SECURITY.md) para o modelo de RLS e gestão de credenciais.

<br />

## Arquitectura de dados

Tabelas normalizadas e reutilizáveis — `people`, `person_documents`, `person_roles`,
`person_relationships`, `students`, `student_guardians`, `academic_years`, `courses`,
`class_groups`, `enrollments`, `subjects`, `term_grades`, `class_schedule_slots`. A view
`student_directory` serve a listagem pronta para a interface sem contornar as políticas
RLS das tabelas de origem.

Operações compostas usam RPCs transacionais — `enroll_new_student` cria pessoa, papel e
aluno numa única transação (qualquer falha reverte o conjunto). Actualizações de ficha
usam a coluna `version` para detectar edições concorrentes.

<br />

## Documentação para agentes

Handoff e estado dos ciclos: [docs/agents/CONTINUE.md](docs/agents/CONTINUE.md).
Skills por módulo em [`.cursor/skills/siga*/`](.cursor/skills/).

<br />

<div align="center">

Feito para escolas em Angola 🇦🇴

</div>
