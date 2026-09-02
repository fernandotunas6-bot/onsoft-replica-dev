# Onboarding após criar a escola

Checklist operacional depois do wizard WEB `/start` ou provisionamento pelo ADMIN.
O servidor já executa **bootstrap automático**; estes passos confirmam que a
escola está pronta para o dia-a-dia.

## O que o bootstrap cria

Resposta `POST /api/saas/signup` inclui `bootstrapSeeded`, por exemplo:

- Ano lectivo activo
- Plano financeiro (propina mensal + taxa de matrícula)
- Formulário público de matrícula (`/matricula/{slug}`)
- Definições da escola (`school_settings`)
- Estrutura académica mínima (programa, campus, disciplinas, trimestres, turma inicial)

## Checklist do administrador

| # | Acção | Onde |
| --- | --- | --- |
| 1 | Entrar com o convite Supabase (e-mail do administrador) | Caixa de entrada |
| 2 | Confirmar valores de propina | SIGA → Definições → Financeiro |
| 3 | Revisar turmas e disciplinas | `/pedagogica` |
| 4 | Matricular o primeiro aluno (ou importar) | `/alunos` |
| 5 | Activar link público de matrícula | Definições → Matrícula |
| 6 | Emitir primeira fatura de teste | `/faturas` |
| 7 | (Opcional) Gateway EMIS/Unitel em produção | [Checklist produção](/integracoes/gateway-producao) |

O dashboard mostra **Primeiros passos** enquanto não houver alunos registados.

## Verificar tenant (API)

```http
GET /api/saas/tenants/lookup?slug={slug}
```

Devolve nome, estado e subscrição — útil para E2E e integrações.

## Escola de demonstração (dados ricos)

Para demos com 36 turmas e centenas de alunos (sem passar pelo wizard):

```sh
npm run siga:sql          # scripts canónicos
npm run siga:sql:demo     # ordem do seed Dom Afonso I
npm run siga:seed-demo    # gera SEED_ESCOLA_DEMO_FULL.sql (opcional)
```

Matrícula pública demo: `/matricula/dom-afonso-demo`.

Após o seed SQL, a escola demo aparece no **ADMIN** `/tenants` com slug
`dom-afonso-demo` (tenant ligado automaticamente em `SEED_ESCOLA_DEMO.sql`).

Com carga completa (`SEED_ESCOLA_DEMO_FULL.sql`):

```sh
npm run siga:sync-demo-usage
```

Actualiza alunos/staff em `tenant_usage` para o Control Center reflectir os dados demo.

## Leitura relacionada

- [Criar escola (wizard WEB)](/web/criar-escola)
- [Fluxos e provisionamento](/arquitetura/fluxos)
