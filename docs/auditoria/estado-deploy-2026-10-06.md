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

### B1 — segredos do ambiente `production` (A3 da auditoria 12) — RESOLVIDO a 06/10

A execução de hoje (`37422352112`) falha em 3s, no passo que confirma os segredos,
antes de instalar nada:

```
Falta o segredo CLOUDFLARE_API_TOKEN no ambiente GitHub 'production'
Falta o segredo CLOUDFLARE_ACCOUNT_ID no ambiente GitHub 'production'
Falta o segredo SUPABASE_SERVICE_ROLE_KEY no ambiente GitHub 'production'
```

Os dois da Cloudflare já estavam no `.env` da raiz. Os cinco foram postos no ambiente
`production` a 06/10 (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
Ficaram **de fora de propósito** o `AUTH_BYPASS` e o `VITE_AUTH_DISABLED` que o `.env`
também tem, e o `RESEND_API_KEY` — esse punha a produção a enviar email, o que não é
desbloquear a publicação.

O ambiente não tem regras de protecção nem política de ramos, e o workflow está
`active`: **cada merge na `main` publica**, depois de `typecheck`, `lint` e `test`
passarem sobre o mesmo commit. É a publicação automática pedida; se algum dia se
quiser uma aprovação pelo meio, é em Settings → Environments → production → required
reviewers.

**Por rodar:** a `SUPABASE_SERVICE_ROLE_KEY` que entrou é a que foi exposta em conversa
a 04/10, e o personal access token usado para aplicar o SQL foi colado em conversa a
06/10. Os dois funcionam e os dois são públicos para efeitos práticos. Quando a
`service_role` for rodada, o segredo do ambiente `production` tem de ser actualizado,
senão a publicação deixa de passar.

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

## 4. Ordem de publicação

Feito a 06/10, por esta ordem:

1. ~~Criar os 3 segredos~~ — feitos, cinco (secção 3, B1).
2. ~~Aplicar as migrações do Supabase~~ — três aplicadas e confirmadas (secção 5).
3. ~~Corrigir o `cf-env.ts`~~ — feito e provado em workerd (secção 3, B2).
4. ~~Recapturar o retrato e regenerar os tipos~~ — feitos (secção 5).
5. **Fundir na `main`** — dispara a publicação automática dos 5 apps.
6. **Confirmar na Cloudflare** o `modified_on` dos dois Workers e o estado das Pages.
   O código de saída do `deploy:all` engana, e já houve publicações a falhar a meio
   deixando apps em commits diferentes.
7. **Rodar** a `service_role` e o personal access token (secção 3, B1), e actualizar o
   segredo do ambiente `production`.

## 5. Migrações do Supabase: aplicadas a 06/10

Aplicadas com a API de gestão (`/v1/projects/.../database/query`), depois de o dono
fornecer um personal access token novo. **O registo do repositório estava errado:**
das cinco que os relatórios diziam pendentes, duas já estavam aplicadas. Só faltavam
três.

| Versão         | Migração                       | Estado antes | Agora      |
| -------------- | ------------------------------ | ------------ | ---------- |
| 20261005010000 | `assessment_closed_term_guard` | já aplicada  | aplicada   |
| 20261005020000 | `direct_writes_require_mfa`    | já aplicada  | aplicada   |
| 20261005030000 | `school_row_role_policies`     | **em falta** | aplicada   |
| 20261005150000 | `fee_items_grade_level`        | **em falta** | aplicada   |
| 20261006100000 | `enrollment_class_change`      | **em falta** | aplicada   |

Cada uma foi aplicada em separado e confirmada pela sonda antes da seguinte. As três
ficaram registadas em `supabase_migrations.schema_migrations`.

Retrato recapturado (`npm run siga:db-snapshot`): 187 → 189 tabelas, 321 → 359
políticas, 122 → 125 funções `private`, 202 → 206 triggers. Tipos regenerados
(`supabase gen types typescript --linked`). `tests/security/espera-migracao.ts` ficou
**vazia**: `fee_items.grade_level_id` existe agora na produção.

### Comparar por efeito, não por nome

O histórico da produção tem 187 versões e o repositório 213 — mas a diferença quase
toda é a mesma migração registada com outra versão, porque quem a aplicou usou
`apply_migration`, que atribui um carimbo novo. Oito casos: `late_fee_one_rule`
(repo `20261004135000`, produção `20261005081124`), `propinas_import_into_billing_rules`,
`hr_confirm_payment_free_expense_number`, `hr_reverse_payroll_payment_lock_states`,
`realtime_publish_school_screens`, `attendance_sessions_unique_slot_day`,
`one_active_academic_year`, `harden_teacher_qr_attendance`. Mais dois ficheiros que
são cópias duplicadas no repositório (`hr_atomic_payment_destination`,
`chat_conversations`), já aplicados pela outra cópia. Comparar por nome de versão dava
«faltam nove»; por efeito, faltavam três.

## 6. A colisão de versões já estava na produção — e as 3 do PR #87 também

Pior do que uma colisão por fundir. O histórico da produção já tinha:

```
20261005160000  student_scholarships
20261005170000  class_group_waitlist
20261006090000  course_unit_shift
```

São as três migrações do **PR #87, que é um rascunho e nunca foi fundido**. Foram
aplicadas na produção com os ficheiros a existir só nessa branch — exactamente o que a
regra da secção 7 da auditoria 12 proíbe («nenhum DDL na produção sem o ficheiro no
mesmo commit»).

E a versão `20261005160000` ficou **dupla**: na produção é `student_scholarships`, na
`main` era `enrollment_class_change`. Quem corresse a ferramenta de migrações daria
`enrollment_class_change` por aplicada — e não estava.

Resolvido assim:

- `enrollment_class_change` foi **renumerada** para `20261006100000` (a produção já é
  dona da `20261005160000`), no ficheiro e em todas as referências: ensaio PGlite,
  pacotes, sondas e o comentário em `src/features/students/server.ts`.
- Os três ficheiros do PR #87 foram **trazidos para a `main`** a partir da branch,
  só as migrações — nada do código de aplicação do PR, que continua em rascunho.
  Sem isto o retrato recapturado deixava três testes de segurança vermelhos, a
  denunciar tabelas de produção sem declaração no repositório.

O PR #87 fica mais pequeno e sem conflito nas migrações; o resto (bolsas, lista de
espera, turnos) continua a ser decisão de quem o abriu.

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

---

## 8. Publicado e confirmado na Cloudflare (06/10, 09:06)

O «Deploy produção» correu com êxito **pela primeira vez** (46.ª execução), no commit
`5a0c0730`. Confirmado na Cloudflare, não pelo verde do workflow:

| Serviço                                   | Publicado em        | Commit     |
| ----------------------------------------- | ------------------- | ---------- |
| `fernandotunas6-bot-onsoft-replica-dev`   | 2026-10-06 09:06:17 | —          |
| `siga-plus-payflow`                       | 2026-10-06 09:05:39 | —          |
| Pages `siga-web`                          | 2026-10-06 09:04:43 | `5a0c0730` |
| Pages `siga-admin`                        | 2026-10-06 09:05:12 | `5a0c0730` |
| Pages `siga-docs`                         | 2026-10-06 09:04:22 | `5a0c0730` |

Os cinco no mesmo commit — ao contrário de 04/10, quando estavam em três commits
diferentes.

**O 503 do PayFlow fechou em produção:**

```
GET https://payflow.portal-siga.com/api/v1/health
→ 200  status: ok  database: { status: "ok", latencyMs: 211 }
```

## 9. Estrutura de domínios

Rotas de Worker na zona, como o desenho pede (o Cloudflare resolve por
especificidade, não pela ordem da lista — a rota de `payflow` ganha ao wildcard):

```
docs.portal-siga.com/*       → (bypass)     www.portal-siga.com/*    → (bypass)
admin.portal-siga.com/*      → (bypass)     app.portal-siga.com/*    → Worker SIGA
payflow.portal-siga.com/*    → PayFlow      *.portal-siga.com/*      → Worker SIGA
```

Domínios personalizados dos Workers: `portal-siga.com`, `app.`, `payflow.` e
`minha-escola.` — este último é de uma escola em concreto e não devia ser preciso (o
wildcard faz esse trabalho); fica como excepção criada à mão, inofensiva.

Comportamento verificado de fora:

| Hostname                             | Esperado         | Resposta |
| ------------------------------------ | ---------------- | -------- |
| `portal-siga.com`                    | Worker SIGA      | 200      |
| `app.portal-siga.com`                | Worker SIGA      | 200      |
| `payflow.portal-siga.com`            | Worker PayFlow   | 200      |
| `docs.portal-siga.com`               | Pages siga-docs  | 200      |
| `admin.portal-siga.com`              | Pages siga-admin | 302 → /tenants |
| `*.portal-siga.com` (slug inventado) | wildcard → SIGA  | 200      |
| **`www.portal-siga.com`**            | Pages siga-web   | **522**  |

O wildcard responde a um slug que nunca existiu, que é o teste decisivo: cada escola
criada é alcançável no seu subdomínio sem acção por escola.

### A1 — `www.portal-siga.com` dava 522 — RESOLVIDO

**Não havia registo DNS nenhum para o `www`.** A zona tem 10 registos e nenhum é `www`;
o que fazia o hostname resolver era o **wildcard** `*.portal-siga.com` (AAAA `100::`, o
endereço de marcação que o Cloudflare usa nos hostnames geridos por Worker/Pages). Como
a rota do Worker para `www` é `bypass`, o Worker recusava-o, e do outro lado não havia
nada: 522.

(Uma primeira versão desta secção dizia que «o DNS do `www` existe e aponta para o
Cloudflare». Estava errado — resolvia pelo wildcard. Os IPs pareciam iguais aos do
`docs` porque ambos são IPs do proxy do Cloudflare.)

O lado das Pages também estava mal: o domínio estava associado ao projecto `siga-web`
desde **2026-09-02** com `status: deactivated`, e por isso não aparecia na lista de
domínios do projecto. **O `www.portal-siga.com` esteve em baixo mais de um mês.**

Resolvido a 06/10, em dois passos:

1. `PATCH` no domínio das Pages: `deactivated` → `pending`, com o Cloudflare a dizer o
   que faltava — `verification_data.error_message: "CNAME record not set"`.
2. Criado o registo, igual ao do `admin` e do `docs`:

   ```
   CNAME  www.portal-siga.com  →  siga-web.pages.dev   (proxied)
   ```

Em menos de um minuto o domínio passou a `active` e o hostname a **200**. Confirmado que
serve o projecto certo: o md5 do corpo de `www.portal-siga.com` é igual ao de
`siga-web.pages.dev`.

| Hostname                             | Antes | Agora |
| ------------------------------------ | ----- | ----- |
| `portal-siga.com`                    | 200   | 200   |
| `app.portal-siga.com`                | 200   | 200   |
| `payflow.portal-siga.com`            | 200   | 200   |
| `www.portal-siga.com`                | **522** | **200** |
| `admin.portal-siga.com`              | 302   | 302   |
| `docs.portal-siga.com`               | 200   | 200   |
| `*.portal-siga.com` (slug inventado) | 200   | 200   |

### A2 — o `CLOUDFLARE_API_TOKEN` não tinha Zone DNS — RESOLVIDO

As APIs de DNS respondiam `10000 Authentication error` (o aviso da linha 74 de
`docs/cloudflare/OVERVIEW.md`): o token tinha Zone → Read mas não Zone → DNS. O dono
acrescentou a permissão a 06/10 e o token passou a ler e escrever DNS, o que permitiu o
passo 2 de A1. O `CLOUDFLARE_ZONE_ID` do `.env` está correcto — conferido contra o
`zone_tag` que a API das Pages devolve.

Com a permissão, `npm run siga:configure-domains` passa a ser corrível (pede ainda
Workers Routes Edit e Pages Edit, que o token já tinha).

## 10. Correio: assinatura alinhada, falta a política

O sistema envia de `noreply@portal-siga.com` (`RESEND_FROM_EMAIL`). A configuração do
Resend está correcta e **não é um defeito**, ao contrário do que a leitura rápida dos
registos sugere:

- DKIM em `resend._domainkey.portal-siga.com` — alinha com o domínio do `From`.
- SPF em `send.portal-siga.com` (`v=spf1 include:amazonses.com ~all`) — é o domínio do
  return-path que o Resend usa, subdomínio do `From`, logo o alinhamento relaxado passa.

O que falta mesmo é **DMARC**: não existe `_dmarc.portal-siga.com`. Sem ele não há
política para quem recebe nem relatórios de quem tenta falsificar o domínio. Com DKIM e
SPF já alinhados, começar por um registo de observação é de risco baixo:

```
TXT  _dmarc.portal-siga.com  →  v=DMARC1; p=none; rua=mailto:<caixa de relatórios>
```

Depois de ler os relatórios, subir para `p=quarantine` e `p=reject`. Decisão do dono.
