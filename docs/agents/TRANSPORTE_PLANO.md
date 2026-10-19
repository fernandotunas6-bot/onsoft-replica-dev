# Transporte escolar — plano (portal + app), a fazer com o Lovable

Estado: **aprovado a 2026-10-18; servidor e app feitos, migração por aplicar.** Nada disto
está ainda na base de produção (pacote: `docs/agents/SIGA_aplicar_transporte.sql`).

## O que entra na primeira versão

Rotina, sem GPS em tempo real (fica para depois: as guardas de posição já existem em
`mobile-flutter/backend/transport.ts`).

**Portal (Administrador / Secretaria, ou a permissão «Gestão»):**

- **Viaturas:** matrícula, nome curto («Autocarro 2»), lugares, motorista (nome e
  telefone), activa/inactiva.
- **Rotas:** nome, sentido (ida / volta / ida e volta), viatura, activa/inactiva.
- **Paragens** de cada rota, por ordem: nome, referência («em frente à farmácia Kinaxixi»),
  hora prevista de ida e de volta.
- **Alunos da rota:** aluno → rota + paragem, desde/até. Um aluno tem no máximo uma
  rota activa por sentido.
- **Estado do dia** por rota: normal, atrasada (minutos) ou sem serviço, com nota. Ao
  gravar um atraso ou «sem serviço», os alunos dessa rota recebem um aviso
  (`notifications`, `event_type = 'transport.day_status'`), que a app já mostra.

**App SIGA Plus (aluno):** «O meu transporte» em Serviços → Do dia a dia: rota, paragem,
hora prevista, viatura, motorista (tocar para ligar) e o estado de hoje. Entra na
sincronização automática (ao voltar à app e de 2 em 2 minutos). O professor não vê
transporte. Alterar rotas e paragens faz-se só no portal.

## Base de dados (migração `20261018120000_school_transport.sql`)

Cinco tabelas, todas **só do servidor**: paragem + hora + aluno é a morada de um menor.
`ENABLE` + `FORCE ROW LEVEL SECURITY`, sem políticas, `REVOKE ALL … FROM PUBLIC, anon,
authenticated`, `GRANT ALL … TO service_role`; gatilhos `siga_touch_updated_at()` e
`private.audit_row_change()`; tudo `IF NOT EXISTS`.

| tabela                       | colunas principais                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `siga_transport_vehicles`    | `school_id`, `plate` (único por escola), `label`, `seats` 1..120, `driver_name`, `driver_phone`, `is_active`                                              |
| `siga_transport_routes`      | `school_id`, `name` (único por escola), `direction` in (`outbound`,`return`,`both`), `vehicle_id` → vehicles, `is_active`                                 |
| `siga_transport_stops`       | `school_id`, `route_id` → routes (cascade), `sequence` (único por rota), `name`, `landmark`, `outbound_time`, `return_time`                               |
| `siga_transport_assignments` | `school_id`, `student_id` → students, `route_id`, `stop_id`, `valid_from`, `valid_until`; índice único parcial: um activo por aluno e rota                |
| `siga_transport_day_status`  | `school_id`, `route_id`, `service_date`, `status` in (`normal`,`delayed`,`cancelled`), `delay_minutes` 0..240, `note`; único (`route_id`, `service_date`) |

Todas com `id`, `created_at`, `updated_at`, `created_by`, `updated_by`. As colunas
`school_id`, `student_id` e `person_id` usadas foram confirmadas em
`supabase/PRODUCTION_SNAPSHOT.json` (`students`, `people.user_id`, `student_guardians`,
`notifications`, `school_modules`, `staff_module_grants`).

Registo: as 5 tabelas entram em `tests/security/server-only-sensitive-tables.test.ts` e em
`TABELAS_AUSENTES_DA_PRODUCAO` até à aplicação; pacote `docs/agents/SIGA_aplicar_transporte.sql`
e sonda em `SIGA_confirmar_migracoes.sql`.

## Servidor do portal (`src/features/transport/`)

- `schemas.ts` (zod estrito) e `server.ts` com server functions:
  `listTransport` (viaturas, rotas, paragens, contagem de alunos, estado de hoje),
  `saveVehicle`, `saveRoute`, `saveStops` (lista inteira, por ordem; as que saem são
  apagadas, recusado se tiverem alunos),
  `assignStudents` / `endAssignment`, `setDayStatus`.
- Leitura: Administrador, Secretaria ou a permissão do módulo «Gestão»
  (`staff_module_grants.module_key = 'gestao'`, Leitura) — `requireSgaWriterFor`.
  Escrita: `requireSgaWriterForWrite("gestao", …)` (Escrita/Total; escola com a assinatura
  em dia). Não se criou uma chave de módulo nova para não mexer nos valores aceites
  em `staff_module_grants`. Sem a migração: `{ available: false }` e as gravações
  respondem `TRANSPORT_NOT_READY` (como as entregas em PDF).
- Lógica em `transport-core.server.ts` (testada em `tests/transport/`); `server.ts` só
  confirma a sessão e a escola.
- **Paragens atómicas (PR #132):** `saveStops` chama apenas
  `public.siga_transport_save_stops_atomic` (RPC `SECURITY INVOKER`, exclusivamente
  `service_role`). A função verifica escola/rota, bloqueia a rota para serializar
  alterações concorrentes, valida IDs e realiza eliminações, reordenação e criação
  de paragens numa só transacção. Falta da RPC implica recusa, sem fallback
  para várias escritas PostgREST. PGlite valida rollback; PostgreSQL staging
  e ensaio de concorrência continuam obrigatórios antes de produção.
- **Estado do dia atómico (PR #132):** `setDayStatus` utiliza
  `public.siga_transport_set_day_status_atomic` (também apenas `service_role`):
  bloqueia a rota, compara o estado anterior e grava estado e avisos
  in-app numa única transacção. A repetição do mesmo estado não cria avisos,
  e uma falha ao gravar o aviso reverte também o estado. O servidor obtém a
  audiência antes da RPC, que revalida a escola dos destinatários. Ensaiar
  concorrência PostgreSQL real e contas autenticadas antes da produção.
  Se a RPC faltar, a escrita é recusada.
- Sem `school_modules` nesta versão: a página aparece a quem tem acesso e a app só mostra
  transporte ao aluno que tem uma rota atribuída.

## Mobile V4

- `GET /api/mobile-v4/schools/:id/transport`: só `aluno`; devolve a(s) sua(s) rota(s)
  activas com a paragem, as horas, a viatura, o motorista e o estado de hoje (hora de
  Luanda). Nada de outros alunos. 503 `TRANSPORT_NOT_READY` sem a migração; o professor
  recebe `routes: []`.

## Quem faz o quê

| parte                                                | quem            |
| ---------------------------------------------------- | --------------- |
| Migração, pacote SQL, testes de segurança            | Claude          |
| `src/features/transport/` (schemas, server, testes)  | Claude          |
| Endpoint Mobile V4 e página na app Flutter           | Claude          |
| Página do portal `/transporte` (UI) sobre as funções | **Lovable**     |
| Aplicar a migração na produção                       | dono (confirma) |

Ordem: Claude entrega a migração e o servidor num PR para a `main` → o dono aplica a
migração → o Lovable faz a página com o pedido abaixo → Claude faz a app.

## Pedido para colar no Lovable (depois do PR do servidor entrar na `main`)

```
Cria a página /transporte do portal SIGA (módulo «Transporte escolar»), só interface.
Usa APENAS as server functions já existentes em src/features/transport/server.ts:
listTransport, saveVehicle, saveRoute, saveStops, assignStudents, endAssignment,
setDayStatus. Não cries tabelas, migrações nem chamadas directas ao Supabase, e não
regeneres src/integrations/supabase/types.ts.

Separadores: «Hoje» (cada rota com o estado do dia: Normal / Atrasada X min / Sem
serviço, e nota), «Rotas» (rota, viatura, paragens por ordem com horas de ida e volta,
alunos da rota), «Viaturas» e «Alunos» (procurar aluno, atribuir rota e paragem,
terminar atribuição). Seguir o estilo das páginas existentes (PageHeader, tabelas e
QuickFormModal como em /catracas e /planos-aula). Se listTransport devolver
available:false, mostrar «O transporte ainda não está activo nesta escola».
Entrada no menu: navigation-catalog.ts, ícone de autocarro, só Administrador/Secretaria.
Não mexer em mobile-flutter/ nem em src/features/mobile-v4/.
```

## Regras para o Lovable neste trabalho

Além de [`DATABASE_RULES.md`](./DATABASE_RULES.md) (texto para Knowledge no fim desse
ficheiro):

- A app Flutter vive em `mobile-flutter/` e fala com o portal por
  `src/features/mobile-v4/` (contratos testados em `tests/mobile-v4/`). Não alterar.
- `src/integrations/supabase/types.ts` vem da produção: não aceitar regenerações do
  Lovable (já partiu a `main` três vezes).
- Migrações das tabelas do transporte e das entregas em PDF só pelos ficheiros em
  `supabase/migrations/` deste plano; não aprovar outra versão no chat do Lovable.
