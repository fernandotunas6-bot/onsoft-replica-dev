# Auditoria 13 — análise crítica (2026-10-06)

**Âmbito:** produção, estrutura do sistema, módulos, lógica escolar, estrutura de domínios e a app
desktop (Tauri). **Método:** tudo medido hoje. A produção foi lida pelo PostgREST com a
`service_role` (leitura) e por HTTP de fora; a Cloudflare e o GitHub pelas respectivas APIs.
**Nada foi escrito na produção.** As correcções desta sessão são de código e estão no commit
`305e7972`.

---

## 1. Medições de hoje

| Verificação                   | Resultado                                                     |
| ----------------------------- | ------------------------------------------------------------- |
| `tsc --noEmit`                | 0 erros                                                       |
| ESLint (ficheiros alterados)  | 0 erros                                                       |
| Vitest — suite completa       | **1 falha** em 3 077 (467 ficheiros) — corrigida, ver §6      |
| Vitest — `tests/academic/`    | 335 passam (48 ficheiros)                                     |
| Vitest — `tests/routes/`      | 214 passam (49 ficheiros)                                     |
| `npm run siga:check`          | 18 módulos, 186 ficheiros verificados; `siga:check-nav` 13/13 |
| Sondagem HTTP dos 7 hostnames | todos como desenhado (§7)                                     |
| Segredos do repositório       | **0**; `production` tem 5                                     |
| Variáveis do repositório      | **0**                                                         |
| Releases / tags `v*`          | **0** / **0**                                                 |

Dimensão: 225 k linhas em `src/` (925 ficheiros), 105 rotas, 467 ficheiros de teste,
221 migrações, 37 scripts de operação, 9 workflows, 5 apps.

---

## 2. O achado central: está construído, não está ligado

As cinco apps estão no ar, no mesmo commit, e os sete hostnames respondem. A base tem 189 tabelas,
359 políticas e 206 triggers. A suite tem 3 077 testes. A matemática da avaliação segue o Decreto
Executivo n.º 424/25 com fonte única. Há exportação SAF-T, numeração de facturas, multas por atraso
com o arredondamento do Postgres replicado ao cêntimo.

E a produção, lida hoje:

| Tabela                   | Linhas |
| ------------------------ | -----: |
| `schools`                |     48 |
| `tenants`                |     48 |
| `tenant_domains`         |     47 |
| `profiles`               |     64 |
| `students`               |     45 |
| `enrollments`            |     36 |
| `finance_invoices`       |     38 |
| `finance_receipts`       |     31 |
| `class_groups`           |     35 |
| `subjects`               |     10 |
| `teachers`               |      7 |
| `siga_assessment_items`  |  **1** |
| `siga_assessment_scores` |  **1** |
| `attendance_records`     |  **0** |
| `audit_logs`             | 15 142 |

**43 das 48 escolas são restos de testes E2E** (`Escola E2E gw-*`, `mat-*`, `e2e-web-*`), todas
`active`, criadas a 08 e 09/09. E das 5 que não são, quatro estão vazias:

| Escola                      | Períodos | Nota mín. | Alunos | Turmas | Notas | Facturas |
| --------------------------- | -------: | --------: | -----: | -----: | ----: | -------: |
| Colegio Adventista - Huambo |        3 |        10 |      2 |      1 |     1 |        4 |
| Epatulokko                  |        3 |        10 |      0 |      0 |     0 |        0 |
| Colégio Ekovongo            |        3 |        10 |      0 |      0 |     0 |        0 |
| Portal                      |        3 |        10 |      0 |      0 |     0 |        0 |
| SIGA Plus - Web Production  |        3 |        10 |      0 |      0 |     0 |        0 |

**O uso real da produção é uma escola, dois alunos, uma nota e quatro facturas.** Os restantes
~43 alunos e ~34 facturas pertencem às escolas de teste.

Isto não é um defeito de código — é o enquadramento que falta a todos os relatórios anteriores.
A auditoria 12 mediu «49 escolas, 45 alunos, 38 facturas» e tratou-o como volume de produção. Não
é: é volume de teste com uma escola real dentro.

### 2b. O PayFlow está no ar e não está ligado a nada

`GET https://payflow.portal-siga.com/api/v1/health` devolve 200, base a 58 ms. E diz isto:

```
provider: "unconfigured"      providerConfigured: false     integrationConfigured: false
emisHomologated: false        paymentInitiationEnabled: false
ssoConfigured: false          sigaSettlementConfigured: false     sigaUrl: null
bankConnectorConfigured: false     alertWebhookConfigured: false
```

Uma plataforma de cobrança sem provedor, sem homologação EMIS, sem iniciação de pagamento e sem
ligação ao SIGA (`sigaUrl: null`). O 503 de 02/10 fechou — o serviço responde. O que o serviço faz,
hoje, é responder.

### 2c. 39 dos 44 segredos referenciados não existem

Os workflows referenciam 44 segredos. Existem 5, e só no ambiente `production`:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`. Não existem, entre outros:

`APPYPAY_CLIENT_SECRET`, `APPYPAY_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `WHATSAPP_ACCESS_TOKEN`,
`TWILIO_*`, `SMS_API_KEY`, `OTP_PEPPER_SECRET`, `HCAPTCHA_SECRET_KEY`, `PAYFLOW_SSO_SECRET`,
`PAYFLOW_INTEGRATION_API_KEY`, `SIGA_CRON_SECRET`, `SIGA_ALERT_WEBHOOK_URL`, `ZOOM_CLIENT_SECRET`,
`ZOHO_MAIL_*`, `GOOGLE_*`, `META_APP_SECRET`, `TAURI_SIGNING_PRIVATE_KEY`.

Ou seja: pagamentos, correio, SMS, WhatsApp, OTP, captcha, SSO entre apps, tarefas agendadas,
alertas e assinatura da app desktop. Em GitHub Actions um segredo inexistente é a cadeia vazia —
os passos guardados saltam (é o que se vê nos `SKIPPED` do E2E ao vivo e do alerta de gateway), e
os que não estão guardados correm com credenciais em branco.

---

## 3. Estrutura do sistema

Cinco apps num repositório, ligadas por `npm --prefix`, não por workspaces:

| App         | Onde                      | Runtime                  | Base                | Função   |
| ----------- | ------------------------- | ------------------------ | ------------------- | -------- |
| **SIGA**    | raiz (`src/`)             | TanStack Start → Worker  | Supabase (Postgres) | trabalha |
| **WEB**     | `painel/web`              | Pages                    | —                   | vende    |
| **ADMIN**   | `painel/admin`            | Pages                    | Supabase            | controla |
| **DOC**     | `painel/docs`             | Pages (VitePress)        | —                   | explica  |
| **PAYFLOW** | `painel/payflow`          | Worker                   | **D1** (SQLite)     | cobra    |
| DESKTOP     | `desktop/` + `src-tauri/` | Tauri 2 (Rust + WebView) | local / ponte HTTP  | §8       |

O que isto tem de sólido: fronteiras claras, uma base por responsabilidade, publicação única e
atómica dos 5 (confirmado a 06/10 no mesmo commit), 37 scripts de operação com verificação própria,
e um retrato versionado da produção (`supabase/PRODUCTION_SNAPSHOT.json`) contra o qual os testes
de segurança correm.

O que tem de frágil, por ordem de consequência:

1. **Duas bases e nenhuma transacção entre elas.** Uma factura vive no Supabase; o pagamento vive
   no D1. A reconciliação é por `provider_charge_id` e idempotência aplicacional — bem feita, mas é
   código a fazer o que uma transacção faria. Com `sigaUrl: null` nem isso está em uso.
2. **A produção é também o ambiente de testes** (A8 da auditoria 12, ainda aberto). Os 43 restos de
   E2E são a prova material: os testes @live criam escolas, tenants e subdomínios verificados na base
   que serve as escolas reais.
3. **Sem `npm workspaces`**, cada app instala em separado e as versões divergem em silêncio. Foi
   exactamente a classe de problema do PR #92 («versões Tauri alinhadas»).
4. **Não há endpoint de saúde no SIGA.** O PayFlow tem `/api/v1/health` e foi por ele que se
   diagnosticou o 503 de 02/10. O SIGA, que é a app que as escolas usam, não tem equivalente: a
   sondagem só sabe dizer que a raiz devolve 200.

---

## 4. Módulos

18 módulos declarados, todos com ficheiros no sítio e rota navegável (`siga:check` + 13 testes de
catálogo). Por tamanho do código:

| Módulo       | Linhas | Módulo         | Linhas |
| ------------ | -----: | -------------- | -----: |
| `academic`   | 32 215 | `hr`           |  3 702 |
| `import`     | 15 821 | `access`       |  3 390 |
| `finance`    |  7 392 | `alumni`       |  3 352 |
| `pedagogica` |  7 389 | `messages`     |  3 036 |
| `saas`       |  6 784 | `catracas`     |  2 972 |
| `school`     |  6 746 | `documents`    |  2 867 |
| `arquivos`   |  6 601 | `intelligence` |  1 596 |
| `dashboard`  |  6 340 | `calendar`     |  1 537 |
| `auth`       |  5 932 | `enrollment`   |  1 429 |
| `students`   |  4 823 | `lesson-plans` |  1 090 |

A crítica não é de cobertura — é de **proporção**. `academic` tem 32 mil linhas e a produção tem
uma nota. `catracas` tem 2 972 linhas de código mais 534 de Rust para disparar relés por TCP, e
`attendance_records` tem **zero** linhas. `import` tem 15 821 linhas para importar pautas e alunos
de ficheiros oficiais, e há 10 disciplinas em toda a base.

Nenhum módulo foi exercido por uma escola a sério. O que está provado é que o código passa nos
testes, não que o fluxo escolar aguenta um ano lectivo — essas são afirmações diferentes, e os
relatórios anteriores têm tendência a tratá-las como a mesma.

---

## 5. Lógica escolar

O desenho está bem: a matemática do Decreto 424/25 vive num sítio só
(`src/lib/angola-academic.ts`), com uma distinção deliberada e documentada entre a versão
**permissiva** (lançamento de notas: mostra o que há) e a **rigorosa** (documento impresso: só com
todos os períodos). As regras de transição por ciclo estão num modelo (`assessment-model.ts`) e são
aplicadas por uma função única (`decidePromotionStatus`), configurável pela escola:

| Ciclo    | Disciplinas em falta | Admissão a exame | PAP |
| -------- | -------------------: | ---------------: | --- |
| Primário |           sem limite |                — | não |
| I Ciclo  |                    2 |                — | não |
| II Ciclo |                    0 |                9 | não |
| Técnico  |                    2 |                — | sim |

**O defeito estava em quem não usava isso.** A pauta exportada em CSV/PDF
(`src/features/academic/pauta-export.ts`, botão «Exportar pauta» em Relatórios Académicos) decidia
por sua conta, em quatro pontos:

| #   | O que a pauta oficial faz                                  | O que a pauta exportada fazia     |
| --- | ---------------------------------------------------------- | --------------------------------- |
| 1   | MFD só com todos os períodos do regime                     | média dos períodos que houvesse   |
| 2   | `decidePromotionStatus` com as regras do ciclo             | `média >= 10`, e nada mais        |
| 3   | nota mínima do modelo em vigor / das Definições            | fixa na escala angolana           |
| 4   | períodos do regime da turma (2 ou 3; Superior é semestral) | três trimestres fixos no selector |

Consequência concreta, e era o que o teste consagrava: um aluno com Português lançado só no 1.º
trimestre saía na **pauta anual** com essa nota como média final e «Transita». E um aluno com média
12 e cinco disciplinas negativas saía «Transita» no II Ciclo, onde a regra tolera zero.

Dois documentos oficiais da mesma turma podiam dizer o contrário um do outro.

**Corrigido** (§6). O que fica registado, sem defeito: a permissividade de
`calculateTrimesterAverage` e `calculateDisciplineFinalAverage` é intencional e os guardas vivem em
quem chama. Funciona, mas é frágil por desenho — qualquer chamador novo herda o comportamento
permissivo em silêncio, que é exactamente como este defeito nasceu. A alternativa seria a função
rigorosa ser a predefinida e a permissiva ter nome próprio (`...ForEntry`).

Ainda em aberto, por não ter sido ensaiado: `student-grade-report.ts` (boletim do aluno) usa a
versão permissiva. Aqui é defensável — é uma vista em curso, tem campo `provisional` e calcula o que
falta para aprovar — mas merece uma decisão explícita em vez de ficar implícita.

---

## 6. Resolvido hoje (commit `305e7972`)

**A1 — a pauta exportada deixa de decidir a transição por sua conta.** `buildPautaExportRows` passa
a receber regime, ciclo, nota mínima e regras de transição; o ciclo vem da classe e do curso da
turma (`inferTeachingCycle`), não da escola, porque uma escola com Superior e Secundário não cabe
num número só. Num trimestre o rótulo passa a ser «Aprovado»/«Em recuperação» — o mesmo que a
tabela do próprio ecrã já usava; a transição é uma decisão anual. Ano a meio: «—». O selector de
período passa a sair de `getPeriodsForCycle`, com «Trimestre»/«Semestre» consoante o ciclo.

Cinco testes novos em `tests/academic/decreto-424-25.test.ts`, incluindo o caso que separa os
ciclos: média 12 com uma disciplina negativa dá `TRANSITA` no I Ciclo e `ADMITIDO A EXAME` no II.

**A2 — um teste que media o tempo da chamada.** `tests/finance/appypay-stale-settling.test.ts`
falhou na suite completa (`expected 599915 to be >= 599950`). O corte dos 10 minutos é calculado
**dentro** de `reconcileAppyPayCharge`, depois de um `await`; a asserção comparava-o com um
`Date.now()` de antes da chamada e tolerava 50 ms — ou seja, exigia que a chamada demorasse menos de
50 ms. Numa máquina com 467 ficheiros de teste em paralelo, não demora. Passa a enquadrar o corte
entre os dois instantes medidos, sem constante de tolerância: não pode voltar a falhar por lentidão.

Esta é a segunda vez que um relatório deste repositório diz «suite verde» com uma falha dentro. No
CI não se via porque o runner é mais rápido do que os 50 ms.

Depois das correcções: `tsc` 0 erros, ESLint 0 erros, `tests/academic/` 335/335,
`tests/routes/` 214/214.

---

## 7. Estrutura de domínios

Verificada ao vivo hoje, e está certa:

| Hostname                                | Esperado         | Resposta |
| --------------------------------------- | ---------------- | -------- |
| `portal-siga.com`                       | Worker SIGA      | 200      |
| `www.portal-siga.com`                   | Pages siga-web   | 200      |
| `app.portal-siga.com`                   | Worker SIGA      | 200      |
| `payflow.portal-siga.com/api/v1/health` | Worker PayFlow   | 200      |
| `docs.portal-siga.com`                  | Pages siga-docs  | 200      |
| `admin.portal-siga.com`                 | Pages siga-admin | 302      |
| `<slug-inventado>.portal-siga.com`      | wildcard → SIGA  | 200      |

O wildcard responder a um slug que nunca existiu é o teste decisivo: cada escola criada é alcançável
no seu subdomínio sem acção por escola. O 522 do `www` (um mês em baixo) fechou a 06/10.

A resolução no código está bem feita e **falha fechada**: `resolveTenantLookup`
(`src/lib/saas/tenant-resolver.ts`) trata hostnames de plataforma e reservados como hostname em vez
de os mapear a uma escola fictícia, e sem hostname não há tenant implícito.

Duas observações:

1. **47 `tenant_domains`, todas `active`, e 42 são de teste** — com `verified_at` preenchido. Não são
   só linhas: são 42 subdomínios escolares verificados e resolúveis para escolas que não existem.
2. `minha-escola.portal-siga.com` é ao mesmo tempo um tenant de produção (activo desde 27/08), um
   domínio personalizado do Worker criado à mão, e o slug a que `resolveTenantLookup` recorre em
   desenvolvimento local. Funciona; é um nome de desenvolvimento a viver na produção.

**Falta DMARC.** Não existe `_dmarc.portal-siga.com`. DKIM e SPF estão alinhados (§10 do relatório
de 06/10), por isso começar em observação é de risco baixo:

```
TXT  _dmarc.portal-siga.com  →  v=DMARC1; p=none; rua=mailto:<caixa de relatórios>
```

---

## 8. Tauri — a app desktop nunca saiu

O código está lá e é sério: 534 linhas de Rust no módulo escolar, disparo de relé de catraca por
socket TCP com **IP privado obrigatório** (recusa endereços públicos), páginas internas
`sigapage://` com CSP por janela e sem capability nenhuma a cobri-las (um `<script>` num modelo de
impressão editável pela escola não toca em nada), updater que só se registra com chave pública
porque registá-lo sem ela fazia a app terminar ao abrir.

E nunca foi publicada:

| Verificação                         | Resultado      |
| ----------------------------------- | -------------- |
| Releases no GitHub                  | **0**          |
| Tags `v*` (o gatilho do workflow)   | **0**          |
| `secrets.TAURI_SIGNING_PRIVATE_KEY` | **não existe** |
| `vars.TAURI_UPDATER_PUBKEY`         | **não existe** |

Em cadeia: sem as duas chaves, `releaseConfig()` devolve `{}` → sem `createUpdaterArtifacts`, sem
`plugins.updater`, sem `latest.json`. Uma versão publicada hoje sairia **sem caminho de
actualização** — cada escola reinstalaria à mão para sempre. E com `bundle.macOS.signingIdentity:
"-"` (assinatura ad-hoc, sem notarização), o Gatekeeper recusa-a num Mac que não seja o que a
compilou.

Mais duas observações:

- **`withGlobalTauri: true`** expõe `window.__TAURI__` à WebView. Está contido porque o frontend é
  local (`frontendDist: "../desktop/dist"`) e as páginas internas não têm capabilities — mas é
  superfície que não é preciso dar.
- **A app desktop não é o SIGA.** `src-tauri` serve `desktop/dist`, que é um invólucro próprio
  (barra de título, paleta de comandos, preferências, painel rápido) com 105 ficheiros. O portal
  escolar é outra coisa, servida pelo Worker. São dois produtos a partilhar um nome.
- No CI, `cargo check`/`test` em Windows e macOS só correm na `main` (`if: github.event_name !=
'pull_request'`), por custo de runners — decisão documentada e defensável. O Linux corre nas PRs e
  compila, formata, faz clippy e **abre a app** durante 20 s. O resíduo é que o código condicional
  de plataforma (`cfg!(windows)` nos URLs das páginas, `tauri-nspanel` só em macOS) só é compilado
  depois do merge.

---

## 9. Por decidir — tudo do dono

| #   | Sev. | O quê                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | P0   | **Rodar a `service_role` e o personal access token.** Os dois foram colados em conversa (04/10 e 06/10) e os dois funcionam. Depois de rodar, actualizar o segredo do ambiente `production`, senão a publicação deixa de passar.                                                                                                                                                                    |
| D2  | P0   | **Limpar os 43 restos de E2E da produção.** `npm run siga:e2e-cleanup-stale -- --dry-run` identifica 42 tenants hoje (simulação corrida, nada apagado). É um apagamento irreversível em produção: não o fiz.                                                                                                                                                                                        |
| D3  | P1   | **Projecto de staging.** Enquanto os testes @live criarem escolas na base que serve as escolas reais, D2 volta a acontecer. É a causa, não o sintoma.                                                                                                                                                                                                                                               |
| D4  | P1   | **Decidir o que o PayFlow é.** Sem provedor, sem homologação EMIS e com `sigaUrl: null`, está no ar sem poder cobrar. Ou se configura, ou se assume que é infra-estrutura à espera.                                                                                                                                                                                                                 |
| D5  | P1   | **Assinatura da app desktop.** Gerar o par de chaves do updater (`TAURI_SIGNING_PRIVATE_KEY` + `vars.TAURI_UPDATER_PUBKEY`) e decidir a notarização macOS antes da primeira tag `v*`. Publicar sem isto cria uma base instalada sem caminho de actualização.                                                                                                                                        |
| D6  | P2   | **DMARC** em `_dmarc.portal-siga.com`, a começar em `p=none` (§7).                                                                                                                                                                                                                                                                                                                                  |
| D7  | P2   | **52 tabelas aceitam escrita de `authenticated` sem 2FA** (A5 da auditoria 12, âmbito largo ainda aberto). Exigi-lo em mais tabelas parte fluxos enquanto quase nenhuma conta tiver 2FA — eram 3 de 62 a 04/10, e **não foi possível reconfirmar hoje** (o 2FA vive em `auth.mfa_factors`, que o PostgREST não expõe, e `profiles` não tem coluna de 2FA). A ordem certa é 2FA nas contas primeiro. |
| D8  | P2   | **Dois worktrees abandonados** em `.claude/worktrees/` (09/09, HEAD destacado) com uma versão de `AuthGate.tsx` que respeita `AUTH_DISABLED`. A árvore principal **não** tem esse caminho (0 ocorrências) — o bypass saiu do produto. Ficam as cópias e duas variáveis mortas no `.env` (`AUTH_BYPASS`, `VITE_AUTH_DISABLED`, que nenhum código lê). Podar os worktrees e apagar as duas linhas.    |
| D9  | P2   | **Endpoint de saúde no SIGA**, como o do PayFlow. Foi o `/api/v1/health` que permitiu diagnosticar o 503; o SIGA não tem equivalente.                                                                                                                                                                                                                                                               |

---

## 10. O que ficou por verificar

- **O catálogo da base.** O MCP do Supabase responde `Unauthorized` e o `SUPABASE_ACCESS_TOKEN` do
  `.env` dá 401. O que funciona é o PostgREST com a `service_role`, que mostra tabelas e colunas mas
  não funções, triggers nem políticas (o esquema `private` não está exposto e a `service_role` ignora
  o RLS). Para essas, o estado vem do retrato de 06/10, não de leitura de hoje.
- **A6 da auditoria 12** (fecho de período contornável por escrita directa) continua deduzido das
  funções da base e **não ensaiado**. A migração que o fecha está aplicada desde 06/10; o ensaio ao
  vivo não foi feito.
- **Nenhum fluxo escolar foi exercido de ponta a ponta numa escola real.** Isto é a §4 dita de outra
  maneira, e é o maior ponto cego de todas as 13 auditorias: mede-se o código, não o ano lectivo.
- **A app desktop não foi compilada nesta sessão.** As conclusões da §8 vêm da configuração, do
  código e da ausência de releases, segredos e tags.

---

## 11. A regra que sai desta

**Um relatório não pode dizer «suite verde» sem a ter corrido inteira na máquina onde escreve.** Duas
vezes já — a auditoria 12 e o relatório de 06/10 — se afirmou verde com uma falha dentro, porque o
CI é mais rápido do que a tolerância que o teste media.

E a que vale mais: **contar as linhas de produção antes de descrever o volume.** «49 escolas, 45
alunos, 38 facturas» leu-se como adopção durante duas auditorias. São 43 escolas de teste e uma
escola a usar o sistema.
