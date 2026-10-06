# Estado do deploy — 2026-10-06

Levantamento feito hoje antes de preparar a publicação. Produção lida só por fora
(HTTP, API da Cloudflare); a base Supabase **não** foi lida (as credenciais do MCP e
do CLI estão sem autorização — ver «O que ficou por verificar»).

## 1. O código: a `main` está pronta

| Verificação                 | Resultado                                                |
| --------------------------- | -------------------------------------------------------- |
| `main` vs `origin/main`     | iguais (`d4650d89`), 0 à frente, 0 atrás                 |
| CI na `main` (`d4650d89`)   | verde — CI, Academic Import Check, SIGA Native CI        |
| `Deploy produção` (verify)  | verde: `typecheck`, `lint`, `test` sobre o mesmo commit   |
| Ensaios SQL das 5 pendentes | 5 de 5 passam em PGlite (corridos hoje)                  |

Trabalho de 04/10 a 06/10 (PRs #70 a #91) está todo fundido na `main`: multas por
atraso, propina por classe, mudar de turma, bolsas/desconto no contrato, numeração
de faturas, data civil de Luanda, QR do professor, Ensino Superior (bacharelato,
certificado, trabalhador-estudante), template Tauri e endurecimento do arranque.

## 2. O que está publicado: a produção está em 02/10

A publicação automática **nunca correu** (44 de 44 execuções falhadas, agora 45).
O que está no ar foi publicado à mão, e há quatro dias:

| App                                        | Último `modified_on` |
| ------------------------------------------ | -------------------- |
| `fernandotunas6-bot-onsoft-replica-dev` (SIGA) | 2026-10-02 08:11 |
| `siga-plus-payflow` (PayFlow)              | 2026-10-02 06:53     |

Ou seja: **nada de 03/10 a 06/10 está em produção.** As multas por atraso, a data de
Luanda, a numeração das faturas e o QR do professor estão na `main` e não no ar.

Sondagem HTTP de hoje:

| Endereço                                      | Resposta |
| --------------------------------------------- | -------- |
| `https://portal-siga.com/`                    | 200      |
| `https://siga-docs.pages.dev/`                | 200      |
| `https://siga-web.pages.dev/`                 | 200      |
| `https://siga-admin.pages.dev/`               | 302      |
| `https://payflow.portal-siga.com/api/v1/health` | **503**  |

## 3. Dois bloqueios, os dois do dono

### B1 — faltam 3 segredos no ambiente `production` (A3 da auditoria 12)

A execução de hoje (`37422352112`) falha em 3s, no passo que confirma os segredos,
antes de instalar nada:

```
Falta o segredo CLOUDFLARE_API_TOKEN no ambiente GitHub 'production'
Falta o segredo CLOUDFLARE_ACCOUNT_ID no ambiente GitHub 'production'
Falta o segredo SUPABASE_SERVICE_ROLE_KEY no ambiente GitHub 'production'
```

`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` já resolvem pelas omissões do
workflow. Só o dono cria segredos (Settings → Environments → production). **Rodar
primeiro as chaves que foram coladas em conversas** (segredo Google OAuth de 25/09,
access token e `service_role` do Supabase de 04/10): a chave que entrar no ambiente
tem de ser a nova, não a exposta.

### B2 — o PayFlow não chega aos bindings (defeito de código, não de configuração)

**Correcção.** Uma primeira versão deste relatório dizia que a base D1 estava vazia,
a partir do `num_tables: 0` que a API da Cloudflare e o `wrangler d1 list` devolvem.
Esse campo está desactualizado. Consultada a base a valer:

```
sqlite_master → 14 tabelas (payments, students, schools, student_invoices, …)
d1_migrations → as 6 migrações aplicadas (0000 e 0002 a 29/09, 0001/0003/0004/0005 a 02/10)
```

E o binding do Worker publicado está certo:

```
siga-plus-payflow → bindings: 1 → d1 DB = bbfa8e07-48ad-4397-902b-bcb0b8da2948
```

Base com tabelas, binding correcto, e ainda assim 503. A causa está em
`painel/payflow/lib/cf-env.ts`: resolvia o ambiente **no carregamento do módulo**,
lendo `globalThis.env`. Em workerd os bindings chegam por `cloudflare:workers` —
nunca por `globalThis.env` nem por `process.env`. O teste falhava sempre, caía no
`process.env`, e `env.DB` ficava `undefined`.

A prova está no próprio health: `latencyMs: 0`. O `checkDatabase` só devolve zero
quando sai no `isD1()`, antes de consultar — se fosse a base a falhar, a latência
seria outra. E `getDb()` lançava «binding `DB` is unavailable», a mesma mensagem que
`scripts/siga/payflow-bindings.mjs` atribui, num comentário, às ligações apagadas
pelo deploy. Eram dois defeitos com a mesma mensagem; o primeiro foi corrigido a
29/09, este ficou.

Corrigido neste trabalho: `cf-env.ts` passa a resolver os bindings por
`cloudflare:workers` (importação dinâmica, porque o módulo não existe em Node) e a
ler por `Proxy`, com os bindings a ganhar ao `globalThis.env` e ao `process.env`.
É a via documentada pelo vinext.

**Isto não se resolve a publicar.** Nenhuma publicação do código de 02/10 ia
arranjar o 503, e é por isso que o passo final do workflow («Confirmar que os
serviços publicados respondem») ia continuar a falhar depois de os segredos
estarem postos. Com a correcção, a publicação passa a ser o que resolve.

## 4. Ordem de publicação recomendada

1. **Rodar** as chaves expostas (Supabase `service_role` e access token, Google OAuth).
2. **Criar os 3 segredos** no ambiente `production` com as chaves novas.
3. **Aplicar as 5 migrações** do Supabase pendentes, pelo pacote
   `docs/agents/SIGA_aplicar_pendentes_2026-10-06.sql` (SQL Editor → Run), e
   confirmar com a consulta do fundo (5 linhas «aplicada»). Fazer **antes** de
   publicar: a propina por classe e o mudar de turma só funcionam com elas.
4. **Fundir a correcção do `cf-env.ts`** (B2). Sem ela o PayFlow continua em 503 e o
   passo final do workflow recusa a publicação.
5. **`workflow_dispatch`** do «Deploy produção» (ou um push para a `main`).
6. **Confirmar na Cloudflare** o `modified_on` dos dois Workers e o estado das Pages —
   o código de saída do `deploy:all` engana, e já houve publicações a falhar a meio
   deixando apps em commits diferentes.
7. **Recapturar** `supabase/PRODUCTION_SNAPSHOT.json` e retirar `fee_items.grade_level_id`
   de `tests/security/espera-migracao.ts`.

## 5. Migrações do Supabase: 5 por aplicar

Pacote único, por ordem de versão, idempotente, com confirmação no fim:
`docs/agents/SIGA_aplicar_pendentes_2026-10-06.sql`. Os corpos são os dos ficheiros
de `supabase/migrations/`, conferidos por md5.

| Versão         | Migração                            | Porquê                                            | Ensaio PGlite                 |
| -------------- | ----------------------------------- | ------------------------------------------------- | ----------------------------- |
| 20261005010000 | `assessment_closed_term_guard`      | A6: escrita directa nas notas com pauta oficial   | `assessment-closed-term.mjs`  |
| 20261005020000 | `direct_writes_require_mfa`         | A5: 2FA em 13 tabelas                             | `direct-writes-mfa.mjs`       |
| 20261005030000 | `school_row_role_policies`          | A9: papel pela escola da linha no gateway         | `school-row-role-policies.mjs`|
| 20261005150000 | `fee_items_grade_level`             | propina por classe                                | `fee-items-grade-level.mjs`   |
| 20261005160000 | `enrollment_class_change`           | mudar de turma no mesmo ano                       | `enrollment-class-change.mjs` |

Já aplicadas e agora com sonda em `SIGA_confirmar_migracoes.sql` (faltava):
`20261005143409_teacher_qr_inner_functions_not_callable`.

Usa-se o SQL Editor e não `apply_migration` porque a ferramenta cancela as migrações
com `DROP` (cancelada duas vezes a 04/10, expirada duas vezes a 05/10, sem aplicar nada).

## 6. Colisão de versões no PR #87

O PR #87 (rascunho, em conflito) traz `supabase/migrations/20261005160000_student_scholarships.sql`.
A `main` já tem **`20261005160000_enrollment_class_change.sql`** — mesma versão, migração
diferente. Antes de o PR seguir, a das bolsas tem de ser renumerada (p. ex. `20261006100000`),
senão repete-se a colisão de versões de 04/10. O PR traz ainda `20261005170000_class_group_waitlist`
e `20261006090000_course_unit_shift`, essas sem colisão.

## 7. O que ficou por verificar

- **O catálogo da base não foi lido; o esquema foi.** Dois caminhos estão fechados: o MCP
  do Supabase responde `FGA Authentication Error: Unauthorized` e o `SUPABASE_ACCESS_TOKEN`
  do `.env` dá 401 na API de gestão (`/v1/projects`) — foram rodados ou revogados depois
  da exposição de 04/10. O que **funciona** é o PostgREST com a chave `service_role` do
  `.env`, e é por isso que `tests/security/selects-vs-producao-live.test.ts` corre.

  Pelo PostgREST confirma-se **ao vivo** que `20261005150000` está por aplicar:

  ```
  GET /rest/v1/fee_items?select=grade_level_id
  → 42703  column fee_items.grade_level_id does not exist
  ```

  As outras quatro são funções, gatilhos e políticas: o PostgREST não as mostra (o
  esquema `private` não está exposto e a `service_role` ignora o RLS), por isso para
  essas o estado vem do registo do repositório e dos relatórios (auditoria 12 e
  `CONTINUE.md`), não de leitura de hoje. **Correr a consulta de
  `SIGA_confirmar_migracoes.sql` antes de aplicar o pacote:** se alguma já disser
  «aplicada», aplicar continua a ser seguro (é idempotente), mas o registo fica certo.

- **Os dois segredos da Cloudflare já existem na máquina.** `CLOUDFLARE_API_TOKEN` e
  `CLOUDFLARE_ACCOUNT_ID` estão no `.env` da raiz; o que falta é pô-los no ambiente
  GitHub `production`. O terceiro, `SUPABASE_SERVICE_ROLE_KEY`, também está lá — mas é
  o que foi colado em conversa a 04/10, por isso **esse tem de ser rodado primeiro** e
  o que entra no ambiente é a chave nova (e o `.env` actualizado a seguir).

- **A suite local ficava vermelha por uma espera registada.** `COLUNAS_ESPERA_MIGRACAO`
  (`tests/security/espera-migracao.ts`) é respeitada por `colunas-inexistentes` e
  `production-columns`, mas não era pelo teste ao vivo: `fee_items.grade_level_id`
  fazia falhar 1 dos 3 077 testes. Corrigido — o teste ao vivo salta agora as colunas
  dessa lista (e só essas; quem obriga a lista a encolher continua a ser
  `colunas-inexistentes`, pelo retrato recapturado). No CI isto não se via: o teste ao
  vivo é saltado sem credenciais.
- Os PRs abertos ficam fora desta publicação: #92 (desktop, CI verde, pronto a fundir),
  #87 (rascunho, em conflito, colisão da secção 6) e #35 (rascunho de 28/09).
