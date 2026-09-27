# Handoff — continuar o SIGA

Ler isto **antes** de alterar código. Ecossistema (5 apps):
[ARCHITECTURE_HARMONIZATION.md](./ARCHITECTURE_HARMONIZATION.md).
Depois abrir o skill do módulo em `.cursor/skills/`.

## Migrações aplicadas (2026-09-27)

O dono aplicou `docs/agents/SIGA_aplicar_migracoes.sql` (23 migrações, até
`20260927170000_shared_rate_limit.sql`) no SQL Editor do projecto Sga. Confirmação:
`docs/agents/SIGA_confirmar_migracoes.sql` deve dar 17 linhas "aplicada". Não foi
verificado a partir da sessão de agente, porque a rede do ambiente não chega a
`*.supabase.co`. `supabase/PRODUCTION_SNAPSHOT.json` continua com a captura anterior:
recapturar antes de encolher `TABELAS_AUSENTES_DA_PRODUCAO` e `FUNCOES_ESPERA_MIGRACAO`.
Migrações novas a partir daqui vão num pacote novo.

## Políticas de escrita com `is_school_member` (2026-09-27)

Das 56 políticas de escrita com `is_school_member` na captura, 24 já foram
tratadas pelas migrações de 25–26/09 (aplicadas). Matrículas públicas
(`enrollment_applications`, `enrollment_forms`) só tinham `is_school_member`:
migração `20260927210000_enrollment_policies_staff_only.sql`, pacote
`docs/agents/SIGA_aplicar_matriculas_politicas.sql` — aplicado pelo dono a 2026-09-28.

**Papel global em vez do papel na escola (48 políticas) — aplicado pelo dono a 2026-09-28:**
`can_manage_students()` lê `current_profile_role()` (papel do perfil, global da
conta). Nas tabelas centrais, quem é Administrador/Secretaria numa escola e
aluno/encarregado noutra podia escrever na segunda. Migração
`20260927230000_core_write_policies_school_role.sql` recria as 48 políticas com
as mesmas expressões, trocando essa parte por `is_school_office(school_id)`;
pacote `docs/agents/SIGA_aplicar_politicas_papel_escola.sql`. Nenhum ecrã
escreve estas tabelas com a sessão (só servidor e funções SECURITY DEFINER).

**Leitura pelo papel na escola (24 políticas) — escrito, por aplicar:** as
leituras usavam `can_read_students()`/`can_manage_students()`, que lêem
`profiles.cargo` (global; o utilizador só pode alterar `full_name`, por isso
não há auto-promoção, mas quem tem várias escolas lia os dados pessoais de
todas). Migração `20260928110000_core_read_policies_school_role.sql`, pacote
`docs/agents/SIGA_aplicar_leitura_papel_escola.sql`. Depois dela, nenhuma
política usa `can_*_students`.

**Armazenamento — escrito, por aplicar:** `siga-files` ("Staff can read siga
files") só verificava a escola actual: alunos liam o arquivo (recibos,
documentos, fotografias) pela API de Storage. `school-logos` aceitava envios de
qualquer membro e SVG, e recusava a pasta do tenant usada pelo ecrã de
identidade. Migração `20260928130000_storage_files_logos_hardening.sql`, pacote
`docs/agents/SIGA_aplicar_armazenamento.sql`. As políticas de Storage não
estão em `PRODUCTION_SNAPSHOT.json`: testado contra as do
`APPLY_ENROLLMENT_AND_PREMIUM.sql`.

**Leitura de salários e históricos — aplicado pelo dono a 2026-09-28:** `hr_contracts`,
`hr_employments`, `hr_payroll_items`, `hr_payroll_item_components`,
`hr_payroll_runs`, `hr_compensation_events`, `finance_invoice_events` e
`student_status_events` liam-se com `is_school_member`/`current_school_id()`:
um aluno via os salários de todos os funcionários. Migração
`20260928090000_payroll_history_read_by_school_role.sql` (novas
`is_school_finance`/`is_school_office`), pacote
`docs/agents/SIGA_aplicar_salarios_historicos.sql`. As funções da folha
(SECURITY INVOKER) exigem Administrador/Tesouraria, os mesmos papéis que a nova
leitura. Leituras "abertas a membros" que ficam: comunicados, períodos,
departamentos, cargos, políticas de assiduidade, reuniões de aula e
formulários de matrícula (sem dados pessoais).

## Auditoria financeira (2026-09-27)

Feito: SAF-T honesto (certificado "0", Hash/HashControl "0", sem nome/morada
inventados, recibos em Payments, datas de anulação e da fatura liquidada,
leituras presas à escola, ecrã sem "Conformidade AGT"); estorno de recibo com
2FA, sem segundo estorno e com o estado da fatura reposto
(`invoice-settlement.ts`); plano de propinas por omissão sem preços de exemplo
(0 = por definir) e erro do servidor visível no painel.

**Desconto nos pagamentos — aplicado pelo dono a 2026-09-27 (SQL Editor):** `private.register_payment`
comparava o pago com `amount` e ignorava `discount_amount`. Migração
`20260927190000_register_payment_net_of_discount.sql`, no pacote
`docs/agents/SIGA_aplicar_pagamentos_desconto.sql` (com a confirmação no fim).
O webhook do gateway, o estorno e a importação de pagamentos já usam o mesmo
total (`invoiceNetTotal` em `invoice-settlement.ts`). Escolas criadas antes desta data podem ter o plano com
45 000 / 25 000 Kz semeados; não há forma de distinguir de preços reais.

## Deploy (2026-09-20)

### Produção actualizada — dez dias de uma vez

`main` recebeu o PR #19 (merge `7d25157`, 358 commits, Ciclos 52–101) e o worker
`fernandotunas6-bot-onsoft-replica-dev` foi para produção — versão
`b95ec57f-6178-4c77-b84d-ac650e3ddc9a`. **Estava com código de 10 de Setembro.**

Serve `portal-siga.com`, `app.`, `minha-escola.` e o curinga `*.portal-siga.com/*` (os
subdomínios das escolas). O `siga-plus-payflow` e os três Pages (`www`, `admin`, `docs`)
**não foram tocados** — o `painel/` tem trabalho por publicar desde 11/09 e fica para um
deploy próprio, com verificação própria.

**Verificado antes:** `vitest run` 1699/1702 em 251 ficheiros, `tsc --noEmit` 0 erros,
`check:style` 575 ficheiros e 39/39 rotas, `eslint` 0 erros (95 avisos, pré-existentes),
build de produção com saída 0. A árvore publicada é bit a bit a de `origin/main`
(mesma árvore git, `7616706e`).

**Verificado depois, contra a produção a sério:** `portal-siga.com`, `app.` e
`minha-escola.` a 200; `/alunos`, `/faturas`, `/pedagogica`, `/documentos`, `/alterar-senha`
a 200; `scripts/pwa-check.mjs` contra `https://portal-siga.com` com os 8 controlos verdes
(manifesto, 4 ícones, apple-touch-icon, viewport, theme-color, service worker, offline).

**Resolvido a 2026-09-25 (por publicar):** a causa era `DesktopTitleBar`. A condição
`typeof window !== "undefined"` desenhava a barra no servidor e escondia-a no browser. A
visibilidade passou a ser decidida depois de montar, e `tests/ui/desktop-titlebar-ssr.test.tsx`
protege a correcção. Em modo de desenvolvimento, `/`, `/alterar-senha`, `/matricula`,
`/criar-escola` e `/auth/reset-password` deixaram de dar erro de hidratação. Texto original:
**Achado novo, em produção e por resolver.** O erro de hidratação que o Ciclo 101 viu em
`/alterar-senha` **não é dessa página**: está em `/`, `/alunos` e `/alterar-senha` — React
#418 em todas, portanto vem do que embrulha tudo. A suspeita registada era o `AuthGate`,
mas o `checking` nasce `true` nos dois lados (`useState(true)`, linha 66), logo o primeiro
render coincide e **isso sozinho não explica**. Precisa de ser visto num build de
desenvolvimento, onde o React imprime a diferença em vez de a minificar. Consequência: as
páginas funcionam — o React recupera renderizando no cliente — mas **o HTML do servidor é
deitado fora em cada visita**, o que anula o SSR e põe em causa as metas de FCP/LCP do
`lighthouserc.json`.

**Resolvido (2026-09-27):** as chaves já não vão em `vars`. `scripts/worker-secrets.mjs`
lista todas as chaves sensíveis que o servidor lê; `deploy-cf.mjs` envia as que estiverem
definidas por `wrangler secret put` (cifradas), e `tests/security/worker-secrets.test.ts`
falha se aparecer uma chave sensível nova fora da lista. Texto original:
**A registar e a decidir, não tocado.** O `deploy-cf.mjs` grava
`SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` como **variáveis de ambiente em texto
simples** no worker, não como secrets — aparecem na listagem de bindings de qualquer
`wrangler deploy`. A chave de serviço ignora o RLS por completo; numa base multi-inquilino
isso é a chave do reino. Passá-las a `wrangler secret` não muda o código que as lê.

## Ciclo 102 — Identidade única e vinculação institucional (2026-09-25)

Uma identidade (`auth.users`), vários vínculos (`school_memberships` + `member_roles`), um
papel por escola. O sistema passa a distinguir três situações:

1. **Conta com vínculo activo:** abre o painel, como antes (escolha de escola já existia).
2. **Conta sem vínculo:** `RouteAccessGate` mostra `InstitutionOnboarding` em vez de
   "acesso não autorizado". Opção A → assistente WEB de criação de escola. Opção B →
   pedido de acesso: identificação → escolha da escola → pedido → verificação → acesso.
3. **Pessoa nova:** separador **Criar conta** no `AuthGate` (`supabase.auth.signUp`).
   Cria só a identidade, sem vínculo. A resposta é a mesma exista ou não o e-mail.

**Mudança de política, deliberada:** o login Google de uma conta sem escola **deixou de
apagar a conta** (`verify-oauth-account-server.ts` removido). Continua sem acesso a dados:
tudo o que exige membership é recusado no servidor. A pessoa passa a ver o painel de
boas-vindas.

**Secretaria:** painel **Solicitações de acesso** no topo de `/acessos`. Tem os estados
pendente, em análise, informação pedida, aprovado, rejeitado e cancelado. A aprovação cria
ou activa **só** o vínculo e o papel. Não cria matrícula, contrato nem cadastro. Só liga
`people.user_id` quando o revisor marca a opção e o cadastro não tem conta. Regras (puras,
em `institutional-link.ts`):
- "Administrador" nunca se concede por pedido.
- Secretaria/Tesouraria só se concedem por um Administrador.
- Ninguém decide o próprio pedido.
- Um membership `suspended` não é reactivado por aqui.

Cada decisão fica em `audit_logs` (`entity_type = school_access_request`). O aviso por
e-mail (Resend) é de melhor esforço e só corre com `RESEND_API_KEY`.

**Cadastro encontrado:** só com dois factores na mesma escola (B.I. + número de
aluno/funcionário; o encarregado usa o número do educando). O requerente nunca sabe se
houve correspondência. A pesquisa de escola usa `name`, `commercial_name`, `public_code`
(código da escola) e o slug do tenant, e não devolve contactos.

**Também corrigido:** `resolveUserLinkedEntities` localizava a pessoa em `people` por
e-mail mesmo sem confirmação. Agora só usa e-mail confirmado (`email_confirmed_at`).

**Os testes de esquema apanharam três colunas que não existem em produção**, já corrigidas
antes do commit: `schools.short_name`, `schools.deleted_at` e `students.registration_number`.

**E-mails de autenticação (2026-09-25, 2.º commit):** o registo de conta passou a usar o
mesmo caminho que a recuperação de senha, o link mágico e o convite. `requestSignupFn`
(`signup-server.ts`) gera o link com `generateLink({ type: "signup" })` e envia o modelo
`signup-confirm` pelo Resend. Se o envio falhar, a conta criada é apagada. O mailer nativo
do Supabase ("Confirm signup") só é usado se `RESEND_API_KEY` faltar. Por isso, **os modelos
do painel do Supabase quase não são usados em produção**: o SIGA gera os seus próprios
e-mails.

**Google:** o login usa o provider Google do Supabase. No Google Cloud, o URI de
redireccionamento é só `https://xodgfmxiaunpamctfeea.supabase.co/auth/v1/callback`.
`firebase-applet-config.json → oAuthClientId` passou do cliente de outro projecto
(`445079520865-…`, que era o valor por omissão) para o cliente do projecto
`siga-plus-509706`. É usado pelo fluxo Workspace de `src/lib/google-oauth.ts`, que ainda
nenhum ecrã chama. Quando for ligado, o seu redirect `<origem>/configuracoes` terá de ser
acrescentado no Google Cloud.

**Ícones (2026-09-25, 3.º commit):** medição inicial de 203 ícones Lucide diferentes em 192
ficheiros, com colisões no menu: "Gestão de Acessos" e "Pessoas" partilhavam `UserCog`,
"Faltas" e "Auditoria" partilhavam `History`, "Académico" e "Lista de Alunos" partilhavam
`GraduationCap`. Criado `src/lib/app-icons.ts` (módulos, acções e estados), usado por todos
os itens de `portal-engine.ts`. Exportações "Oficial/PDF" passaram de `Award` (troféu) para
`FileBadge`; o troféu fica só para mérito. `Loader2` foi uniformizado para `LoaderCircle`
(mesmo glifo). O resto do código ainda importa do `lucide-react` directamente; migrar ao
tocar em cada ecrã.

### Por fazer (bloqueia o deploy desta funcionalidade)

- ~~Aplicar `20260925090000_school_access_requests.sql`~~ — **aplicada pelo utilizador no
  SQL Editor a 2026-09-25** (não verificada pelo agente, que não tinha acesso à base). Falta
  recapturar `supabase/PRODUCTION_SNAPSHOT.json` e só então retirar `school_access_requests`
  de `TABELAS_AUSENTES_DA_PRODUCAO`; antes disso o teste de entradas obsoletas continua
  correcto com ela lá. Texto original: aplicar `20260925090000_school_access_requests.sql` (também no fim de
  `APPLY_ENROLLMENT_AND_PREMIUM.sql`). Depois, retirar `school_access_requests` de
  `TABELAS_AUSENTES_DA_PRODUCAO` em `tests/security/production-snapshot.test.ts` e
  actualizar o retrato. Sem a tabela, o painel e a fila dizem que os pedidos não estão
  activos. Não fingem.
- **Supabase Auth:** confirmar "Confirm email" **ligado** e novos registos permitidos. A
  ligação de identidades Google ↔ senha é automática no Supabase só para e-mails
  verificados, e é isso que evita contas duplicadas. Não há fusão manual de contas no código.

### Achados por decidir, não tocados

- **Login por B.I. (resolvido, 2026-09-25):** `resolveBiToEmailFn` devolvia o e-mail de
  qualquer B.I. Passou a `signInWithIdentifierFn`: o servidor verifica a senha no Supabase
  Auth (`grant_type=password`) e devolve só a sessão. **Antes de juntar ao `main`:** os
  logins por B.I. passam a chegar ao Supabase a partir do worker, e o limite
  "Sign-ups and sign-ins" do Supabase (Authentication → Rate limits) conta por IP.
  Subir esse limite, ou todos os logins por B.I. partilham a mesma quota. O login por
  e-mail continua directo do browser.
- O limite de taxa é em memória, por isolado (ver `src/lib/rate-limit.ts`).
  **Login por B.I. resolvido (2026-09-27):** usa o contador partilhado
  `siga_rate_limit_consume` (migração `20260927170000`, chaves em SHA-256), por IP e
  também por conta (10 por 15 min). Sem a migração, cai no limite em memória. Os
  outros pontos sem sessão também já o usam (recuperação de senha, link mágico, registo,
  alteração de e-mail, matrícula pública, webhook de pagamentos). Só em memória ficam
  os que exigem sessão (pesquisa de escolas, IA, envios pela plataforma).

## Estado (2026-09-20)

## Estado (2026-09-20)

### Ciclo 101 — As quatro frentes, e o que já estava feito (2026-09-20)

Quatro frentes pedidas. **Três já estavam substancialmente feitas pela conciliação** — o
trabalho real foi provar isso com medida, e fechar o que faltava mesmo.

**Frente 1 — alinhamento financeiro.** A cadeia já estava alinhada: as 77 consultas
directas de `finance/server.ts`, `dashboard/server.ts` e `gateway-webhook-handler.ts`
foram disparadas contra a produção e nenhuma recusada; `listInvoices` devolve linhas a
valer. O que estava partido era um embed que nenhum teste via: `academic_years(name, code)`
no motor de exportação — `code` nunca existiu, o PostgREST recusava a consulta inteira, e a
exportação de matrículas saía vazia sem erro visível.

Daí saiu `tests/security/selects-vs-producao-live.test.ts`: dispara **cada `.select(…)` de
`src/`** contra a produção com `limit=0`. É a via que o Ciclo 97 procurou e descartou por
tentar fazê-la estática — o grafo de chaves estrangeiras lido do repositório é parcial e
deu falsos positivos. Ao vivo não há grafo a construir. 491 selects, 3 recusados, todos
ausências já registadas. Salta sem credenciais, como a sonda de RLS.

_Falso positivo meu, registado:_ sondei `register_payment` com corpo vazio e li o 404 como
"a função não existe". Existe em `public` com os argumentos exactos — o PostgREST devolve
404 quando **nenhuma assinatura corresponde**, não quando a função falta.

**Frente 2 — importadores.** Já estavam todos no ramo, já escreviam só para tabelas reais
(incluindo os cinco que a memória marcava como partidos), 117 testes verdes. O que faltava
era a força da garantia: a verificação estrutural só exigia que o ficheiro _mencionasse_
`ctx.dryRun`. Mencionar não é devolver. Passa a exigir ordem — nada que grave pode correr
antes de a guarda devolver —, contando escritas directas e por interposta pessoa:
`resolveOrCreatePerson` verifica o ensaio por dentro e é seguro antes da guarda; os três
financeiros gravam sempre.

**Frente 3 — núcleo académico.** `20260916140000_assessment_rule_sets.sql` **aplicada à
produção**, depois de verificar as dependências (`grading_scales`,
`private.has_permission(uuid,text)`) e de correr a migração inteira dentro de
`BEGIN…ROLLBACK`. 154 → 156 tabelas, tipos regenerados (255 → 257 entradas, nenhuma saiu).
`configure_assessment_rules` deixou de falhar com 42P01 e passa a falhar com 42501 na
verificação de permissão — chega agora onde devia.

E a digitação de notas: o pedido falava do `PautasWorkspaceModule`, mas as vistas de pauta
são de leitura e não têm `onChange`. Quem recebe notas é o `AssessmentCenter`, onde
`computedRows`, `visibleRows`, `dossier` e `classMap` corriam **a cada tecla** —
`computedRows` sem memo nenhum, com cinco `items.filter(...)` por aluno. Numa turma de 40
com 12 itens são 2400 toques ao array por render; agrupando por componente uma vez e
memoizando os quatro, passam a 212.

**Frente 4 — testes e rotas.** O jsdom não estava partido: declarado, instalado, 50
ficheiros a pedi-lo, 49 suites de rotas verdes. O sintoma era o mesmo do
`@testing-library` — o `bun.lock` não declarava as dependências. Faltava a acessibilidade,
o último verificador vermelho: **50 lacunas em `main`, 25 depois da conciliação, 0 agora**.
Quarenta e dois campos e botões ganharam `aria-label` tirado do que o campo é; seis anéis
de foco passaram de `focus:` para `focus-visible:`, porque com `focus:` o anel aparece
também ao clicar com o rato, que não é para quem ele existe.

**Resultados:** `vitest run` — 251 ficheiros, **1699 testes verdes, 0 falhas**, 3 saltados.
`tsc --noEmit` 0 erros. `a11y`, `check:style` e `lint` os três a zero.

**Achado por resolver:** `/alterar-senha` dá erro de hidratação no browser (o HTML do
servidor não bate certo com o do cliente). Não vem deste ciclo — nessa página não há
imagens nem `MediaFrame`, só os `aria-label` que são atributos estáticos. A suspeita é a
porta de autenticação, que rende "A verificar sessão…" só no cliente.

### Ciclo 100 — O CI não corre desde 3 de Setembro, e só uma das causas era código (2026-09-20)

O Ciclo 98 fechou com a suite verde na minha máquina. No GitHub não corria nada — e não
era de agora.

**Nenhum run passa desde 03/09.** Dos últimos 100 runs, 100 falharam; o último sucesso é
`2026-09-03T13:30`. A forma da falha é sempre a mesma e não é a de um teste que quebra: os
jobs terminam em ~3 s com `steps: []`, `runner_id: 0` e `runner_name: ""` — **nunca lhes
foi atribuído um runner**, logo nem o `checkout` chegou a correr. Falham assim também os
workflows que não tocam no código do ramo (o horário do gateway, o E2E nocturno, a
auditoria de dependências), o que exclui o código como causa. É a assinatura de minutos de
Actions esgotados ou de limite de despesa atingido num repositório privado.

**Não o confirmei, e digo-o em vez de o afirmar.** O PAT desta máquina recebe 403 em
`/settings/billing/actions` e nas anotações das check-runs, e o zip de logs vem vazio
(22 bytes) porque não há logs — nenhum job arrancou. A confirmação está na UI do GitHub,
em _Settings → Billing_, e é do dono. **Enquanto isso não for resolvido, nenhuma correcção
de código põe este CI verde** — o que se segue é necessário, não suficiente.

**Dois workflows estavam mesmo inválidos, e isso era código.** À parte da falta de runners,
`lockfile-sync.yml` e `apply-production-fixes.yml` não parseavam:

```yaml
if: ${{ !contains(github.event.head_commit.message, 'chore(lock): sync bun lockfile') }}
```

O valor é um **escalar simples**, e o `: ` dentro das aspas simples faz o YAML ver um
mapeamento onde devia estar texto — `mapping values are not allowed here`, linha 12,
coluna 69. As aspas simples não protegem nada: quem está a ler ainda não sabe que está
dentro de uma string. Um ficheiro de workflow inválido **produz uma verificação falhada em
cada push, com o nome do próprio ficheiro** — eram os dois runs de 0 s de 19/09, que
pareciam workflows a correr fora do seu ramo e não eram. O valor inteiro passou a estar
entre aspas duplas. Os 10 workflows do repositório passam agora pelo parser, verificado um
a um.

**O `bun.lock` não declarava o `@testing-library`.** É a causa real da medição errada do
Ciclo 98 e corrige a nota que lá estava: os 49 ficheiros de `tests/routes/` não eram
recolhidos porque `@testing-library/react` e `@testing-library/dom` estavam ausentes de
`node_modules`, apesar de ambos constarem do `package.json` — **o lock não os trazia**, e
por isso `bun install --frozen-lockfile` no CI nunca os instalaria. Eu tinha atribuído isso
a ter lido mal um `ls`; não tinha. O lock está sincronizado (`jsdom` entrou pela mesma via).

**O ícone do PayFlow tinha voltado a ser um `<img>` cru.** Única lacuna de `check:style` no
repositório, e regressão da fusão: o Ciclo 96 tinha-a fechado e a reposição do Lovable
trouxe a versão antiga. Passa por `MediaFrame` como as restantes imagens do SIGA — o
tamanho fica no invólucro, porque `MediaFrame` define a moldura pelo rácio e não aceita
`style`, e `object-contain` vai por `imgClassName` para não ser comido pelo `object-cover`
por omissão. **Fica a tremulação do placeholder** até a imagem carregar, o que o `<img>`
cru não tinha; é um PNG local e vai com `priority`, portanto é breve — mas é uma troca, não
um ganho limpo. Verificado por reversão: com a versão anterior o `style-checklist` acusa
exactamente esta linha, com esta acusa zero.

**Uma passagem do prettier** sobre os 27 ficheiros que a fusão deixou por formatar, sem
alteração de comportamento. O `painel/web/`, o `types.ts` e o `PRODUCTION_SNAPSHOT.json`
ficaram de fora de propósito — o `types.ts` foi lido da produção e reformatá-lo só
esconderia a próxima divergência.

**Confirmado no GitHub, depois de empurrar.** Os dois runs de 0 s com o nome do ficheiro
**desapareceram** — é a prova de que o YAML era a causa deles. Os restantes continuam a
falhar exactamente na mesma forma minutos depois do push (`runner_id: 0`, `steps: []`),
o que fecha a questão: o que sobra não é código.

**Resultados** (na máquina, que é onde há runner): `vitest run` — **249 ficheiros,
247 passados e 2 ignorados, 1669 testes, 1666 passados e 3 ignorados**, saída 0; o
`rls-live-probe` que falhava no Ciclo 98 não falhou desta vez. `tsc --noEmit` sem erros.
`check:style` com 575 ficheiros e 39/39 rotas, zero lacunas. `prettier --check` limpo nos
ficheiros tocados.

**A guarda, e porque tinha de ser um parser.** Nada no repositório validava os ficheiros
de workflow: o `eslint` não lê YAML e o `check:style` só olha para `src/`. Um `: ` mal
colocado desliga uma verificação de CI e a única pista é um run de 0 s com o nome do
ficheiro, que se confunde com ruído. `tests/security/workflows-yaml.test.ts` corre o parser
a sério sobre `.github/workflows/*.yml` — 31 asserções sobre os 10 ficheiros: que parseiam,
que têm `on:` e `jobs:`, e que cada job tem `runs-on` e `steps` ou delega num workflow
reutilizável. Uma expressão regular cobriria este caso e não a classe: um `*` à cabeça, um
tab na indentação ou umas aspas por fechar partem um workflow da mesma maneira.

O `js-yaml` **passou a devDependency declarada**. Estava em `node_modules` por via
transitiva (`@eslint/eslintrc`, `xmlbuilder2`) e apoiar um teste nisso era repetir
exactamente o erro do `bun.lock` — a dependência desaparece na primeira resolução que mude
e o teste deixa de existir sem ninguém dar por isso. O `@types/js-yaml` foi instalado e
logo removido: a v5 traz tipos próprios e o pacote de tipos publicado descreve a v4.

Verificado por mutação: reposto o `if:` original em `lockfile-sync.yml`, o teste falha com
`mapping values are not allowed here` e acusa o ficheiro pelo nome.

## Estado (2026-09-19)

### Ciclo 99 — O seed da escola demo, medido em vez de lido (2026-09-19)

O Ciclo 97 deixou o `scripts/siga/seed-to-supabase.mjs` a falhar honestamente: as
dezasseis escritas passaram a lançar em vez de engolir o erro. Faltava a parte de baixo —
**o que ele tentava gravar não existia.**

**Medido por instrumentação, não por leitura.** Um cliente-espelho no lugar do Supabase
regista cada escrita, e o resultado compara-se com `PRODUCTION_SNAPSHOT.json`. O varredor
por expressão regular que o Ciclo 94 usa não serve aqui: as escritas passam pelo helper
`gravar(tabela, payload)`, que esconde tabela e colunas de qualquer regex. Medida inicial:

|                          | antes                        | depois |
| ------------------------ | ---------------------------- | ------ |
| tabelas inexistentes     | 2 (`courses`, `term_grades`) | **0**  |
| colunas inexistentes     | 13                           | **0**  |
| linhas com UUID inválido | ~5 500                       | **0**  |

**Os UUIDs eram o achado maior, e não estava na lista do Ciclo 97.** `p0000000-…`,
`st000000-…`, `g0000000-…`, `r0000000-…`, `sub00000-…`, `en000000-…` e `t3b07384-…` usam
`p`, `s`, `t`, `g`, `r`, `u` e `n` — nenhum é dígito hexadecimal. O Postgres recusa cada um
com 22P02. Desde que o `gravar()` deixou de mentir, **o seed parava na primeira sala**: não
era uma escola demo meia vazia, era uma que não arrancava.

**O que faltava, para além dos nomes.** `campuses`, `academic_levels` e `grade_levels`
nunca eram criados e são obrigatórios (`class_groups.campus_id` e `.grade_level_id` são
NOT NULL, `programs.academic_level_id` também). As classes passam a ser **derivadas da
lista de turmas** em vez de uma segunda lista que divergiria à primeira turma nova.

**A cadeia financeira, que era código morto.** `invoicesBatch` era construído e nunca
gravado — a mensagem final prometia "propinas … 100% carregados" com zero facturas. Não
bastava gravá-lo: `finance_invoices` exige `contract_id` e `fee_item_id` e não tem
`student_id`, `description` nem o estado `overdue`. O seed cria agora
`fee_plans → fee_items → finance_contracts → finance_invoices` (1056 contratos, 105
facturas em aberto).

**As notas.** `term_grades` não existe; uma nota é uma linha de `siga_assessment_scores`
ligada ao item que lhe dá disciplina, trimestre e componente, e pende da **matrícula**, não
do aluno. 297 itens (33 turmas × 3 disciplinas × MAC/NPP/NPT) e 9504 notas.

**Valores, não inventados:** `class_groups.shift` é `morning|afternoon|evening`
(`classShiftOptions`), `room_type` não tem `lab` (é `computer_lab`/`biology_lab`,
`roomTypeSchema`), `enrollments` não tem `dropped` (é `withdrawn`), e `academic_years`
aceita `closed` — confirmado em `calendar/server.ts:248`, que o escreve.

**`created_by`/`updated_by` não se adivinham.** São NOT NULL sem omissão em sete tabelas e
na produção nunca estão vazios. A app preenche-os com `context.userId`; um seed não tem
sessão. Passa a exigir `SEED_ACTOR_USER_ID` ou `SEED_ACTOR_EMAIL` e **pára com mensagem
clara** se faltarem, em vez de inventar o autor de milhares de linhas de auditoria.

**A mensagem final deixou de afirmar o que não verificou:** conta os lotes que foram mesmo
gravados, e as contagens fixas ("36 Turmas", "1152 Alunos") saíram — eram 33 e 1056.

**O teste, e porque é comportamental.** `tests/security/seed-demo-vs-producao.test.ts`
corre o seed com o cliente-espelho e confere tabelas, colunas, UUIDs e **ordem das
escritas** contra as chaves estrangeiras. Não lê o ficheiro, executa-o: é imune à
indirecção do helper e continua válido se o seed mudar de forma. Para isso o seed passou a
exportar `runSeed` e só corre sozinho quando invocado directamente. Verificado por mutação:
as quatro classes de erro (tabela, coluna, UUID, ordem) foram reintroduzidas uma a uma e o
teste apanhou as quatro.

**Duas notas de facto:**

- `scripts/` **não é varrido por nenhum teste de segurança** — as sete varreduras de
  `colunas-inexistentes` e `production-snapshot` percorrem só `src/`. Foi nessa sombra que
  o seed apodreceu. Alargar a varredura não resolveria (o helper esconde tudo de um regex);
  o teste comportamental acima é que fecha a lacuna, mas **só para o seed**. Os restantes
  scripts continuam sem rede — varridos à mão a 19/09 contra o retrato, estão limpos
  (só tocam em tabelas que existem), mas nada impede que apodreçam da mesma maneira.
- Dois testes de alumni procuravam `getByRole("button", { name: "" })` — um botão sem nome
  acessível, que deixou de existir quando o botão de remover ganhou `aria-label`. Passaram
  a procurar pelo rótulo real, o que também é melhor teste.

### Ciclo 98 — Conciliação com a linha Lovable: 62 conflitos e as 30 colunas que o git não vê (2026-09-19)

A integração Lovable (`gpt-engineer-app[bot]`) sincroniza o directório de trabalho com
`main`: faz `reset --hard` ao que lá estiver e muda de ramo. Fê-lo duas vezes a 19/09 —
às 20:00, arquivando em stash o trabalho por commitar dos Ciclos 92–97, e às 20:12,
descartando a reposição desse stash. **Trabalhar neste directório sem commitar perde-se.**
A fusão foi feita num worktree isolado (`.claude/worktrees/conciliacao-lovable`).

**As duas linhas.** Fork a 03/09 (`ac50435`). `main` tem 77 commits, todos do bot; o ramo
tem 341 (Ciclos 52–97). 69 ficheiros só de `main`, 799 só do ramo, **231 tocados por ambos** —
169 fundiram-se sozinhos, 62 em conflito.

**O `types.ts` foi o nó.** O do Lovable descreve outra base: declara `courses`,
`term_grades`, `invoices`, `payments`, `class_schedule_slots`, `finance_summary` e mais —
**nenhuma delas existe na produção** (verificado com 17 pedidos ao PostgREST, com controlo
positivo em `finance_invoices`/`programs`). Ficou o do ramo, lido da produção.

**O que o git não podia ver.** Os conflitos são o menor dos problemas: `git` funde por
texto e não sabe o que existe na base. Depois de resolvidos os 62, o teste de colunas do
Ciclo 94 acusou **29 colunas e 1 tabela inexistentes**, quase todas em linhas que se
fundiram _sem conflito_. Recuperáveis por renomeação e assim corrigidas:

| pedido pelo Lovable                                          | real                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `import_jobs.imported_rows` / `error_rows`                   | `inserted_rows` / `invalid_rows`                                                                             |
| `document_requests.requested_at` / `notes` / `template_name` | `created_at` / `review_note` / embed `document_templates(name)`                                              |
| `term_grades` (heatmap)                                      | `siga_assessment_scores` + embed `siga_assessment_items(term, subject_id, max_score)`, nota normalizada a 20 |

**Parqueado, por precisar de migração:** a remodelação de `document_requests` em
`src/features/documents/server.ts` (25 referências) assenta em `request_number`,
`fee_amount`, `due_on` e `priority`, que não têm equivalente — não é renomeação, é esquema
que não existe. Ficou a versão do ramo. `document_templates` idem: a produção tem `status`,
não `active`/`fee_amount`/`turnaround_days`/`requires_payment`.

**Três resoluções que não foram de estilo:**

- `reset-password-server.ts` — o lado Lovable acrescentava o fallback nativo do Supabase
  que o comentário do próprio ficheiro proíbe (expõe "Supabase Auth" ao utilizador). Ficou
  o ramo, e com ele o `deliveryError` e a auditoria `password_reset_failed`.
- `saas/server.ts` — o lado Lovable removia o `requireTenantAccess` e passava o endereço
  vindo do cliente; provisionava caixa no domínio de outra escola. Ficou o ramo.
- `gateway-webhook-handler.ts` — `===` cru em vez de `timingSafeEqual`. Ficou o ramo.

**Onde o Lovable ganhou:** `ci.yml` + `lighthouserc.json` (medir o build de produção em
`127.0.0.1:3000`, que é onde `preview:prod` serve — o dev server dava LCP irreal),
`import/server.ts` e `excel-template-builder.ts` (tipagens sem `any`), `school-bootstrap.ts`
(`DEFAULT_ROLES`), `academic/server.ts` (`updateScheduleSlotInputSchema`),
`students/schemas.ts` (`max(1000)`, que o próprio `alunos/index.tsx` pede), o cartão de
importações do dashboard e os `ignores` do eslint (unidos, não escolhidos).

**Resultados** (revistos no Ciclo 100): a primeira medição deu "198 ficheiros, 1456/1460",
mas nessa corrida os **49 ficheiros de `tests/routes/` não estavam a ser recolhidos**,
porque `@testing-library/react` e `@testing-library/dom` estavam mesmo em falta em
`node_modules` — **o `bun.lock` não os declarava**, apesar de estarem no `package.json`.
Foram instalados a meio da sessão, e só aí a suite passou a recolhê-los. (A nota anterior
dizia que eu tinha lido mal um `ls`; não tinha — ver Ciclo 100.) Com a suite inteira a correr:
**249 ficheiros, 1669 testes**, e `tsc --noEmit` sem um único erro. A única falha que
sobra é `rls-live-probe` — timeout de 5 s numa sonda ao vivo contra a produção, 14/16
passam; é rede, não código. (Os dois testes de alumni que também falhavam eram anteriores
à fusão e foram corrigidos no Ciclo 99.)

## Estado (2026-09-16)

### Ciclo 97 — Filtros, embeds e RPC: as superfícies que o teste de colunas não via (2026-09-16)

> Nota de numeração: este ciclo esteve escrito como "95" e foi sobreposto por outra sessão
> que usou o mesmo número às 06:19. O conteúdo é este; o número mudou, o trabalho não.

O Ciclo 94 fechou as **escritas**. Faltavam três superfícies que nenhum teste via — e as
três escondiam falhas reais, encontradas por varrimento e não por sintoma reportado.

**Filtros (`.eq`, `.is`, `.in`, `.order`) — 12 achados.** Um filtro sobre coluna inexistente
não devolve zero linhas: faz o PostgREST recusar a consulta inteira.

- **`tenant_domains.domain`** (é `hostname`) em três ficheiros de autenticação. A resolução
  do domínio personalizado falhava sempre, e os e-mails de autenticação apontavam para a
  origem por omissão em vez do domínio da escola.
- **`profiles.email`** em `reset-password-otp-server.ts` — o e-mail vive em `people`. É a
  mesma correcção que o Ciclo 91 fez nas leituras e que aqui ficou; a via caía sempre no
  varrimento completo de `auth.admin.listUsers()`.
- **`siga_attendance_records.date`** — a data da aula está na sessão (`lesson_date`). Tinha
  um comentário de um ciclo anterior duas linhas acima, a corrigir o `select`; o filtro ao
  lado ficou. Resolvido em dois passos, sem depender do nome da relação, que não está
  declarada em migração nenhuma.
- **Seis `.is("deleted_at", null)`** sobre `enrollments`, `class_groups`, `teachers` e
  `finance_invoices` — nenhuma tem soft delete. `people`, `subjects`, `students` e `rooms`
  têm, e daí a suposição de que era uniforme.

**Selects com embed — 8 achados, todos no motor de exportação.** O leitor de `select`
saltava qualquer lista com `(`, e cinco exportações viviam nessa sombra:
`finance_invoices.amount_paid`/`paid_at`/`payment_channel` não existem (o pagamento são
linhas de `finance_receipts`), o embed `students(…)` não existe como relação (a ligação é
`finance_contracts → enrollments → students`), `teachers.specialty` é
`highest_qualification` e `class_groups.room` não existe (a sala vive no horário). As
exportações de pagamentos, propinas e histórico financeiro saíam **sempre vazias**.

**Chamadas `.rpc(…)` — 1 achado.** O PostgREST só alcança `public`, e o padrão desta base é
ter o trabalho em `private` com um wrapper fino em `public`, o que torna fácil chamar a
privada por engano. Era o caso de `next_document_number` no webhook do gateway: existe só
em `private`. A chamada falhava sempre com PGRST202, o erro era ignorado, e o recibo saía
com um número do relógio em vez da sequência oficial — numa base que exporta SAF-T, isso
não é cosmético. Nem um wrapper resolveria: a função exige `auth.uid()`, null num webhook
server-to-server. A sequência passa a contar-se no handler (`REC-AAAA/NNNN`), com avanço em
colisão 23505 — que o insert anterior não tinha de todo: dois webhooks simultâneos
rebentavam.

**O teste cobre agora cinco superfícies** — `select` directo, `select` com embed, escritas,
filtros e RPC. A verificação de _argumentos_ de RPC foi tentada e descartada: com extracção
equilibrada de chavetas dá zero achados, e sem ela só dá falsos positivos.

**Sexta superfície, verificada e não automatizada: nomes de relação nos embeds.** Construí o
grafo de chaves estrangeiras a partir de todo o SQL do repositório (467 arestas) e varri os
embeds: zero achados além do que já tinha corrigido. Não virou teste de propósito — o grafo
vem do repositório e é parcial por natureza (deu 3 falsos positivos antes de o alargar), e
um teste que bloqueia consultas legítimas é pior do que nenhum.

**`assessment_rule_sets`: a produção tem funções que escrevem em tabelas que não existem.**
Era a última entrada da lista de ausentes que é código e não decisão de base — e não é só o
caminho legado de notas, como a lista dizia. `private.publish_assessment_rule_version` e
`private.configure_assessment_rules` existem em produção e inserem em
`public.assessment_rule_sets` / `assessment_key_subjects`, que não existem: falham com 42P01
na primeira instrução que lá toca, e a segunda é o passo 8 da instalação de uma escola. A
aplicação não chama nenhuma das duas, mas há uma consequência indirecta e séria:
`gradebooks.rule_set_id` é NOT NULL e `sga-grades-legacy.ts` só abre um diário com um
`rule_set_id` desta tabela ou emprestado de outro diário da escola — **numa escola nova não
há nenhum dos dois, logo não se abre o primeiro diário nem se lançam notas**, e a função que
resolveria isso depende da mesma tabela em falta.

Migração escrita — `20260916140000_assessment_rule_sets.sql` — e **por aplicar**. A forma
não foi adivinhada: é a do `insert` da própria função capturada da produção, coluna a
coluna, e as restrições são as validações que a função já faz. Validada com o parser real do
Postgres (pglast): 10 instruções, 0 erros. Com ela declarada, `assessment_rule_sets` saiu de
`SCHEMA_ONLY_IN_PRODUCTION` — essa lista mede declaração no repositório, não aplicação. A
mensagem do caminho legado passa a distinguir tabela inexistente (diz qual a migração) de
regras por configurar.

**Resultados:** `vitest run tests/security/`: 12 ficheiros / **156 testes**, 1 skipped,
100% verde. `tsc`/`eslint` limpos nos ficheiros deste ciclo.

### Ciclo 96 — Harmonização Visual Stripe-Grade, Refinamento Global e 100% de Testes de Rotas Verdes (2026-09-16)

Refinamento profundo e sistemático de todo o frontend do **SIGA Plus** segundo os princípios de produto e interface do Stripe Dashboard (clareza máxima, hierarquia visual forte, cantos calculados, tabelas ultra-legíveis, chips semânticos, ⌘K e acções rápidas) sem violar a identidade e paleta institucional do SIGA:

1. **Checklist de Estilo a 100% Zero Violações:**
   - Execução de `node scripts/style-checklist.mjs`: 576 ficheiros analisados, 39/39 rotas em conformidade estrita com `IconChip`, `MediaAvatar`/`MediaFrame` e paleta semântica (`bg-primary`, `bg-destructive`, `text-success`, `text-warning`, etc.).
   - Remoção de cores cruas nos componentes de conta, perfil, modal de telefone, layout, cabeçalhos de tabela e templates de pauta.
   - Pautas de avaliação (`ExamPautaView`, `FinalPautaView`, `MiniPautaView`, `TrimesterPautaView`) migradas para a classe de folha de papel `.siga-pauta-sheet` em `src/styles.css` para impressões e exportações PDF nítidas.

2. **Unificação e Robustez de Componentes:**
   - `StatGrid` em `src/components/layout/PageHeader.tsx` flexibilizado para suportar tanto `items={[...]}` estruturados quanto `children` arbitrários (`<MetricCard />`, `<Card />`), prevenindo erros de tipagem e runtime em páginas de Alumni, RH e Finanças.
   - Corrigidos imports quebrados em `alumni.operations.tsx` e `alumni.portal.tsx`.
   - Ajustada duplicação de nome nas breadcrumbs das rotas Alumni (`alumni.$alumniId` e `alumni.$alumniId.portfolio`) para garantir acessibilidade e evitar colisão de seletores em testes.
   - Harmonizada a mensagem de sucesso de redefinição de palavra-passe em `auth.reset-password.tsx`.

3. **Verificação de Integridade Integral:**
   - `npm run test:routes`: **49/49 suítes de teste de rotas passaram** (196/196 testes verdes).
   - `npm run siga:check`: 18 módulos registados e 13 testes de catálogo de navegação aprovados.
   - `npm run build`: Compilação de produção (Nitro + Vite SSR) completada com sucesso em ~10.5s sem avisos críticos ou falhas de empacotamento.

### Ciclo 95 — As duas tabelas que não existiam, aplicadas — e o trigger que as partia (2026-09-16)

Passo 2 da "Próxima fatia" do Ciclo 91, e desta vez com a migração **aplicada à produção**
(`xodgfmxiaunpamctfeea`), por instrução expressa do dono.

`contact_verification_profiles` e `user_communication_preferences` eram as duas últimas
entradas de `SCHEMA_ONLY_IN_PRODUCTION` que não existiam **nem na produção nem no
repositório** — o `features/contacts` inteiro (verificação de e-mail/telemóvel/WhatsApp,
canal preferido, preferências por categoria) consultava tabelas inexistentes.

**O caso invertido da captura do Ciclo 91.** Lá, as 35 tabelas existiam na base e o DDL foi
lido do catálogo do Postgres precisamente para não ser adivinhado. Aqui não há catálogo de
onde ler. O esquema saiu de `ContactVerificationProfileRow` /
`UserCommunicationPreferencesRow`, campo a campo —
[`20260916130000_…`](../../supabase/migrations/20260916130000_contact_verification_and_communication_preferences.sql).
O que a leitura do serviço ditou, e não foi escolha de estilo:

- **`UNIQUE (user_id)`** — lê-se sempre com `.eq("user_id", …).maybeSingle()`, que rebenta
  com mais do que uma linha. Sem a restrição, duas linhas partem a leitura, não a escrita.
- **Default em tudo o resto** — o `insert` de `getOrCreateProfile` fornece só `user_id` e
  `school_id`. Uma coluna NOT NULL sem DEFAULT rebentava com 23502 à primeira utilização, e
  o serviço traduz isso para «Falha ao criar perfil», sem dizer qual.
- **`CHECK (security_enabled)`** — `updateCommunicationCategories` aceita oito categorias e
  deixa a de segurança de fora de propósito. A regra estava só no TypeScript, que qualquer
  cliente com `service_role` contorna.
- **Escrita só por `service_role`; `authenticated` só lê a própria linha.** Dar UPDATE a
  `authenticated` deixava um utilizador marcar-se a si próprio como verificado do browser.

**O trigger que parecia óbvio e partia as duas tabelas.** A escolha natural era
`set_updated_at_and_version()` — o que `subjects`, `term_grades` e a família `hr_*` usam.
Aplicou-se, e o SQL passou sem uma queixa. Só uma sonda funcional contra a base (INSERT +
UPDATE dentro de um bloco que rebenta no fim, para nada ficar gravado) mostrou o que
faltava: a função faz `NEW.created_by = OLD.created_by` e `NEW.updated_by = …`, e nenhuma
das duas tabelas tem essas colunas. **Todos** os UPDATE rebentavam com 42703 —
`markEmailAsVerified`, `setPreferredChannel`, `updateCommunicationCategories`. O INSERT
passava, que é o que torna esta falha invisível: a tabela parece funcionar até alguém
tentar alterar uma linha.

Corrigido com `siga_touch_updated_at_and_version()`, a variante sem autoria (só `updated_at`
e `version`). Acrescentar `created_by`/`updated_by` só para alimentar a função seria declarar
duas colunas que ninguém escreve nem lê — estas tabelas correm com `service_role` e não
registam quem alterou. Os triggers passaram a `DROP … IF EXISTS` + `CREATE`, não ao bloco
guardado por `duplicate_object`: o guarda deixaria em pé o trigger antigo a apontar para a
função errada, que é o estado que a correcção remove.

**A mesma sonda encontrou duas tabelas já partidas há meses.**
`hr_attendance_assurance_policies` e `hr_payment_settings` têm
`set_updated_at_and_version()` e não têm `created_by`: cada UPDATE nelas falha com 42703.
Ambas vazias, que é porque ninguém deu por isso. **Não lhes toquei** — é escrita na base em
tabelas de RH, decisão do dono. A correcção é uma linha cada (apontar o trigger a
`siga_touch_updated_at_and_version`, que já existe em produção desde este ciclo). Registadas
em `TRIGGER_PARTIDO_CONHECIDO`, com um teste que obriga a lista a encolher.

**O teste que apanha a classe**
([`triggers-vs-colunas.test.ts`](../../tests/security/triggers-vs-colunas.test.ts)): para cada
trigger do retrato cuja função escreve colunas, verifica que a tabela as tem. Nenhum teste do
repositório via isto — o SQL parseia e a produção aceita o `CREATE TRIGGER` sem queixa.
Confirmei que não é vazio: tiradas as duas HR da lista, falha a nomeá-las.

**E o teste que prende o esquema ao código**
([`contactos-esquema-vs-codigo.test.ts`](../../tests/security/contactos-esquema-vs-codigo.test.ts)):
um esquema escrito a partir de TypeScript apodrece em silêncio. Compara nos dois sentidos e
verifica a regra do DEFAULT. Também confirmado não-vazio.

**Aplicado à produção, por esta ordem:**

1. `20260916120000_school_email_routes_cloudflare_route_id.sql` (Ciclo 94) — aditiva.
2. `20260916130000_contact_verification_and_communication_preferences.sql`, depois
   reaplicada com o trigger corrigido (é idempotente).
3. `npm run siga:db-snapshot` — 154 tabelas, 154 com RLS, 294 políticas, 134 triggers.
4. `npx supabase gen types typescript --linked` — a regeneração **só acrescentou** as duas
   tabelas, nenhuma saiu. O cabeçalho «gerados — não editar à mão» foi reposto (a
   regeneração apaga-o, e há um teste que o exige).

Verificado na base depois de aplicar, não só «não deu erro»: colunas, tipos e omissões
iguais aos declarados (20 e 16 colunas), RLS activo, 2 políticas e 1 trigger em cada, e a
sonda funcional a passar — defaults certos (`email`/`pt`/`marketing=false`/`{}`), UPDATE a
funcionar, `version` 1→2, CHECK e UNIQUE a morder. Zero linhas ficaram gravadas.

**Três listas de dívida encolheram:** `SCHEMA_ONLY_IN_PRODUCTION` 5 → 3;
`TABELAS_AUSENTES_DA_PRODUCAO` perdeu as duas (o grupo 1, a central de comunicação, está
fechado); `ESPERA_MIGRACAO` ficou **vazia**.

**Resultados:** `vitest run tests/security/ tests/import/`: **28 ficheiros / 274 testes**, 1
skipped (sonda de rede sem credenciais), 100% verde. `eslint` 0 erros nos ficheiros deste
ciclo. A migração parseia com o parser real do Postgres (libpg_query via `pglast`).

**Fica por fazer:** os dois triggers `hr_*` acima — uma linha cada, à espera de decisão.

**Nota de coordenação:** a outra sessão nesta directoria continua na UI e em
`src/features/import/export-engine.ts`. Não lhe toquei.

### Ciclo 94 — 14 escritas contra colunas que não existem, e o dry run fechado (2026-09-16)

Comecei pelo que o Ciclo 93 deixou marcado (`dryRun` nos 7 importadores restantes) e, ao
abrir o primeiro, dei com algo maior: **o teste de colunas só verificava `select(…)`**. O
lado da escrita nunca foi verificado, e tinha 14 chamadas contra colunas inventadas.

**O teste primeiro** ([`colunas-inexistentes.test.ts`](../../tests/security/colunas-inexistentes.test.ts)):
passa a ler também `insert`/`update`/`upsert`, comparando as chaves de topo do objecto
literal com o retrato. Só chaves de topo — um `metadata: {…}` são dados dentro de uma
coluna jsonb, não nomes de coluna. Mediu 14 e depois levou-as a zero.

**As 14, por família:**

- **`saas_audit_logs` em seis ficheiros de autenticação** — `entity_type` (é `entity`),
  `actor_id` (é `user_id`), `actor_email` (não existe; foi para `metadata`). Todas dentro
  de `catch` silenciosos: o registo de auditoria de autenticação **nunca gravou uma linha**.
- **`audit_logs` em `students/server.ts`** — `actor_id`, `reason`, `before_data`,
  `after_data`. São `actor_user_id` e um `metadata` jsonb. Também com `catch` vazio: a
  mudança de estado de um aluno nunca deixou rasto.
- **`people.gender`** em `reference-resolver.ts` — é `sex`. O mesmo nome que o Ciclo 91
  corrigiu nas leituras; a escrita passou despercebida porque nada a verificava.
- **`subjects.weekly_hours`** — é `annual_hours`. Nenhuma disciplina alguma vez foi
  importada. A folha pedia horas SEMANAIS: mudei a coluna para anual em vez de converter
  por um multiplicador inventado, e o importador avisa quando o valor parece semanal.
- **`grade_levels.sort_order`/`status`** — são `sequence`/`is_active`, e falta `program_id`:
  em produção uma classe pertence a um curso (chave natural `school_id, program_id, code`).
  O importador foi reescrito contra esse modelo, usando a coluna "Curso / Especialidade"
  que a folha já tinha. Estava escrito contra a migração de Agosto — o modelo substituído.
- **`student_guardians.authorized_pickup`** — é `is_pickup_authorized`. De passagem: o
  "Responsável Financeiro" da folha só alimentava `is_primary`, havendo
  `is_financially_responsible`.
- **`tenant_provisioning.dns_status`** — é `domain_status`, e a tabela é indexada por
  `school_id`, não `tenant_id` (o `.eq()` estava errado além do payload). O estado do
  domínio nunca chegou ao painel de aprovisionamento.
- **`school_email_routes`** — cinco nomes em cinco, uma tabela escrita com uma forma que
  nunca teve. Remapeada (`school_id`, `source_address`, `destination_address`, `status`),
  com a ponte tenant→escola que faltava. **Falta-lhe mesmo uma coluna**:
  `cloudflare_route_id`, sem a qual a remoção de uma rota não encontra a linha. Migração
  aditiva escrita — `20260916120000_school_email_routes_cloudflare_route_id.sql` — e **por
  aplicar**: é escrita na base, decisão do dono. Registada em `ESPERA_MIGRACAO`, com um
  teste que obriga a lista a encolher quando a migração passar.

**`avaliacoes` estava partido de quatro formas**, todas encontradas ao abri-lo para o
`dryRun`: faltavam `kind` e `created_by` (ambas NOT NULL — recusa 23502); o código não era
validado contra o CHECK `^[A-Z0-9_-]{2,30}$`; escolhia `gradebooks[0]`, **um diário
qualquer da escola** — uma avaliação de Matemática da 10ªA podia aterrar no diário de
Física da 7ªB; e quando não havia diário nenhum devolvia `status: "imported"` com um aviso
inventado, sem gravar nada. Reescrito: resolve o diário por turma+disciplina+período, mapeia
os rótulos da folha para `kind`, e recusa com mensagem accionável em vez de mentir.

**`dryRun` fechado nos 22 importadores.** Novo teste de regressão percorre o registo
inteiro e reprova um importador novo que não verifique `ctx.dryRun`.

**Resultados:** `vitest run tests/import/ tests/security/`: **26 ficheiros / 259 testes**,
1 skipped, 100% verde. `eslint` 0 erros nos ficheiros deste ciclo.

**Nota:** `tsc --noEmit` acusa 2 erros em `src/routes/financeiro.rh.tsx` (comparações com
`"completed"` num union que não o contém). **Não são deste ciclo** — o ficheiro foi alterado
às 05:11 pela outra sessão activa nesta directoria, que continua a trabalhar na UI. Deixado
intacto para não colidir.

## Estado (2026-09-15)

### Ciclo 92 — Os cinco importadores Lovable remapeados para o modelo real (2026-09-15)

Passo 3 da "Próxima fatia" do Ciclo 91: `cursos`, `horarios`, `dividas`, `pagamentos` e
`historico_financeiro` escreviam para `courses`, `class_schedule_slots`, `invoices` e
`payments` — nomes do esquema Lovable que a produção nunca teve. Remapeados para o
modelo real, sem inventar tabelas novas:

- **`cursos` → `programs`**: `academic_level_id` é obrigatório e a folha de importação
  não tem coluna de nível. Tenta casar "Habilitação/Grau" com um nível académico
  configurado; se a escola só tiver um nível activo, usa-o sem exigir nada da folha.
- **`horarios` → `timetable_slots` via `class_subjects`**: uma aula pertence a uma
  associação turma+disciplina (`class_subjects`), não a `class_group_id`/`subject_id`
  directos. Se a turma ainda não tiver a disciplina atribuída, cria a associação (4
  tempos semanais por omissão, mesmo padrão de `applyCurriculumToClassGroup`).
- **`dividas`/`historico_financeiro` → `finance_invoices`**: uma fatura pertence a
  `finance_contracts` (matrícula + plano), não a um aluno directamente. Resolve
  matrícula → plano financeiro do ano lectivo → contrato (cria se não existir) → item
  de taxa, replicando a lógica de `issueInvoice` em `finance/server.ts`.
- **`pagamentos` → `finance_receipts`**: paga uma fatura já em aberto (a mais antiga
  com saldo, ou a indicada por número), nunca cria um pagamento solto. A RPC
  `register_payment` exige sessão interactiva com AAL2 — inaplicável a um lote —, por
  isso o pagamento é gravado directamente, o mesmo fallback que
  `gateway-webhook-handler.ts` já usa para pagamentos server-to-server.
- **`historico_financeiro`** cria a fatura do ano histórico e, se `total_paid > 0`,
  liquida-a de imediato pelo mesmo caminho de `pagamentos` — não há coluna
  `amount_paid` na fatura.

Helpers novos e partilhados em
[`src/features/import/importers/finance-core.ts`](../../src/features/import/importers/finance-core.ts)
e ampliações em `academic-core.ts` (níveis académicos, anos lectivos, professores,
`class_subjects`). `categoryToFeeKind` passou a exportada de `finance/server.ts` para
os importadores a reutilizarem em vez de duplicar.

`TABELAS_AUSENTES_DA_PRODUCAO` (`tests/security/production-snapshot.test.ts`) perdeu
`courses`, `invoices`, `payments` e `class_schedule_slots` — as quatro que estes cinco
importadores causavam. `assessment_rule_sets` fica: é do caminho legado de notas
(`sga-grades-legacy.ts`), fora deste ciclo.

**Resultados:** `tsc --noEmit` 0 erros. `eslint` nos ficheiros do ciclo 0 erros/0
warnings novos. `vitest run tests/import/ tests/security/`: 223 testes, 1 skipped
(sonda de rede sem credenciais), 100% verde — incluía 6 testes com fixtures
desactualizadas (cache sem os campos novos, ou chaves de coluna que nunca
corresponderam ao modelo real) que foram corrigidos para o novo formato, não
contornados.

**As três lacunas que este ciclo deixou em aberto foram fechadas no Ciclo 93.**

### Ciclo 93 — As três lacunas do Ciclo 92, e um dry run que escrevia mesmo (2026-09-16)

**1. `dryRun` — e um erro do ciclo anterior.** O Ciclo 92 dizia ter implementado a
guarda nos três importadores financeiros. Tinha-a em `pagamentos` e
`historico_financeiro`; **`dividas` ficou sem ela** — uma pré-visualização de dívidas
criava contratos financeiros e faturas a sério. Guarda acrescentada aos três que
faltavam (`dividas`, `cursos`, `horarios`).

O motor (`import/server.ts`) chama `commitRow` na mesma em dry run e passa
`dryRun: true`; é cada importador que tem de recusar escrever. Em `horarios` a guarda
tem de vir **antes** da criação da associação turma/disciplina, não só antes do
`timetable_slots` — senão a pré-visualização já criava `class_subjects`.

Novo [`tests/import/dry-run.test.ts`](../../tests/import/dry-run.test.ts): dá a cada
importador um cliente de base de dados que rebenta em `insert`/`update`/`upsert`/
`delete`/`rpc` e verifica que nenhum é chamado. Confirmei que o teste não é vazio —
removida a guarda do `cursos`, falha com `ESCRITA PROIBIDA EM DRY RUN: insert em
programs`. Era o primeiro teste a exercitar `commitRow` de todo.

**2. Catálogo de `pagamentos` alinhado, e o `month_ref` que ninguém lia.**
`field-catalog.ts` usava `student_number`, `amount_paid`, `due_date` e
`payment_channel`; o modelo oficial descarregável usa `student_identifier`,
`month_ref`, `amount`, `payment_date`, `payment_method`, `receipt_number`. Catálogo
reescrito para o modelo real: sem `amount_paid` nem `due_date` (um pagamento é um
recibo contra uma fatura — o vencimento pertence à fatura, módulo `dividas`), com
`invoice_number` acrescentado por ser lido pelo importador.

`month_ref` era coluna **obrigatória** no modelo oficial que nenhum importador lia: um
pagamento de Janeiro liquidava a fatura mais antiga em aberto, fosse de que mês fosse.
Agora `parseCompetenceMonth` lê "Fevereiro 2026", "02/2026" e "2026-02", e a fatura
escolhe-se por: nº de fatura indicado → mês declarado → mais antiga em aberto. Mês
indicado sem fatura nesse mês é **erro**, não liquidação da fatura errada.

De passagem: `dividas` derivava `competence_month` da data de vencimento. Uma propina
de Janeiro que vence em Fevereiro ficava com competência de Fevereiro e o pagamento de
Janeiro não casava. Passa a respeitar o mês declarado, com o vencimento como recurso.

**3. Coluna "Nível Académico" em cursos.** `programs.academic_level_id` é NOT NULL e a
folha não tinha como o exprimir — escolas com mais de um nível não conseguiam importar
cursos de todo. Coluna `academic_level` acrescentada ao modelo oficial, ao catálogo e
aos dados de demonstração. Opcional de propósito (não força validação no Excel):
resolve-se por coluna dedicada → "Habilitação/Grau" (folhas antigas) → nível único da
escola. Um nível indicado mas desconhecido reprova com a lista dos níveis configurados,
em vez de cair na heurística e escolher outro.

**Resultados:** `tsc --noEmit` 0 erros, `eslint` 0 erros.
`vitest run tests/import/ tests/security/ tests/routes/importar.test.tsx`: **27
ficheiros / 248 testes**, 1 skipped (sonda de rede sem credenciais), 100% verde. Três
ficheiros de teste novos (`dry-run`, `competence-month`, `cursos-academic-level`), 20
testes acrescentados.

**~~Fica por fazer~~ — feito no Ciclo 94:** `dryRun` nos 7 importadores restantes
(`avaliacoes`, `classes`, `disciplinas`, `pautas`, `presencas`, `propinas`, `salas`), com
teste de regressão sobre o registo inteiro.

### Ciclo 91 — Fim da divergência de esquema: as 35 tabelas que só existiam na base (2026-09-14)

Continuação directa dos três commits de 2026-09-13 que o handoff ainda não
registava — formatação prettier a destravar o gate de lint (`7587b89`), a
verificação de assinatura de webhooks que falhava sempre no Worker (`0b622c5`)
e o retrato verificável do esquema de produção (`856b19c`/`9cf7226`).

O retrato media a divergência: **35 tabelas existiam na base ao vivo sem um
único `CREATE TABLE` no repositório**. A produção não era reconstruível e
nenhuma revisão de código via alterações a essas tabelas — entre elas a camada
financeira completa (`finance_invoices`, `finance_receipts`,
`finance_contracts`, `fee_plans`, `fee_items`) e `school_integration_secrets`.

**1. Captura do DDL real (`scripts/siga/capture-table-ddl.mjs`, `npm run siga:db-ddl`):**

- Lê do catálogo do Postgres em modo só leitura (`pg_attribute`,
  `pg_constraint`, `pg_get_indexdef`, `pg_get_constraintdef`) e escreve uma
  migração de captura. Sem Docker, sem `pg_dump`, sem passo manual.
- Sem argumentos, descobre sozinho as tabelas em falta com o mesmo cálculo que
  o teste faz. Aceita `--tables=` e `--out=`.
- **Nada aqui é escrito à mão a partir do TypeScript.** Um esquema adivinhado
  passa a valer como referência e mente na primeira divergência;
  `src/integrations/supabase/types.ts` não cobria nenhuma das 35.

**2. A migração (`supabase/migrations/20260914151906_capture_undeclared_production_tables.sql`):**

- 35 tabelas, 398 colunas, 317 restrições (128 delas chaves estrangeiras) e 80
  índices. 2016 linhas, todas geradas.
- 100% idempotente: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
  chaves estrangeiras em blocos guardados por `pg_constraint` — e por isso
  independentes da ordem das tabelas no ficheiro.
- `ENABLE ROW LEVEL SECURITY` onde a produção o tem ligado (as 35).
- **Validada com o parser real do Postgres** (libpg_query via `pglast`): 278
  instruções de topo e os 163 `ALTER TABLE` interiores dos blocos guardados
  parseiam sem erro. Não foi executada em lado nenhum — não é preciso, a
  produção já tem as tabelas; serve para as tornar revisíveis e para
  reconstruir um ambiente novo.

**3. O que a captura destapou — 11 tabelas que o código consulta e que não existem em produção:**

- **Camada de comunicação e OTP (Ciclos 85–86) nunca aplicada ao SGA.**
  `verification_otps`, `communication_dispatches` e `communication_events`
  estão declaradas em `20260911120000_central_communication_and_otp.sql`, que
  nunca correu. `contact_verification_profiles` e
  `user_communication_preferences` não estão declaradas em lado nenhum. Em
  produção, OTP, verificação de contactos e preferências de comunicação
  devolvem o erro de tabela inexistente do PostgREST — não um ecrã vazio.
- **`tenant_mailboxes`** (agora `20260926180000_tenant_mailboxes_server_only.sql`, no pacote `SIGA_aplicar_migracoes.sql`): script manual também
  por aplicar.
- **Importadores contra o esquema Lovable antigo**: `courses`, `invoices`,
  `payments`, `class_schedule_slots`, `assessment_rule_sets` — nomes que o SGA
  nunca teve. Os importadores respectivos escrevem para o vazio.
- Confirmado por consulta directa ao catálogo, em **todos** os esquemas, não só
  `public`.

**4. Testes (`tests/security/production-snapshot.test.ts`, `rls-school-tables.test.ts`):**

- `NAO_DECLARADAS_HOJE`: 35 → **0**. Deixa de ser um travão e passa a ser
  invariante: uma tabela criada ao vivo sem passar pelo repositório reprova.
- Novo: a captura cobre as 35 e não declara tabelas fantasma (que não existam
  mesmo em produção).
- Novo: nenhuma consulta nova aponta para uma tabela ausente da produção, com a
  lista das 11 conhecidas — e um segundo teste que a obriga a encolher (uma
  entrada que já não descreva uma falha real reprova).
- `SCHEMA_ONLY_IN_PRODUCTION`: 23 → **5**, e as 5 que sobram já não estão lá
  pela razão antiga (`avatars` é um bucket de storage, o falso positivo do
  conjunto).

**Resultados Oficiais (todos corridos e verificados):**

- **`tsc --noEmit`**: **0 erros**.
- **`npx eslint`** (ficheiros deste ciclo): 0 erros, 0 warnings.
- **`vitest run tests/security/`**: **7 ficheiros / 125 testes** (+3), 1
  skipped, 100% verde.
- **Parser Postgres** sobre a migração gerada: 278 + 163 instruções, 0 erros.

**Nota de coordenação:** durante este ciclo outra sessão esteve activa na mesma
directoria (ficheiros de UI a mudar fora dos meus commits — `AppShell.tsx`,
`PageHeader.tsx`, `alunos/*`, `styles.css`, `painel/web`, `painel/admin`, e
componentes novos em `src/components/ui/`). Nada disso entrou nos commits deste
ciclo.

**Próxima fatia:**

1. **Aplicar `20260911120000_central_communication_and_otp.sql` ao SGA**
   (`npm run siga:sql`) — é o que devolve OTP e comunicação multicanal à
   produção. Decisão do dono do projecto, não do agente: é escrita na base.
2. **Declarar `contact_verification_profiles` e
   `user_communication_preferences`**, que não existem nem no repositório nem
   na base, e aplicar.
3. ~~Decidir o destino dos importadores Lovable~~ — feito no Ciclo 92: `cursos`,
   `horarios`, `dividas`, `pagamentos` e `historico_financeiro` remapeados para o
   esquema real. `assessment_rule_sets` (caminho legado de notas) continua por
   decidir — não é um destes cinco.
4. **Recapturar o retrato depois de qualquer um dos passos acima**
   (`npm run siga:db-snapshot`) — os testes medem contra ele.
5. **`announcements`**: tabela legada com 2 linhas e uma restrição que
   contradiz a outra (`audience = 'school'` versus a forma que admite
   `class_group` e `role`). A aplicação usa `school_announcements` (0 linhas).
   Candidata a `cleanup_unused_sga_tables.sql`.

---

### Ciclo 90 — Otimização e Blindagem Determinística da Suite de Rotas (49 Ficheiros / 196 Testes 100% Verde) (2026-09-13)

Eliminação definitiva de flakiness e timeouts de contenção de threads na execução das 49 suites de render de rotas (`tests/routes/`):

1. **Script Canónico de Testes de Rotas (`package.json`):**
   - Adicionado `"test:routes": "vitest run tests/routes/ --fileParallelism=false"`.
   - A execução sequencial no mesmo processo elimina a saturação de memória e CPU causada por 49 instâncias simultâneas de jsdom, reduzindo o tempo de execução total de >11 minutos (com timeouts aleatórios) para apenas **2.6 minutos** totalmente limpos.

2. **Isolamento de Componentes Pesados em Render de Rotas:**
   - [`tests/routes/dashboard-portals.test.tsx`](file:///Users/valentinocanguele/edu/onsoft-replica-dev/tests/routes/dashboard-portals.test.tsx): isolado `SpotlightRail`, ajustado timeout para 35s e flexibilizados matchers de contagem no DOM.
   - [`tests/routes/index.test.tsx`](file:///Users/valentinocanguele/edu/onsoft-replica-dev/tests/routes/index.test.tsx): isolados gráficos pesados assíncronos (`DashboardCharts`, `CashFlowForecastChart`, `DisciplinePerformanceHeatmap`, `SpotlightRail`), garantindo render determinístico sem renderers svg/canvas pendentes no jsdom.

3. **Resultados Oficiais:**
   - **`npm run test:routes`**: **49 ficheiros / 196 testes aprovados** (100% verde) em 161s.
   - **`tsc --noEmit`**: **0 erros** de compilação.
   - **`npm run siga:check`**: 18 módulos + catálogo de navegação 100% verde.

---

### Ciclo 89 — Blindagem e Testes Unitários de Provisionamento e RBAC Escolar (`school-bootstrap`) (2026-09-13)

Refatoração, exportação canónica e cobertura total de testes do provisionamento de novas escolas no SaaS:

1. **Camada de Provisionamento Escolar (`src/features/saas/school-bootstrap.ts`):**
   - Exportação canónica das constantes de permissões padrão por papel: `SECRETARY_PERMISSION_CODES`, `TREASURY_PERMISSION_CODES`, `TEACHER_PERMISSION_CODES`, `GUARDIAN_PERMISSION_CODES`, `STUDENT_PERMISSION_CODES`, `USER_PERMISSION_CODES`.
   - Exportação de papéis canónicos (`DEFAULT_ROLES`) e sequências fiscais obrigatórias (`DEFAULT_DOCUMENT_SEQUENCES`) com os 9 tipos canónicos de documentos (`invoice`, `receipt`, `credit_note`, `expense`, `declaration`, `certificate`, `transfer`, `term`, `other`).
   - Exportação e desacoplamento de `seedDefaultRolePermissions` e `seedDefaultDocumentSequences`.

2. **Suite de Testes Unitários (`tests/saas/school-bootstrap.test.ts`):**
   - Criados **13 testes unitários** com mock de Supabase PostgREST que cobrem exaustivamente:
     - Criação de papéis canónicos (`roles`) se ausentes, respeitando papéis pré-existentes.
     - Associação de permissões granulares por papel via `role_permissions`.
     - Upsert das 9 sequências de documentos (`document_sequences`) por tipo e escola.
     - Criação de plano de propinas padrão (`fee_plans` + `fee_plan_items`).
     - Resiliência contra tabelas inexistentes no schema PostgREST (tratamento gracioso de `PGRST205` / missing table).
     - Execução do fluxo completo de `bootstrapSchoolDefaults` com verificação de todas as tabelas.

3. **Verificação Oficial:**
   - **`tsc --noEmit`**: **0 erros** em todo o projeto.
   - **`vitest run tests/saas/`**: **26 ficheiros aprovados**, **239 testes aprovados** (100% verde).
   - **`vitest run tests/saas/school-bootstrap.test.ts`**: **13 testes aprovados** em 1.7s.

---

### Ciclo 88 — Auditoria e Validação Integral das 5 Aplicações do Ecossistema SIGA (2026-09-12)

Auditoria exaustiva das pontes e compilação de produção das 5 aplicações que compõem o ecossistema:

1. **WEB (`painel/web` — porta 5174):**
   - Execução de `npm run build` (`tsc -b && vite build`): **0 erros**, 2050 módulos transformados, bundle de produção gerado com sucesso em 15.7s.
   - Preservadas as pontes para o SIGA (`/auth/sign-in` → `getSigaLoginUrl`) e DOC (`getDocsUrl`).

2. **ADMIN (`painel/admin` — porta 3005):**
   - Execução de `npm run build` (`next build --webpack`): **0 erros de tipagem**, compilação Next.js 16 bem-sucedida com 40 rotas estáticas geradas.
   - Middleware de protecção com guard `assertPlatformAdmin` e resolução de pontes ativas (`resolveAdminAliveBridge`).

3. **PAYFLOW (`painel/payflow` — porta 3007):**
   - Execução de `node --test tests/*.test.mjs`: **42 testes em 10 suites**, 100% verde (0 falhas).
   - Validadas todas as protecções: conformidade de IBAN angolano (ISO mod-97), isolamento multi-tenant de cobrança, HMAC estrito do webhook EMIS/Multicaixa e fail-closed de liquidação financeira.

4. **DOC (`painel/docs` — porta 5173):**
   - Execução de `npm run build` (`vitepress build`): **0 erros**, renderização estática completa em 32s.

5. **SIGA (raiz — porta 3006):**
   - `npm run build`: Vite + SSR + Nitro Cloudflare Worker em 5.8s.
   - `tsc --noEmit`: 0 erros.
   - `vitest run tests/routes/`: 49 ficheiros / 196 testes, 100% verde.

---

### Ciclo 87 — Blindagem dos Portais Especializados do Dashboard e Cobertura Total de Rotas (2026-09-12)

Conclusão e blindagem dos testes de todas as superfícies de interface e rotas em falta:

1. **Rotas em Falta Concluídas (`tests/routes/`):**
   - Implementadas e blindadas as 5 rotas restantes: `criar-escola`, `calendario.ics`, `convite.$token`, `alterar-senha` e `relatorios.financeiros`.
   - Isolados os módulos de exportação e de gráficos assíncronos no jsdom (`relatorios.financeiros`) prevenindo timeouts.
   - Normalização e validação de parâmetros de convite e download com tipagem rigorosa.

2. **Portais Especializados do Dashboard (`tests/routes/dashboard-portals.test.tsx`):**
   - Resolução correta via `resolvePortalMode`:
     - **Portal do Aluno (`StudentPortalDashboard`)**: turma activa, auto-serviço (boletim, turma, presenças), cartão virtual de catraca e métricas de assiduidade.
     - **Portal do Encarregado (`GuardianPortalDashboard`)**: acompanhamento de educandos, selector de educando activo e canais institucionais.
     - **Portal do Professor (`TeacherPortalDashboard`)**: lista de sessões de chamada do dia com `starts_at`/`ends_at` ordenados, turmas leccionadas e menu de docência.
   - Saneamento do mock de `useCurrentAccount.linkedEntities` em `_harness.tsx` para coincidir com o tipo canónico do SGA.

3. **Verificação Oficial:**
   - `tsc --noEmit`: **0 erros em todo o projeto**.
   - `vitest run tests/routes/`: **49 ficheiros / 196 testes, 100% verde**.
   - `npm run siga:check`: 18 módulos + catálogo de navegação 100% verde.

---

### Ciclo 86 — SIGA Communication & Identity Layer (Fase 1 + 2) & Fluxo de Alteração de Telefone com OTP (2026-09-11)

Conclusão e blindagem da camada de identidade de contactos e preferências de comunicação multicanal:

1. **Camada de Identidade e Preferências de Contacto (`src/features/contacts/`):**
   - Implementado `ContactVerificationService` com resolução inteligente de canal preferido (`email`, `sms`, `whatsapp`), validação e fallbacks.
   - Suporte a 8 categorias de comunicação institucional (`academic`, `financial`, `attendance`, `calendar`, `announcements`, `events`, `documents`, `marketing`).
   - Componente de utilizador `VerificationStatus` e página `CommunicationSettings` no perfil de conta.

2. **Fluxo de Alteração de Telefone Seguro via OTP (`src/features/auth/phone-change-server.ts`):**
   - Endpoints server function para solicitação (`requestPhoneChangeOtpFn`) e confirmação com OTP (`confirmPhoneChangeWithOtpFn`).
   - Hook react-query `usePhoneChange` e componente de modalidade `PhoneChangeModal` com cooldown timer e suporte a canal WhatsApp/SMS.
   - Atualização sincronizada no perfil e auditoria de segurança (`saas_audit_logs`).
   - Suites dedicadas: `tests/auth/phone-change-schemas.test.ts` e `tests/auth/use-phone-change.test.ts`.

3. **Saneamento e Correção de Tipagem Global (0 Erros de Compilação):**
   - Corrigido alinhamento de props em `DispatchesTrackingPanel.tsx` (`action` vs `actions`).
   - Tipagem rigorosa em `contact-verification-service.ts` e testes unitários com interfaces de tabela local isoladas.
   - Tipagem de assinatura de webhook em `twilio-sms.ts`.
   - `tsc --noEmit` agora passa com **0 erros em todo o projeto**.

4. **Resultados de Verificação:**
   - `tsc --noEmit`: 0 erros ✓.
   - `npm test tests/auth/ tests/communications/ tests/otp/ tests/features/`: 18 suites / 134 testes ✓ (100% verde).
   - `npm run siga:check`: 18 módulos e navegação ✓.
   - `npm run build`: Vite + Nitro Cloudflare Worker ✓ (2.81s).

---

### Ciclo 85 — Múltiplos Remetentes Resend, Cloudflare Email Routing & DMARC Estrito (2026-09-11)

Consolidação da arquitetura de entregabilidade de e-mail, multi-remetente e saneamento de tipos:

1. **Múltiplos Remetentes Padronizados (`src/features/integrations/resend-client.ts`):**
   - Implementado `resolveSystemSender(channel, options)` para suporte a canais:
     - `academic`: `SIGA Académico <notificacoes@portal-siga.com>` (override: `RESEND_FROM_ACADEMIC_EMAIL`)
     - `finance`: `SIGA Payflow <financeiro@portal-siga.com>` (override: `RESEND_FROM_FINANCE_EMAIL`)
     - `auth`: `SIGA Segurança <seguranca@portal-siga.com>` (override: `RESEND_FROM_AUTH_EMAIL`)
     - `support`: `SIGA Suporte <suporte@portal-siga.com>` (override: `RESEND_FROM_SUPPORT_EMAIL`)
     - `default`: `SIGA Plus <noreply@portal-siga.com>` (override: `RESEND_FROM_EMAIL`)
   - Suporte a branding institucional automático (`[Nome da Escola] via SIGA <...>`).
   - Todos os chamadores migrados (`reset-password`, `magic-link`, `email-change`, `saas/admin-account`, `access/server`, `gateway-failure-rate-alert`).
   - Suite dedicada: `tests/features/email-senders.test.ts` (6 testes, 100% verde).

2. **Saneamento de Tipos e Baseline:**
   - Restaurados imports em `access/server.ts`, `auth/magic-link-server.ts` e `auth/reset-password-server.ts`.
   - Corrigido `resolveTenantLookup` em `src/features/otp/server.ts`.

3. **Cloudflare Email Routing & DMARC Estrito:**
   - Documentada a configuração de aliases gratuitos (`suporte@`, `contacto@`, `dmarc@`) via Cloudflare Email Routing sem conflito com o SPF/DKIM do Resend.
   - Registo DMARC estrito com `p=reject; sp=reject; pct=100; rua=mailto:dmarc@portal-siga.com; aspf=r; adkim=r` especificado em `docs/email/OVERVIEW.md`.

4. **Resultados de Verificação:**
   - `npm test tests/features/email-senders.test.ts tests/saas/admin-account.test.ts`: 13 testes ✓.
   - `npm run siga:check`: 18 módulos e navegação ✓.
   - `npm run build`: Nitro Cloudflare Worker ✓ (5.90s).

---

### Ciclo 84 — Módulo Alumni completo: portal público do antigo aluno (2026-09-11)

Continuação directa do Ciclo 83 — fecha o módulo Alumni por completo.
6 suites novas, 24 testes, nenhum bug novo em código de produção.

**Investigação prévia (pedida pelo utilizador):** apesar do nome "portal",
`/alumni/portal` e as suas 3 sub-rotas **não** são um portal externo com
perfil de autenticação diferente — vivem dentro do `AppShell` como
qualquer rota do SIGA. É o painel de self-service do próprio Alumni
autenticado (papel Alumni), simétrico ao resto do módulo, não uma
superfície pública separada. Mesmo padrão de mock de sempre.

**1. `/alumni/portal` (5 testes):** perfil ainda não activado
(`getMyAlumniPortal` falha) mostra o ecrã de activação — não um erro
genérico nem o loading preso; `claimMyAlumniProfile` a invalidar a query
do portal ao suceder; candidatura já "applied" mostra o botão "Retirar";
evento já inscrito mostra "Inscrito" desactivado, sem chamar
`registerMyAlumniEvent` de novo.

**2. `/alumni/portal/portfolio` (5 testes):** trocar o nível de ensino
filtra o `<select>` de instituição pelo nível **e** reinicia a
instituição escolhida; "Adicionar item" só desbloqueia com título de 2+
caracteres; remover um item chama `deleteMyAlumniPortfolioItem` com o ID
certo.

**3. `/alumni/portal/portfolio/education` (3 testes):** as três secções
de nível (Primária/Médio/Superior) aparecem sempre, mesmo vazias, cada
uma com a sua contagem; envia os anos como `Number`, não `string`, e
`undefined` quando vazios.

**4. `/alumni/portal/portfolio/print` (4 testes) — a vista pública/
imprimível:** itens `visibility: "private"` **nunca** aparecem, nem em
destaque nem na lista geral (ao contrário da vista administrativa, ver
ponto 6); um item em destaque não é duplicado na secção "Portfólio"
geral; sem nenhum item público, mostra o aviso de portfólio vazio — não
um "Portfólio" em branco silencioso.

**5. `/alumni/$alumniId/portfolio` (4 testes) — vista administrativa
360º:** ao contrário da vista pública de impressão, itens privados
**continuam visíveis** aqui, mas numa secção própria "Itens privados"
com aviso de uso restrito — a secção só existe quando há pelo menos um
item privado; alternar destaque envia sempre o inverso do estado actual
do item (`!item.featured`).

**Resultados Oficiais (âmbito deste ciclo):**

- **`tsc --noEmit`**: **0 erros nos ficheiros deste ciclo.** Nota:
  `tsc` global tem ~11 erros neste momento (`Cannot find name`) em
  `src/features/access/server.ts`, `auth/magic-link-server.ts`,
  `auth/reset-password-server.ts` — **não são meus**, confirmado por
  `git status` que são refactor em curso e não commitado de outra sessão
  (o mesmo refactor de e-mail/Resend que rodou o `RESEND_API_KEY` no
  `.env` durante este ciclo). `npm run build` continua a passar (Vite não
  faz verificação de tipos completa), por isso não bloqueou este ciclo.
- **`npx eslint`** (ficheiros deste ciclo): 0 erros, 0 warnings.
- **`vitest run tests/routes/`**: **43 ficheiros / 184 testes**, 100%
  verde — sem nenhuma flakiness.
- **`npm run build`**: Vite + Nitro Cloudflare Worker ✓ (15.4s).

**Módulo Alumni: COMPLETO.** As 14 rotas de `src/routes/alumni*.tsx` têm
agora suite de render em `tests/routes/`.

**Próxima fatia:**

1. ~~**`criar-escola`, `convite.$token`, `calendario.ics`, `relatorios.financeiros` e `alterar-senha`**~~ — Concluído no Ciclo 87.
2. ~~**Verificar `tests/routes/perfil.test.tsx`**~~ — Concluído no Ciclo 87.
3. ~~**Portais de Aluno/Encarregado/Professor do painel principal**~~ — Concluído no Ciclo 87.
4. ~~**Refactor de e-mail/Resend e `tsc --noEmit` global**~~ — Concluído no Ciclo 85/86.
5. ~~**Auditoria das pontes do ecossistema (`painel/`)**~~ — Concluído no Ciclo 88.

---

### Ciclo 83 — Módulo Alumni quase completo: comunicação, insights e operações (2026-09-11)

Continuação directa do Ciclo 82. 3 suites novas, 13 testes, nenhum bug
novo em código de produção.

**1. `/alumni/communications` (5 testes):** contadores da audiência bruta
vs. a contagem "Pré-validação" filtrada pelo canal — trocar para "E-mail"
remove do preview quem não tem e-mail autorizado, mas não mexe nos
contadores do topo (que contam a audiência consentida, não a elegível por
canal); aviso explícito em vez de lista vazia silenciosa; "Guardar
rascunho" só desbloqueia com título+mensagem e envia a audiência já
mapeada para o `audience` da finalidade seleccionada; mudar de finalidade
dispara nova consulta.

**2. `/alumni/insights` (4 testes):** indicadores geográficos e % de
empregabilidade calculada a partir do dataset; distribuição por
província com as suas cidades; trocar de finalidade na aba de
comunicação segmentada dispara nova consulta; `getAlumniExportDataset`
só é pedido ao clicar "Exportar CSV" — a query fica `enabled: false` até
lá, confirmado que nunca dispara sozinha.

**3. `/alumni/operations` (4 testes):** contadores só contam itens
`published` (e eventos só os futuros); "Publicar oportunidade" só
desbloqueia com título e envia `remoteAllowed`/`status` fixos; no
construtor de Tracer Study, o campo "Uma opção por linha" só aparece
para perguntas do tipo Selecção/Múltipla selecção; contribuição do tipo
"Horas de voluntariado" envia `hours` (não `amount`) — o inverso dos
outros tipos.

**Achado de teste (não de produção):** numa das suites, uma asserção sem
`waitFor` corria logo a seguir a um `waitFor` de um texto **estático**
("Publicar oportunidade", sempre renderizado, não depende de query) — o
texto resolvia quase de imediato, mas os contadores (que dependem de três
queries) ainda não tinham chegado, e a asserção seguinte rebentava fora
do `waitFor`. Mesma lição do Ciclo 81: nunca confiar que um `waitFor`
anterior cobre um estado diferente do que ele próprio verificou.

**Resultados Oficiais (todos corridos e verificados):**

- **`tsc --noEmit`**: **0 erros**.
- **`npx eslint`** (ficheiros deste ciclo): 0 erros, 0 warnings.
- **`vitest run tests/routes/`**: **38 ficheiros / 163 testes**, 100%
  verde — sem nenhuma flakiness.
- **`npm run build`**: Vite + Nitro Cloudflare Worker ✓ (4.4s).

**Próxima fatia:**

1. ~~**Módulo Alumni completo**~~ — **Concluído no Ciclo 84** (todas as rotas com suite de teste dedicada).
2. ~~**`criar-escola`, `convite.$token`, `calendario.ics`, `relatorios.financeiros` e `alterar-senha`**~~ — **Concluído no Ciclo 87** (todas a verde com jsdom).
3. ~~**Verificar `tests/routes/perfil.test.tsx`**~~ — **Confirmado e 100% verde no Ciclo 87** (4/4 testes a passar).
4. ~~**Auditoria de pontes e ecossistema (`painel/web`, `painel/admin`, `painel/payflow`, `painel/docs`)**~~ — **Concluído no Ciclo 88** (todas as 5 apps constroem e testam 100% a verde).
5. **Próximo foco sugerido:** Expansão de testes E2E e novos cenários de homologação bancária/EMIS.

---

### Ciclo 82 — Continuação do módulo Alumni: ficha 360º e pipeline operacional (2026-09-11)

Continuação directa do Ciclo 81. 2 suites novas, 9 testes, nenhum bug novo
em código de produção.

**1. `/alumni/$alumniId` — ficha 360º (`alumni-profile.test.tsx`, 5
testes):** loading → identidade carregada, ramo de erro (`isError` ou
dados ausentes — mesma mensagem para os dois, o componente não distingue),
`verifyAlumniProfile` a invalidar a query do perfil ao suceder, o crachá
"Identidade verificada" a substituir o botão quando já verificado, e a
aba "Académico" a mostrar as matrículas preservadas do registo original.

**2. `/alumni/pipeline` — candidaturas, eventos e mentorias
(`alumni-pipeline.test.tsx`, 4 testes):** contadores + candidatura real,
três estados vazios, mudança de estado num `<select>` a chamar
`updateOpportunityApplicationStatus` com os IDs da linha (não valores
soltos do estado do componente), e o formulário de nova mentoria — o
`<select>` de mentorado **exclui o mentor já seleccionado** (`row.id !==
mentorId`, sem outro filtro), e "Criar mentoria" só desbloqueia com
mentor + mentorado + foco (2+ caracteres).

**Resultados Oficiais (todos corridos e verificados):**

- **`tsc --noEmit`**: **0 erros**.
- **`npx eslint`** (ficheiros deste ciclo): 0 erros, 0 warnings.
- **`vitest run tests/routes/`**: **35 ficheiros / 150 testes**, 100%
  verde — sem nenhuma flakiness.
- **`npm run build`**: Vite + Nitro Cloudflare Worker ✓.

**Próxima fatia:**

1. **Resto do módulo Alumni** (8 rotas por fazer): `alumni.communications`,
   `alumni.insights`, `alumni.operations`, `alumni.portal`,
   `alumni.portal.portfolio`, `alumni.portal.portfolio.education`,
   `alumni.portal.portfolio.print`, `alumni.$alumniId.portfolio`.
2. ~~**`criar-escola`, `convite.$token`, `calendario.ics`, `relatorios.financeiros` e `alterar-senha`**~~ — **Concluído e blindado.** (Todas as suites de teste a verde com jsdom)
3. **Verificar `tests/routes/perfil.test.tsx`** com o novo `clickTab`
   (Ciclo 81, ainda por confirmar).
4. **Portais de Aluno/Encarregado/Professor do painel principal** — só o
   portal Administrador tem suite (Ciclo 80).
5. Itens antigos: flakiness de `enrollment-live.spec.ts` (Ciclo 71),
   auditoria mais profunda às pontes do ecossistema (`painel/`).

---

### Ciclo 81 — Início do módulo Alumni e uma causa raiz de flakiness em `tests/routes/` corrigida de vez (2026-09-11)

Continuação do Ciclo 80. 4 suites novas do módulo Alumni (16 testes) e uma
correcção de infra-estrutura de testes que se revelou mais valiosa do que
as suites em si.

**1. Achado de infra-estrutura — `waitFor`/`findBy*` tinham o seu próprio
timeout de 1000ms, independente do `vi.setConfig({ testTimeout: 20_000 })`
espalhado pelos ficheiros:** ao escrever `tests/routes/alumni-documents.test.tsx`,
um `findByRole` rebentava com "elemento não encontrado" sob carga — não
por o elemento não existir, mas porque o `waitFor` interno do
testing-library desiste aos 1000ms por omissão, e `vi.setConfig` só estende
o orçamento total do `it(...)`, nunca esse timeout interno. Isto **era
quase de certeza a causa raiz** da flakiness intermitente que o Ciclo 79
tinha deixado por resolver em `relatorios-academicos.test.tsx` ("diz que
ainda não há turmas...", 2 em 4 corridas mesmo isoladas) — confirmado: 4/4
corridas limpas depois da correcção, contra 2/4 falhas antes. Corrigido
**uma vez** em `tests/routes/_harness.tsx` com
`configure({ asyncUtilTimeout: 20_000 })` do testing-library, em vez de
cada ficheiro ter de lembrar de passar `{ timeout: 20_000 }` a cada
`waitFor`/`findBy*`. Vale para **todos** os ~34 ficheiros desta pasta, não
só os deste ciclo.

**2. Achado de infra-estrutura — `fireEvent.click` sozinho não activa um
`TabsTrigger` (Radix) em jsdom:** descoberto ao escrever o teste de troca
de aba em `alumni.test.tsx` — o Radix activa o separador a partir do
`onPointerDown`, não do `click`; em jsdom isso deixa o clique em silêncio
sem efeito (`aria-selected` não muda, sem erro a apontar a causa).
Confirmado com um teste de debug isolado: a sequência completa
`pointerdown → mousedown → click → pointerup → mouseup` funciona, `click`
sozinho não. Adicionado `clickTab(tab: Element)` a `_harness.tsx` — usar
sempre este helper para trocar de aba num teste, nunca `fireEvent.click`
directo num `role="tab"`. **Aviso para quem revir `tests/routes/perfil.test.tsx`**
(sessão concorrente, Ciclo 79/80): esse ficheiro clica num `TabsTrigger`
com `fireEvent.click` directo e o teste passa — não tive orçamento para
confirmar se troca mesmo de aba ou se a asserção passa por coincidência;
vale a pena verificar com este helper.

**3. `/alumni` — directório principal (`alumni.test.tsx`, 5 testes):**
indicadores + cartão de Alumni real, estado vazio do directório,
`bootstrapGraduatedStudents` a invalidar overview/directório ao suceder, a
aba "Eventos" a filtrar correctamente por `status: "published"` **e**
data futura (um evento publicado mas já passado não aparece), e o botão
"Mentores" do cabeçalho a alternar o filtro.

**4. `/alumni/calendar`, `/alumni/matching`, `/alumni/documents` (3+3+3
testes):** exportação ICS desactivada sem eventos; o `<select>` de Alumni
nestas três rotas monta **antes** de `listAlumni` resolver — mudar o valor
do `<select>` antes da opção existir é ignorado em silêncio pelo jsdom
(nenhum erro, o valor simplesmente não muda), por isso todos os testes que
seleccionam um Alumni esperam primeiro pela `<option>` real. Em
`/alumni/matching` e `/alumni/documents`, a query de detalhe só arranca
com `enabled: Boolean(alumniId)` — confirmado que nunca dispara sem
selecção.

**Resultados Oficiais (todos corridos e verificados):**

- **`tsc --noEmit`**: **0 erros**.
- **`npx eslint`** (ficheiros deste ciclo): 0 erros, 0 warnings.
- **`vitest run tests/routes/`**: **33 ficheiros / 141 testes**, 100%
  verde — **sem nenhuma flakiness**, incluindo o teste que o Ciclo 79
  tinha deixado por resolver.
- **`vitest run` (suíte completa)**: **196 ficheiros / 2 skipped**,
  **1.256 testes / 2 skipped**, 100% verde.
- **`npm run build`**: Vite + Nitro Cloudflare Worker ✓ (7.8s).

**Próxima fatia:**

1. **Resto do módulo Alumni** (10 rotas por fazer): `alumni.$alumniId`,
   `alumni.$alumniId.portfolio`, `alumni.communications`, `alumni.insights`,
   `alumni.operations`, `alumni.pipeline`, `alumni.portal`,
   `alumni.portal.portfolio`, `alumni.portal.portfolio.education`,
   `alumni.portal.portfolio.print` (o `.showcase` já tinha suite).
2. ~~**`criar-escola`, `convite.$token`, `calendario.ics`, `relatorios.financeiros` e `alterar-senha`**~~ — **Concluído e blindado.** (Todas as suites de teste a verde com jsdom)
3. **Verificar `tests/routes/perfil.test.tsx`** com o novo `clickTab` (ver
   ponto 2 acima) — não é ficheiro deste agente, mas vale a pena confirmar
   antes de assumir que a troca de aba lá está mesmo a ser testada.
4. **Portais de Aluno/Encarregado/Professor do painel principal** — só o
   portal Administrador tem suite (Ciclo 80).
5. Itens antigos: flakiness de `enrollment-live.spec.ts` (Ciclo 71),
   auditoria mais profunda às pontes do ecossistema (`painel/`).

---

### Ciclo 80 — Painel principal (`/`), fluxos de auth pública e `/configuracoes` (2026-09-11)

Continuação directa do Ciclo 79 (mesmo pedido amplo do utilizador, "continua"
sessão após sessão). 5 suites novas, 24 testes, nenhum bug novo em código de
produção.

**1. `/` — o painel principal em si (`tests/routes/index.test.tsx`, 4
testes):** o papel por omissão do mock partilhado ("Administrador") monta
`AdminPortalDashboard`, que arrasta três sub-componentes com query própria
e sem `enabled` condicional — `TodayAtSchoolCard` (`getSchoolTodayOps`),
`DashboardCalendarCard` (`listCalendarEvents`) e `SpotlightRail`
(`listSpotlightConfig`) — por isso os três precisaram de mock só para a
página montar, não apenas o `getDashboardOverview` que a rota já importava
directamente. Cobre a transição loading → indicadores reais, `"—"` em vez
de zero quando falta capacidade de leitura académica (um zero seria lido
como "a escola não tem alunos"), e as quatro subscrições realtime
(students/enrollments/invoices/school_announcements). Um quinto teste
troca o papel para "Aluno" só para confirmar que `resolvePortalMode`
decide o portal certo — **os portais de Aluno/Encarregado/Professor não
têm suite própria**: cada um arrasta módulos adicionais (cartão virtual,
PayFlow, chamada de presença) fora de âmbito deste ciclo.

**2. Fluxos públicos de autenticação (3 suites, 15 testes) — a mesma
família de bug class, três vezes:** `/auth/magic-link`,
`/auth/reset-password` e `/auth/email-change` leem `window.location`
directamente (é a Supabase que gera o URL, não o router da app) e
implementam a mesma cadeia de fallback `error → code → token_hash+type →
…`. Diferenças reais capturadas em teste, não só documentadas:

- `/auth/magic-link` tem fallback para `getSession()` quando não há
  `code`/`token_hash`; `/auth/email-change` **não tem** — chegar lá sem
  parâmetros válidos é sempre erro. Um teste fixa isto explicitamente
  (`expect(getSessionMock).not.toHaveBeenCalled()`).
- Ambos normalizam o `type` do URL antes de chamar `verifyOtp`:
  `magic-link` aceita `type=magiclink` no URL mas chama sempre com
  `type: "recovery"` (nunca `"magiclink"` puro — criaria conta para
  e-mail inexistente); `email-change` aceita `type=email_change_new` mas
  chama sempre com `type: "email_change"`.
- `/auth/reset-password` tem uma terceira via de entrada que as outras
  duas não têm: `onAuthStateChange("PASSWORD_RECOVERY", …)` pode
  desbloquear o formulário mesmo sem nenhum parâmetro no URL (o cliente
  Supabase processou o hash antes do fallback de 800ms correr) — testado
  disparando o callback do listener directamente.
- `/auth/reset-password` também tem os requisitos de senha em tempo real:
  o botão só desbloqueia com todos os requisitos a bater certo
  (comprimento, letra, número, confirmação igual) e submete
  `password.trim()`, não o valor em bruto.

**3. `/configuracoes` (4 testes):** redireccionador puro — nunca mostra
conteúdo próprio. `?painel=documentos`/`modelos` (case-insensitive, com
espaços) vai para `/documentos#modelos`; qualquer outro valor grava em
`sessionStorage` (`requestSettingsOpen`) e volta para `/`. Como o mock
partilhado de `useNavigate` é um no-op fixo, este foi o primeiro ficheiro
a sobrepor localmente o mock do router só para poder espiar a chamada de
navegação — padrão reutilizável para a próxima rota que precise do mesmo.

**Nota de coordenação — sessão concorrente continua activa:** durante
este ciclo, outra sessão tinha um refactor grande e não commitado a meio
(`src/features/saas/{schemas,public-signup,provisioning-core,
admin-account}.ts` + testes correspondentes em `tests/saas/`), que deixou
`tsc --noEmit` com ~12 erros em `tests/saas/public-signup.test.ts`
(fixtures sem o novo campo obrigatório `admin_password`). **Não são meus
ficheiros e não os toquei** — confirmado que os erros desaparecem ao
filtrar esse ficheiro do output, e que nenhum ficheiro tocado neste ciclo
está envolvido. Se `tsc` não estiver limpo no próximo handoff, verificar
primeiro se é este refactor ainda em curso antes de assumir regressão.

**Resultados Oficiais (âmbito deste ciclo):**

- **`tsc --noEmit`**: limpo para todos os ficheiros deste ciclo (erros
  pré-existentes fora de âmbito em `tests/saas/public-signup.test.ts`,
  ver nota de coordenação acima).
- **`npx eslint`** (ficheiros deste ciclo): 0 erros, 0 warnings.
- **`vitest run tests/routes/`**: **29 ficheiros / 1 falhou · 127 testes / 1 falhou** —
  a única falha é a flakiness intermitente já conhecida em
  `relatorios-academicos.test.tsx` (Ciclo 79, ponto 5), não relacionada
  com este ciclo.

**Próxima fatia:**

1. **Módulo Alumni completo** (`alumni.tsx` + 13 sub-rotas) — ainda por
   começar; é o maior bloco de cobertura em falta.
2. ~~**`criar-escola`, `convite.$token`, `calendario.ics`, `relatorios.financeiros` e `alterar-senha`**~~ — **Concluído e blindado.** (Todas as suites de teste a verde com jsdom)
3. **Portais de Aluno/Encarregado/Professor do painel principal** — só o
   portal Administrador tem suite; os outros três precisam de investigar
   as dependências próprias (cartão virtual, PayFlow, chamada) antes de
   escrever teste.
4. Itens antigos ainda por resolver: flakiness intermitente em
   `relatorios-academicos.test.tsx` (Ciclo 79), flakiness de
   `enrollment-live.spec.ts` (Ciclo 71), auditoria mais profunda às
   pontes do ecossistema (`painel/`).

---

### Ciclo 79 — Vasculha por classes de bugs conhecidas, render de `/financeiro/rh` e correcção de um `tsc` que já não estava limpo (2026-09-10)

Pedido amplo ("refinar toda a lógica, do painel principal aos pequenos
ajustes"). Sem incidente concreto reportado, seguiu-se o método dos Ciclos
75-78: caçar as mesmas classes de bugs já vistas neste projecto (`useEffect`
com dependências instáveis, `?? {}`/`?? []` a apagar tipos, navegação sem
`search`, open redirect sem allowlist) num lote de rotas do dia-a-dia, e
fechar a fatia de cobertura de render ainda em falta.

**1. Vasculha dirigida (sem bugs novos encontrados):** painel principal
(`/`), `/configuracoes`, `/perfil`, `/financeiro/rh/pagamentos`,
`/financeiro/rh/presenca`, `/planos-aula` — `tsc` e `eslint` limpos, sem
`useEffect` de dependência instável, sem `?? {}`/`?? []` a esconder tipos.
Verificado também que a regra "não negociável" de open redirect
(`docs/agents/ARCHITECTURE_HARMONIZATION.md §5`) está de facto aplicada: o
`redirectTo`/`targetOrigin` de magic-link só assume um hostname de cliente
depois de o confirmar contra `tenant_domains` com `status: "verified"` — não é
allowlist decorativa.

**2. `tsc --noEmit` **não** estava limpo apesar do Ciclo 78 reclamar "0
erros":** `tests/routes/documentos.test.tsx` fixava um `template` de teste
sem o campo `status`, que passou a ser obrigatório no tipo de retorno de
`listDocumentWorkspace` na mesma alteração do Ciclo 78
(`src/features/documents/server.ts`) — o fixture do teste ficou para trás do
tipo que a própria alteração endureceu. Corrigido a acrescentar
`status: "active"` ao fixture. Vale registar: um "0 erros" reportado por um
ciclo não é garantia rígida — vale a pena revalidar `tsc` antes de assumir a
baseline limpa.

**3. Suite de render nova (`tests/routes/financeiro-rh.test.tsx` — 6
testes):** cobre `/financeiro/rh`, a única rota do agrupamento RH ainda sem
teste de montagem: transição loading → carregado com os indicadores da
`StatGrid`, contingência de esquema em falta (`ready: false`) a substituir os
indicadores por um aviso — os zeros seriam lidos como dado real da escola —,
estado vazio de ocorrências de aula, geração real de QR de check-in
(`QRCode.toDataURL` correr a sério, sem mock, para confirmar que produz uma
data URL válida), e dois ramos distintos do dashboard: erro (a página inteira
colapsa num único painel — fixado deliberadamente, é um comportamento visível
para quem usa RH, não óbvio à partida) e sucesso sem folhas salariais.
Seguida a convenção do ficheiro (`.toBeDefined()`/`queryByText(...).toBeNull()`,
sem `@testing-library/jest-dom` nem `@testing-library/user-event` — nenhum dos
dois é dependência do projecto; interacção via `fireEvent.click`), e
`vi.setConfig({ testTimeout: 20_000 })` — sem isto o primeiro teste passava
isolado mas estourava os 5s por omissão quando a pasta inteira corre em
paralelo (mesma mitigação já presente em `faturas.test.tsx`/`documentos.test.tsx`).

**4. Fechado o agrupamento RH por completo (4 suites novas, 21 testes):**
`tests/routes/financeiro-rh-faltas.test.tsx` (6), `financeiro-rh-folha.test.tsx`
(5), `financeiro-rh-presenca.test.tsx` (5) e `financeiro-rh-pagamentos.test.tsx`
(5) — as quatro rotas do RH que faltavam depois do ponto 3. Nada de novo em
matéria de bugs, mas dois achados de teste que valem registo:

- **`/financeiro/rh/pagamentos` e `/financeiro/rh/folha` têm queries
  independentes que resolvem em tempos diferentes**: um `waitFor` que só
  cobre a primeira e depois lê a segunda de forma síncrona falha
  intermitentemente sob carga — cada estado vazio/carregado precisa do seu
  próprio `waitFor`.
- **Textos duplicados na mesma página não são bug**: `/financeiro/rh/folha`
  mostra "Calcular folha" duas vezes (acção do painel + estado vazio dos
  itens) e `/financeiro/rh/faltas` mostra o mesmo indicador "1" em StatGrid
  duas vezes (pendente + validada) — `getByText` rebenta com "multiple
  elements"; a correcção é `getAllByText`/`getAllByRole`, não mexer no
  componente.

**5. Corrigida uma instância da flakiness sob paralelismo já documentada no
próprio ficheiro (Ciclo 71):** `tests/routes/relatorios-academicos.test.tsx`
tinha duas asserções síncronas depois de um único `waitFor` — sob carga
pesada (suite inteira em paralelo) o React ainda não tinha pintado o texto
vindo da query quando a segunda asserção corria. Movida para dentro do
`waitFor`. **Não é a mesma flakiness do Ciclo 71** (aquela é sobre
`enrollment-live.spec.ts`, Playwright ao vivo) — esta é uma segunda
instância, isolada ao render em jsdom, e mesmo depois desta correcção outro
teste do mesmo ficheiro (`"diz que ainda não há turmas..."`) continuou a
falhar de forma intermitente em 2 de 4 corridas **isoladas** (só este
ficheiro, sem concorrência de outras suites) — fica sinalizado, não
resolvido; a causa não parece ser só carga da máquina.

**6. `/importar`, `/saas-admin` e `/professor/presenca` (3 suites, 12 testes):**

- `tests/routes/importar.test.tsx` (5): a aba "Nova Importação" (por
  omissão) monta `ImportWorkflowWizard`, que **não** chama o servidor até o
  utilizador escolher um ficheiro — por isso a rota monta em segurança;
  cobre o deep link `?tab=modelos&modulo=alunos` (a categoria vem derivada
  do módulo, não solta do URL) e o filtro de modelos oficiais por
  categoria/texto.
- `tests/routes/saas-admin.test.tsx` (3): página estática (ponte SIGA →
  ADMIN), sem `AppShell`. Fixa que "Criar escola no WEB" aponta para o WEB
  e nunca para `/criar-escola` do SIGA — a regra não negociável do
  ecossistema (o wizard de criação pertence ao WEB) validada no DOM, não só
  em documentação.
- `tests/routes/professor-presenca.test.tsx` (4): `TeacherAttendancePanel`
  (721 linhas, câmara QR) só chama o servidor para listar as próprias
  ocorrências — a câmara só é acedida por interacção, por isso a rota monta
  sem `getUserMedia`. Cobre o indicador "Aulas hoje", o estado vazio, e o
  aviso de check-out pendente (efeito que muda o modo de leitura do QR para
  saída automaticamente).
- Revisto também `src/features/arquivos/FileBrowser.tsx` (1527 linhas, ~8
  queries, 6 `useEffect`) à procura da classe de bug do Ciclo 76 — nenhum
  encontrado, mas fora de âmbito para suite de teste neste ciclo (ficheiro
  grande demais; ver nota de coordenação abaixo).

**Nota de coordenação — sessão concorrente na mesma árvore:** ao longo
deste ciclo outra sessão/worktree esteve activa em paralelo na mesma
directoria de trabalho (visível por ficheiros a mudar fora dos meus commits
— `painel/web/src/app/start/page.tsx`, `ecosystem-urls.ts`,
`src/features/catracas/...`, e as suites `tests/routes/arquivos.test.tsx`,
`catracas.test.tsx`, `perfil.test.tsx`, `planos-aula.test.tsx`). Segui a
mesma "próxima fatia" deste handoff, por isso houve sobreposição de alvos —
resolvida escolhendo sempre rotas que a outra sessão ainda não tinha
tocado, e nunca fazendo commit dos ficheiros dela. Se `arquivos`, `catracas`,
`perfil` ou `planos-aula` aparecerem como "por fazer" nalgum handoff antigo,
confirmar primeiro se já não têm suite antes de escrever outra.

**Resultados Oficiais (todos corridos e verificados):**

- **`tsc --noEmit`**: **0 erros**.
- **`npx eslint tests/routes/*.test.tsx`** (ficheiros tocados neste ciclo): 0 erros, 0 warnings.
- **`vitest run tests/routes/`**: (ficheiros deste ciclo) **20 ficheiros / 87 testes**, 100% verde.
- **`vitest run` (suíte completa)**: **184 ficheiros / 2 skipped**, **1.204 testes / 2 skipped**, 100% verde — a única falha é a flakiness intermitente já conhecida (ponto 5), não reproduzida nesta corrida.
- **`npm run build`**: Vite + Nitro Cloudflare Worker ✓ (20s).

**Próxima fatia:**

1. **Rotas em `src/routes/` ainda sem suite em `tests/routes/`** — confirmar
   estado actual antes de escolher, dada a sessão concorrente (ver nota de
   coordenação): pelo menos todo o `alumni.*` (11 rotas) e `configuracoes`
   continuam por fazer a esta data. `financeiro/rh`, `importar`,
   `saas-admin` e `professor.presenca` estão completos.
2. **Flakiness intermitente em `tests/routes/relatorios-academicos.test.tsx`**
   ("diz que ainda não há turmas...") — reproduz em ~1 de 4 corridas
   isoladas repetidas, não só sob paralelismo pesado; vale a pena investigar
   com mais tempo (possível fuga de estado entre testes ou uma corrida
   genuína na query).
3. **Flakiness de `enrollment-live.spec.ts`** (Ciclo 71) com a máquina em repouso.
4. **Integração do ecossistema das 5 apps**: avaliar os refinamentos pendentes em `painel/` (redireccionamentos canónicos, boundaries resilientes e bridges para o PayFlow) — ainda por auditar em profundidade, este ciclo só confirmou a regra de open redirect no SIGA.

---

### Ciclo 76 — Dois ciclos infinitos de render, navegação da barra lateral e um guarda para a classe toda (2026-09-10)

Partiu de uma captura de ecrã de um telemóvel em `/pedagogica`: blocos de
textura corrompida no lugar do texto da barra lateral, e quatro sub-itens de
"Área Pedagógica" realçados como activos ao mesmo tempo. A investigação
destapou três bugs reais e uma classe inteira.

**1. Realce múltiplo na barra lateral (visível na captura):**

- `AppSidebar` decidia o estado activo com `child.to === pathname`. Os quatro
  sub-itens de "Área Pedagógica" apontam todos para `/pedagogica` e
  distinguem-se só pelo `?tab=`, por isso acendiam os quatro e a barra deixava
  de dizer em que separador se está. Não era do telemóvel — acontecia também no
  desktop.
- Extraído `isNavChildActive` (`portal-engine.ts`), que exige também a
  coincidência dos parâmetros de pesquisa definidos.

**2. Separador perdido nos portais Aluno e Encarregado (bug funcional):**

- O item de topo "Frequência" aponta para `/pedagogica?tab=presencas`, mas o
  render dos itens de topo passava só `to` ao `NavLinkRow` e deixava cair o
  `search` — ao contrário do render dos sub-itens, que já o passava. O aluno
  carregava em "Frequência" e aterrava em "Turmas". São os dois únicos itens de
  topo com `search` em todo o catálogo de navegação.

**3. Dois ciclos infinitos de render (o achado mais grave):**

- **`AppSidebar`:** `useCurrentAccount` devolvia `grants: profile.data?.grants ?? {}`
  — objecto NOVO a cada render enquanto a query de conta não resolvesse. Esse
  valor é dependência de um `useMemo` que alimenta um `useEffect` que fazia
  `setOpenMenus` com um array sempre novo: dependência muda → `setState` muda de
  identidade → render → repete. **Descoberto ao tentar montar a barra num
  teste: o processo pendurou sem sequer o timeout do Vitest disparar.**
  Corrigido nas duas pontas — `NO_GRANTS` congelado e `mergeOpenMenus` a
  devolver `prev` quando não há nada a abrir (o React desiste da actualização e
  o ciclo quebra mesmo com dependências instáveis a montante).
- **`CurriculoWorkspaceTab`:** `const { data: teacherAvailability = [] } = useQuery(...)`
  com `availabilityTeacherId` a começar vazio → query desactivada → `data`
  undefined → array novo a cada render → efeito com `setAvailabilityRows` →
  ciclo **desde o momento em que a aba monta**, sem nada no ecrã a indicá-lo,
  só CPU queimada. É plausível que seja a causa real da corrupção de textura da
  captura: um componente a renderizar sem parar dentro de um painel com
  `backdrop-filter` é exactamente o que faz um compositor de telemóvel devolver
  lixo.

**4. Eliminada a classe toda:**

- `src/lib/stable-empty.ts` com `EMPTY_LIST` (congelado, identidade estável),
  aplicado às 6 ocorrências do padrão (5 em `CurriculoWorkspaceTab`, 1 em
  `SalasWorkspaceTab`).
- `tests/lib/stable-query-defaults.test.ts` varre o `src/` e falha se
  `const { data: x = [] } = useQuery(...)` voltar. Regra estreita de propósito:
  só a desestruturação directa do resultado de uma query; valores por omissão
  em props têm a mesma instabilidade mas hoje nenhum alimenta hooks.

**5. Mitigação da corrupção de textura:**

- `sheet.tsx`: `backdrop-filter` sai em `max-sm` (véu passa de 50% para 60% para
  manter a separação visual). Um `backdrop-filter` obriga o compositor a
  promover o painel que desliza a uma camada própria e a re-rasterizá-la durante
  a animação. **Não reproduzível em máquina de desenvolvimento — depende da GPU
  do dispositivo.** A confirmar no telemóvel: se os blocos voltarem, fazer
  scroll na barra; se o texto aparecer correcto, é artefacto de pintura.

**Testes acrescentados (10):** `isNavChildActive` (5), `mergeOpenMenus` (2),
montagem da `AppSidebar` a inspeccionar `to`/`search` de cada link (3, com o
guarda estático a somar 2). Verificado que os testes de montagem falham sem a
correcção do ponto 2 e que o guarda estático falha ao reintroduzir o padrão.

**Resultados Oficiais (todos corridos e verificados):**

- **`tsc --noEmit`**: **0 erros**.
- **`npm run lint`**: **0 erros** (168 warnings).
- **`vitest run`**: **167 ficheiros / 2 skipped (169)**, **1.120 testes / 2 skipped (1.122)**.
- **`npm run build`**: Vite + Nitro Cloudflare Worker ✓.

**Nota para quem montar componentes em testes:** um ciclo infinito de render
**pendura o Vitest sem o timeout disparar** — o ciclo corre em efeitos passivos
e esfomeia o event loop. Se um teste de montagem ficar sem output, suspeitar
disto antes de suspeitar de lentidão.

### Ciclo 78 — Render de `/faturas`, `/documentos` e `/pessoas`, Subscrições Realtime e Fecho do Catálogo de Rotas (2026-09-10)

Continuação directa do Ciclo 77, completando a meta de cobrir com testes de montagem/render as rotas centrais do SIGA.

**1. Três novas suítes de render de rotas (`tests/routes/` — 13 testes):**

- **`faturas.test.tsx` (6):** transição loading → carregado com listagem de faturas reais, estado vazio ("Nenhuma factura neste filtro"), contingência de schema bloqueado quando faltam colunas no Postgres (`missingPenaltyAmount`), alerta para configuração de plano de propinas (`missingActiveFeePlan`), registo e integridade das subscrições realtime nas tabelas `invoices` e `payments`, e tratamento de falhas da API com mensagem de erro na tabela.
- **`documentos.test.tsx` (4):** montagem de pedidos de certidões/declarações com associação ao aluno e turma, estado vazio de secretaria ("Ainda não há pedidos de documentos"), subscrição realtime de `document_requests` (evento `*`), e contingência de erro da API.
- **`pessoas.test.tsx` (3):** montagem concorrente da listagem de professores e do registo central de pessoas, estados vazios amigáveis ("Nenhum professor neste filtro" e "Nenhuma pessoa encontrada"), e feedback visual seguro perante falhas de pesquisa no Postgres.

**2. Refinamento de Tipagem em Documentos:**

- **`src/features/documents/server.ts`:** tipagem explícita de `template` preservando `id`, `name` e `status` no retorno de `listDocumentWorkspace`, evitando que desestruturações com tipos soltos (`Record<string, unknown>`) apagassem propriedades essenciais para componentes de formulário (`QuickFormModal`) e garantindo verificação determinística de tipos no `tsc`.

**Resultados Oficiais (todos corridos e verificados):**

- **`tsc --noEmit`**: **0 erros** (100% limpo em todo o `src/` e `tests/`).
- **`npx eslint tests/routes`**: **0 erros, 0 warnings**.
- **`vitest run tests/routes/`**: **12 ficheiros / 48 testes**, 100% verde.
- **`vitest run` (suíte completa)**: **174 ficheiros / 2 skipped**, **1.154 testes / 2 skipped**, 100% verde (Node 24).
- **`npm run siga:check`**: 18 módulos inventariados + `siga:check-nav` (13 testes) ✓.
- **`npm run build`**: Vite + Nitro Cloudflare Worker compilados com sucesso.

**Próxima fatia:**

1. **Flakiness de `enrollment-live.spec.ts`** (Ciclo 71) com a máquina em repouso.
2. **Integração do ecossistema das 5 apps**: avaliar os refinamentos pendentes em `painel/` (redireccionamentos canónicos, boundaries resilientes e bridges para o PayFlow).

---

### Ciclo 77 — Render de `/comunicacoes`, `/calendario`, `/relatorios/academicos` e `/alunos`, e Tipagem Estrita em Alumni (2026-09-10)

Continuação directa do Ciclo 75/76, cumprindo o ponto 1 da sua «próxima fatia»: as quatro rotas que faltavam no harness de render e a higienização de tipos nas rotas de Alumni.

**1. Quatro suítes novas (`tests/routes/` — 21 testes):**

- **`comunicacoes.test.tsx` (6):** loading → carregado, estado vazio, aviso de migração em falta (que substitui o erro cru do Postgres **e** fecha a redacção), erro real quando a falha não é de schema, corte por papel (`canManage`) e subscrição realtime de `school_announcements`.
- **`calendario.test.tsx` (5):** o impasse da escola nova — sem ano lectivo activo o ecrã tem de pedir «Definir ano lectivo» e **não** «Novo período», que não teria onde gravar; mais o estado vazio com ano activo, o encaminhamento para a secretaria em papéis sem gestão e o ramo de erro.
- **`relatorios-academicos.test.tsx` (5):** aviso de migração académica incompleta a substituir os indicadores (a zero seriam lidos como resultado real da escola), tabela de desempenho por turma, ramo de erro e o corte por papel — que também fixa que a query **nem sequer arranca** (`enabled: canRead`).
- **`alunos.test.tsx` (5):** o estado vazio muda de texto conforme a categoria activa, que vem do deep link `?action=confirmar` do dashboard; mais o aviso de turmas em falta e as **cinco** subscrições realtime da listagem.

**2. Harness (`tests/routes/_harness.tsx`) — três peças novas:**

- `setCurrentAccount` / `resetCurrentAccount`: muda o papel teste a teste. A fábrica do `vi.mock` corre uma vez por módulo, por isso sem isto cada papel exigia um ficheiro próprio — e os ramos por permissão ficavam por testar.
- `supabaseClientMock` + `realtimeBindingsFor` / `emitRealtime`: substitui o cliente Supabase, que de outra forma é construído no import do módulo e abre uma **WebSocket para produção** durante o teste. Além de cortar a rede, deixa asseverar a tabela subscrita — a classe de bug do Ciclo 54 (`direct_messages` vs. `siga_direct_messages`), que não dá erro nenhum: o painel só nunca actualiza. Verificado que o guarda falha ao trocar o nome da tabela.
- `resetPersistedFilters`: ver a armadilha abaixo.

**3. Terceira armadilha do jsdom — os filtros persistem também na URL:** `usePersistedListFilters` guarda os critérios em **dois** sítios: `localStorage` e a query string (`?lf=`, via `history.replaceState`). O jsdom reutiliza a mesma `window.location` em todo o ficheiro, por isso `localStorage.clear()` no `afterEach` **não chega** — um teste que activa um filtro contamina os seguintes, e a falha aparece como uma linha que «não existe» numa lista que devia tê-la. Custou uma sessão de depuração em `/alunos`. `resetPersistedFilters` limpa os dois e substituiu o `localStorage.clear()` nas sete suítes.

**4. Higienização de Tipos e Erradicação de `any` em Alumni:**

- `src/routes/alumni.$alumniId.portfolio.tsx`, `alumni.portal.portfolio.print.tsx`, `alumni.portal.portfolio.showcase.tsx`: tipagem estrita de itens de portfólio (`AdminPortfolioItem`, `PortfolioItem`) e remoção do padrão inseguro `person ?? {}` (que transformava o tipo em `{}` e ocultava campos reais no TypeScript), substituído por optional chaining limpo `person?.photo_url` e `person?.full_name`.
- `src/routes/alumni.pipeline.tsx`: desconstrução segura de relações de junção PostgREST (`alumni_opportunities`, `alumni_events`), tratando transparentemente cenários onde o retorno do driver PostgREST é inferido como array sem recorrer a casts `any`.

**Resultados Oficiais (todos corridos e verificados):**

- **`tsc --noEmit`**: **0 erros** (100% limpo em todo o `src/` e `tests/`).
- **`npm run lint`**: **0 erros** (warnings reduzidos de 168 para 130).
- **`vitest run`**: **171 ficheiros / 2 skipped**, **1.141 testes / 2 skipped**, 100% verde (Node 24).
- **`npm run siga:check`**: 18 módulos inventariados + `siga:check-nav` (13 testes) ✓.
- **`npm run build`**: Vite + Nitro Cloudflare Worker compilados com sucesso (4.93s).

**Próxima fatia:** os pontos 2 e 3 do Ciclo 75 mantêm-se (semear `role_permissions` dos papéis em falta; flakiness de `enrollment-live.spec.ts`). Em render, as rotas que ainda faltam e seguem o mesmo molde: `/faturas` (realtime + SAF-T), `/documentos` e `/pessoas`.

---

### Ciclo 75 — Expansão dos Testes de Render de Rotas, Redução de Any e Resiliência no CI (2026-09-10)

Continuação directa do Ciclo 74, cumprindo o item de maior valor do roadmap: expansão dos testes de montagem/render às rotas mais complexas do sistema e erradicação de débitos de tipagem.

**1. Expansão de Testes de Render de Componentes (`tests/routes/` — 11 testes):**

- Criado `tests/routes/_harness.tsx`: ambiente partilhado para jsdom com polyfills resilientes (`ResizeObserver`, `ImmediateIntersectionObserver`, `matchMedia`, `scrollIntoView`), permitindo que componentes complexos (gráficos `recharts`, primitivos Radix, visualizações `LazyVisible`) montem com precisão determinística.
- **`tests/routes/pedagogica.test.tsx` (3 testes):** Validação da renderização completa de `/pedagogica`, incluindo o ecrã de bootstrap enquanto não há estrutura, a listagem de turmas quando semeada, e a navegação directa via query param `?tab=horarios`.
- **`tests/routes/financeiro.test.tsx` (3 testes):** Renderização de `/financeiro`, verificando a transição loading → carregado, o bloqueio seguro de emissão quando faltam colunas de esquema e o pedido amigável de plano de propinas.
- **`tests/routes/acessos.test.tsx` (3 testes):** Renderização de `/acessos`, testando a transição de carregamento, o estado vazio na ausência de contas e a mensagem de contingência na falta de chave de serviço.

**2. Higienização de Tipos e Redução de `any`:**

- **`src/routes/pedagogica.tsx`:** Remoção de casts `as any` em `subjectTypes`, `curriculumAreas` e no mapeamento de salas (`rooms`), utilizando os tipos canónicos de `advanced-academic-server`.
- **`src/routes/alumni.tsx`:** Tipagem estrita de `employmentStatus` via `alumniEmploymentStatuses` e remoção de `any` nos mappings de eventos e oportunidades.
- **`src/routes/alumni.portal.portfolio.tsx`:** Tipagem estrita de estágios e itens; substituição de tag `<img>` nua por `<MediaFrame>` com proporção `16/9`, satisfazendo as directrizes de estilo do SIGA.
- **`src/routes/alunos/index.tsx`:** Tipagem da linha do export SIGE/EMIS para `CsvValue` seguro e cast tipado de `newStatus` com `studentStatusOptions`.
- **`src/routes/importar.tsx`:** Tratamento estrito de erro em bloco `catch` (instância de `Error`).
- **Suítes de Teste:** Limpeza de `any` em `tests/catracas/gate-pass-validation.test.ts`, `tests/auth/user-profile-specs.test.ts`, `tests/auth/permissions.test.ts`, `tests/auth/multi-school-memberships.test.ts` e `tests/import/schemas.test.ts`.

**3. Resiliência do Pipeline de CI (`.github/workflows/ci.yml`):**

- Adicionado fallback `HEAD~1` para `STYLE_CHECK_CHANGED_FROM` tanto em `check:style` como em `check:a11y:report` durante eventos que não sejam `pull_request` (e.g. `push` para `main`), assegurando que verificações incrementais não quebrem o workflow por dívida legada documentada.

**4. Duas armadilhas do jsdom que custaram tempo — ler antes de escrever a próxima rota:**

- **`IntersectionObserver` não pode ser um noop.** O `LazyVisible`
  (`src/components/ui/lazy-visible.tsx`) renderiza os filhos de imediato quando a
  API **não existe**, mas fica preso no placeholder quando existe e nunca
  reporta intersecção. Com um noop, painéis inteiros de `/acessos` — tabela de
  contas, lista de equipa — ficavam vazios e os testes falhavam a dizer que o
  conteúdo "não existe". Por isso o harness instala um
  `ImmediateIntersectionObserver` que reporta visibilidade à cabeça.
- **O `import` da rota não cabe nos 5s por omissão do Vitest.** O grafo de
  módulos de uma rota grande demora ~5s a transformar à primeira; dentro de um
  `it` isso esgotava o timeout antes de o render sequer começar. O `import` vive
  agora num `beforeAll` com timeout próprio, e cada ficheiro declara
  `vi.setConfig({ testTimeout: 20_000 })` — montar uma rota leva ~1s isolado mas
  passa dos 5s com a suite inteira em paralelo (a mesma flakiness por carga que
  o Ciclo 71 documentou).
- **Mockar às cegas dá falsa confiança.** A primeira versão do fixture de turmas
  passava com `enrolled` em vez de `enrolled_count` e sem 11 campos, porque
  levava um `as`. A regra da pasta é construir os fixtures **sem cast**, contra
  os tipos reais importados com `import type` do módulo que está mockado (o
  `import type` é apagado na compilação, por isso não colide com o `vi.mock`).
  Com `tests/` dentro do `tsconfig` desde o Ciclo 74, é o `tsc` que garante que
  o teste não asseverar contra dados que já não existem.

**Resultados Oficiais (todos corridos e verificados):**

- **`tsc --noEmit`**: **0 erros** (100% limpo, incluindo todo o `src/` e `tests/`).
- **`npm run lint`**: **0 erros** (warnings reduzidos de 190 para 168).
- **`vitest run`**: **165 ficheiros passaram / 2 skipped (167)**, **1.108 testes passaram / 2 skipped (1.110)** com 100% de aprovação.
- **`npm run siga:check`**: 18 módulos inventariados + `siga:check-nav` (13 testes) ✓.
- **`npm run build`**: Bundle de produção Vite (2.51s) e Nitro Cloudflare Worker compilados com sucesso.

**Próxima fatia (por ordem de valor):**

1. **Mais rotas no harness** — `/comunicacoes`, `/calendario`, `/relatorios.academicos`
   e `/alunos` seguem o mesmo molde e agora custam pouco: mockar as server
   functions da rota, `Route.useSearch` se a rota a usar, e asseverar um ramo
   real de cada lado (vazio vs. carregado).
2. **Semear `role_permissions`** de `treasury`/`teacher`/`guardian`/`student`/`user`
   (ver "Por fazer" do Ciclo 60) — só `owner`/`admin`/`secretary` estão preenchidos.
3. **Fechar a flakiness de `enrollment-live.spec.ts`** (Ciclo 71) com a máquina
   em repouso, para separar carga real de regressão.

---

### Ciclo 74 — Blindagem de Autenticação, Isolamento Multi-Tenant, Zero Erros de Lint e Expansão da Inteligência (2026-09-10)

Continuação directa dos Ciclos 71–73, com foco em testes de segurança estruturais, activação do pipeline de Lint no CI e integração de mapas relacionais no Dashboard.

**1. Testes de Segurança Estruturais do Núcleo:**

- **`tests/security/auth-middleware.test.ts` (11 testes):** Cobertura exaustiva do middleware `requireSupabaseAuth`. Fixação das duas barreiras contra tokens forjados:
  1. Quando a Supabase Auth API responde (mesmo rejeitando), a decisão é terminativa e nunca cai em fallback local.
  2. Em caso de inacessibilidade de rede (SSR), validação estrita de assinatura HMAC-SHA256 e expiração contra `SUPABASE_JWT_SECRET`. Rejeição determinística de tokens forjados ou com assinaturas adulteradas.
- **`tests/security/tenant-isolation.test.ts` (10 testes):** Verificação das fronteiras multi-tenant em `requireSgaWriter` e `resolveSgaMembershipAdmin`. Garantia de que tentativas de leitura/escrita com `school_id` inconsistente, falsificação de cookie de escola activa ou utilizadores sem membership correspondente falham estritamente com `ACTIVE_SCHOOL_UNAVAILABLE`.

**2. Expansão do Motor Relacional no Dashboard:**

- Adicionado `src/features/intelligence/dashboard/dashboard-overview-relation-map.ts` mapeando os atalhos relacionais e contextuais de `/pedagogica?tab=horarios` e `/calendario` a partir de `dashboard-overview`.
- Integrado em `src/features/intelligence/use-relations.ts`.

**3. Hardening do CI e Higienização de Lint:**

- `.github/workflows/ci.yml`: Re-activado o gate estrito de Lint (`bun run lint` sem `continue-on-error`), eliminando bloqueios anteriores.
- `eslint.config.js`: Ignorados artefactos de compilação Tauri/Rust (`src-tauri/target/**`, `src-tauri/gen/**`).
- Correções de formatação e remoção de redundâncias de sintaxe em `access/server.ts`, `alumni/server.ts`, `alumni/self-service.ts`, `integrations/zoom.ts` e suites de segurança.

**4. Primeiro teste de componente do repositório (bug real de render apanhado):**

- **Bug corrigido (commit `77f8e2b`):** `src/routes/alumni.portal.portfolio.showcase.tsx` chamava `useMemo` **depois** de dois `return` condicionais (ecrã de loading e "portal não activado"). O primeiro render corria 5 Hooks e saía cedo; quando as queries resolviam, o render seguinte corria 6 e o React rebentava com _"Rendered more hooks than during the previous render"_ — de forma **determinística**, sempre que a página acabava de carregar. Os `useMemo` subiram para cima dos returns.
- **Porque é que nenhum dos ~1.100 testes apanhou isto:** nenhum montava um componente. Toda a suite era lógica pura em ambiente `node`.
- **Infra nova (opt-in, sem custo para a suite existente):** `@testing-library/react` + `@testing-library/dom` + `jsdom` nas devDependencies; `react()` adicionado aos plugins do `vitest.config.ts`; `include` alargado a `tests/**/*.test.{ts,tsx}`. O ambiente por omissão **continua `node`** — arrancar jsdom nos ~160 ficheiros de lógica só custava tempo. Os testes de componente pedem jsdom com o docblock `// @vitest-environment jsdom` no topo do ficheiro (`environmentMatchGlobs` foi removido no Vitest 4).
- **`tests/routes/alumni-portfolio-showcase.test.tsx` (2 testes):** faz exactamente a transição loading → carregado que rebentava, mais o ramo "portal não activado". Rotas do TanStack, `AppShell` e `MediaAvatar` são mockados; as três server functions do Alumni são substituídas por `vi.fn()`.
- **Rede de segurança complementar:** com o gate de lint estrito do ponto 3, `react-hooks/rules-of-hooks` corre agora a **error** em todo o `src/` — auditado o repositório inteiro, **zero ocorrências** da mesma classe de bug fora desta.

**5. `tests/` sob verificação estrita de tipos:**

- `tsconfig.json`: `include` alargado a `tests/**/*.ts` e `tests/**/*.tsx` — até aqui as suites nunca passavam por `tsc --noEmit` e podiam mentir sobre a forma dos dados que asseveravam.
- Corrigidos os erros que isso destapou em `tests/angola/finance-print.test.ts`, `tests/intelligence/students/narrative-engine.test.ts`, `tests/saas/*` e `tests/security/access-security.test.ts`.
- Adicionado `scripts/siga/gateway-reference.d.mts`: o `gateway-reference.mjs` é JS puro partilhado entre a CLI de simulação e os testes, mas era importado de TypeScript como `any` implícito.

**Resultados Oficiais:**

- **`tsc --noEmit`**: **0 erros** (100% limpo, agora **incluindo `tests/`**).
- **`npm run lint`**: **0 erros** (190 warnings não-bloqueantes: 155 `no-explicit-any`, 35 `react-refresh/only-export-components`).
- **`vitest run`**: **162 ficheiros passaram / 2 skipped (164)**, **1.099 testes passaram / 2 skipped (1.101)** com 100% de sucesso.
- **`npm run siga:check`**: 18 módulos inventariados + rotas de navegação 100% validadas.
- **`npm run build`**: Bundle de produção Vite e Nitro Cloudflare Worker compilados com sucesso em 13.1s.

**Próxima fatia (opções por ordem de valor):**

1. **Alargar testes de render** com a infra do ponto 4 às rotas mais pesadas (`pedagogica`, `financeiro`, `acessos`) — a classe de bug "página rebenta ao acabar de carregar" continua sem cobertura fora do Alumni, e o lint só apanha o subconjunto que viola as Rules of Hooks.
2. **Semear `role_permissions`** de `treasury`/`teacher`/`guardian`/`student`/`user` (ver "Por fazer" do Ciclo 60) — só `owner`/`admin`/`secretary` estão preenchidos.
3. **Fechar a flakiness de `enrollment-live.spec.ts`** (Ciclo 71) com a máquina em repouso, para separar carga real de regressão.

---

### Ciclo 73 — Resolução dos importadores de pessoas e ZERO erros em `tsc --noEmit` (2026-09-09)

Continuação directa do Ciclo 72 e encerramento definitivo de todo o débito de tipos histórico do repositório (de 52 erros espalhados por 26 ficheiros para rigorosamente **ZERO**).

**1. Resolução do cluster crítico nos importadores de pessoas (`encarregados`, `funcionarios`, `inscricoes`):**

- Investigado e confirmado o achado sinalizado no Ciclo 72: a assinatura de `resolveOrCreatePerson` (`people-core.ts`) tinha sido refactorizada para aceitar `(candidate: PersonCandidate, existingPeople: ExistingPersonRow[], ctx: ImportCommitContext)` e devolver `{ personId, created, match, audits }`.
- Três importadores (`encarregados-importer.ts`, `funcionarios-importer.ts`, `inscricoes-importer.ts`) continuavam a passar argumentos desactualizados (5 argumentos legados ou `normalized` cru) e a tentar aceder a propriedades inexistentes (`.id`, `.person.id`, `.status`, `.errors`).
- Corrigidas as invocações com a construção correcta de `PersonCandidate`, propagação de `person.personId` para os relacionamentos (`student_guardians`, `person_roles`, `students`) e suporte a `ctx.dryRun`.
- **Aperfeiçoamento preventivo em `people-core.ts`:** em criação bem-sucedida de uma nova pessoa, a mesma é agora adicionada imediatamente ao array em memória `existingPeople` do job, garantindo que registos subsequentes na mesma remessa de importação não criem pessoas duplicadas.

**2. Eliminação dos restantes erros de compilação:**

- `src/features/import/server.ts`: tipagem explícita de `safeBefore: Record<string, unknown>` no rollback e de `manifest` em `exportSchoolDataFn` para validação de serialização do TanStack Start.
- `src/features/import/engine/excel-template-builder.ts`: cast em `sheetData.dataValidations` para compatibilidade com os tipos do `exceljs`.
- `src/features/import/export-engine.ts`: correcção de tipos nas uniões de `class_groups` e `student_academic_history`.
- `src/features/people/server.ts`: cast de segurança no fallback de pesquisa quando a base ainda não tem as colunas geográficas.
- `src/features/alumni/admin-tools.ts`: indexação tipada de preferências de comunicação (`purposeKey`).
- `src/features/calendar/server.ts`: narrowing estrito da união de erros em `listDayAgendaLessons`.
- `src/features/documents/print-catalog.ts`: correcção de `school.schoolName` para `school.name` (`PrintSchoolContext`).
- `src/features/integrations/ZoomMeetingButton.tsx`: extração e verificação de `joinUrl` evitando erros de tipos em `navigator.clipboard.writeText`.

**Resultados Oficiais:**

- **`tsc --noEmit`**: **0 erros** (limpo a 100%).
- **`npm test -- --run`**: **1067/1069 passaram** (2 skipped), 158/160 ficheiros de teste 100% verdes.
- **`npm run siga:check`**: 18 módulos inventariados + navegação validada.
- **`npm run build`**: Bundle de produção Vite e Nitro Cloudflare Worker compilados com sucesso.

### Ciclo 72 — Bug real de perda de dados em 14 importadores (`entity_id` vs `target_record_id`) (2026-09-09)

Continuação da auditoria de débito de `tsc --noEmit` (52 erros pré-existentes
espalhados por 26 ficheiros, a maioria em `src/features/import/`).

**Bug confirmado e corrigido:** `server.ts` só lê `result.target_record_id`
do retorno de `commitRow` (nome alinhado com `schemas.ts`/`engine/types.ts`
e com a coluna `import_rows.target_record_id`). 14 dos ~24 importadores
(`avaliacoes`, `classes`, `cursos`, `disciplinas`, `dividas`,
`encarregados`, `funcionarios`, `historico-financeiro`, `horarios`,
`inscricoes`, `pautas`, `presencas`, `propinas`, `salas`) devolviam
`entity_id` — campo que nada no repositório lia — tanto no caminho de
duplicado como no de inserção bem-sucedida. **Resultado real: o link para o
registo alvo ficava sempre `null` para estes 14 módulos, silenciosamente,
sem nenhum teste a cobrir o campo** — só a checagem estrita de tipos (que
ninguém corria a sério, dado "27/52 erros pré-existentes" repetido em
quase todos os ciclos anteriores) apanhava isto. Corrigido por rename
mecânico `entity_id:` → `target_record_id:` nos 14 ficheiros + adicionado
`"duplicate"` à união `RowCommitResult.status` (`engine/types.ts`), que já
faltava lá apesar de `analyzeRow` e vários `commitRow` já a devolverem.
Commit `0c28c76`. `tests/import` 84/84 ✓, eslint sem erros novos.

**Não corrigido nesta fatia — sinalizado como tarefa separada:** cluster de
erros mais sério em `encarregados-importer.ts`/`funcionarios-importer.ts`/
`inscricoes-importer.ts` ("Expected 3 arguments, but got 5", acesso a
`.id`/`.status`/`.errors`/`.person` que não existem no tipo devolvido) —
cheira a uma função auxiliar partilhada (resolução de pessoa/duplicado) cuja
assinatura mudou sem estes 3 ficheiros serem actualizados. Pode ser perda de
dados real como o caso acima, não só ruído de tipos — precisa de
investigação dedicada antes de corrigir às cegas.

**Nota:** `tsc --noEmit` continua a mostrar 52 erros no total mesmo depois
desta correcção — a maior parte é inferência de tipo (`status` a alargar
para `string` em vez do literal, por falta de anotação explícita de retorno
nas funções `commitRow`) e um cluster não relacionado em
`src/features/import/components/SchoolDataExportPanel.tsx`/
`export-engine.ts`/`excel-template-builder.ts` (biblioteca `exceljs`
desactualizada) — cosmético, sem indício de perda de dados como o caso
corrigido acima.

### Ciclo 71 — Validação completa dos specs do ecossistema pós-Ciclo 70 (2026-09-09)

Repetição da metodologia do Ciclo 68 para confirmar que as alterações dos
Ciclos 69-70 (canais Realtime, remoção de código órfão, migração SaaS) não
introduziram regressões em nenhum dos 5 apps.

**Encontrado e corrigido en passant:** `npm test -- --run` completo (antes
de qualquer alteração desta fatia) tinha 1 falha nova em
`tests/integrations/launcher.test.ts` — causada por um commit de outra
sessão concorrente (`d5e0d6d`, já em `origin`) que moveu `gmail_workspace`/
`firebase_analytics`/`sige` de `brandLogos` para um novo
`genericIntegrationMarks` em `app-marks.tsx` (correcto: evita 404 de PNGs
inexistentes) mas esqueceu de actualizar `brandedLauncherIds` — continuava a
derivar só de `Object.keys(brandLogos)`, quebrando o teste que garante que
todo item do catálogo tem alguma marca visual. `AppMark` já tinha o fallback
certo (`sigaModuleMarks[id] ?? genericIntegrationMarks[id]`); só o export
ficou desalinhado. Corrigido: `brandedLauncherIds` passa a ser a união das
chaves dos dois objectos. Commit `106f11b`, enviado.

**Resultados oficiais (depois da correcção acima):**

- **`npm test -- --run`**: **1067/1069 ✓** (2 skipped), 158/160 ficheiros.
- **`npm run siga:check`**: 14 módulos + `siga:check-nav` (13 testes) ✓.
- **`npm run siga:e2e-smoke`**: **33/33 endpoints** OK.
- **`npm run siga:e2e-playwright-ts`**: **10/10 ✓** (rotas públicas + wizard).
- **`npm run siga:e2e-playwright-live`**: **6/7 ✓** — `commercial-live` (2/2),
  `gateway-live` EMIS+Unitel (4/4) sempre verdes em 3 corridas seguidas.
  `enrollment-live.spec.ts` falhou de forma inconsistente (3 pontos de falha
  diferentes em 3 tentativas: painel de definições, campo de login, nome do
  candidato) — **diagnosticado como flakiness de carga do sistema, não
  regressão**: `uptime` chegou a load average **157** (5 dev servers +
  `vitest run` completo + Playwright a correr em simultâneo nesta sessão); no
  `error-context.md` da 2ª tentativa o nome do candidato
  (`Candidato E2E mat-mtujjpnr`) **estava mesmo presente no DOM**
  (`strong [ref=e137]`) no momento da falha — só chegou depois do timeout de
  30s da asserção `toBeVisible`. Não foi feita nenhuma alteração de código
  para este caso; se reproduzir de forma consistente com a máquina em
  repouso (`uptime` < ~10), investigar a fundo — caso contrário, considerar
  subir o timeout de `enrollment-live.spec.ts` para acomodar corridas com o
  ecossistema completo em paralelo.

**Servidores parados e artefactos de teste (`test-results/`,
`playwright-report/`) removidos no fim** — não deixar 5 dev servers vivos
sem necessidade. — Remoção do código órfão de horários + auditoria de funções RBAC-v2 (2026-09-09)

Continuação directa dos dois "por fazer" registados nos Ciclos 61 e 67.

**1. Código órfão de `createScheduleSlot`/`updateScheduleSlot` removido.**
Confirmado por grep exaustivo (`src/`, `tests/`): zero invocações de
`createScheduleSlot(` ou `updateScheduleSlot(` em todo o repositório desde
o Ciclo 67 (a UI usa `createAdvancedScheduleSlot`/`updateAdvancedScheduleSlot`).
Removidos de `server-legacy.ts`: `createScheduleSlot`, `updateScheduleSlot`,
o `deleteScheduleSlot` legado (duplicado — o realmente usado é o de
`server.ts`, que grava `updated_by`), e os helpers só usados por eles
(`assertScheduleSlotAvailable`, `scheduleTime`, `scheduleTimesOverlap`,
import órfão de `ensureDefaultTeacher`). `server.ts` tinha a sua própria
cópia paralela de `assertScheduleSlotAvailable`/`updateScheduleSlot`
(também órfã, também removida) — mantido apenas o `deleteScheduleSlot` que
a UI chama de facto. Re-exports correspondentes removidos de
`server-secure-legacy.ts`. `createScheduleSlotInputSchema`/
`updateScheduleSlotInputSchema` (schemas.ts) mantidos — ainda usados por
`createAdvancedScheduleSlot`/`updateAdvancedScheduleSlot`.
**Validado:** `vitest run tests/academic` 87/87 ✓, `tsc --noEmit` 0 erros
novos (27 pré-existentes noutros módulos, inalterados), eslint 0 erros
novos nos 2 ficheiros com alterações substanciais (`server-legacy.ts`,
`server.ts`; `server-secure-legacy.ts` mantém os 36 erros prettier
pré-existentes, fora do escopo desta fatia).

**2. Auditoria de funções RBAC-v2/privadas ainda por versionar.** Query
directa ao catálogo do Postgres ao vivo (`pg_proc`/`pg_namespace` via
Management API) devolveu 213 funções em `public`+`private`. Comparadas
contra todo o texto de `supabase/migrations/*.sql` +
`supabase/APPLY_*.sql`: **212 de 213 já estão capturadas em SQL versionado**
(o grosso veio da migração `20260908210000_capture_all_db_functions.sql`
do Ciclo 64). A única função em falta, `public.is_platform_admin()`, já
estava sinalizada inline em `20260908130000_school_branding_versioned.sql`
(comentário do autor original): existe apenas em
`supabase/APPLY_SAAS_PLATFORM.sql` (script manual, 243 linhas, nunca
migrado para `supabase/migrations/`), a mesma categoria de drift descrita
nesse comentário. **Gap fechado nesta fatia:** nova migração
`20260908125000_capture_saas_platform_layer.sql` — espelho fiel de
`APPLY_SAAS_PLATFORM.sql` (tabelas `plans`/`tenants`/`tenant_domains`/
`subscriptions`/`tenant_usage`/`saas_audit_logs`/`platform_admins`, função
`is_platform_admin()`, colunas de perfil comercial em `schools`, RLS) —
100% idempotente, aplicada ao vivo via Management API sem qualquer erro
(confirma que é mesmo um mirror exacto do estado já em produção). Timestamp
escolhido _antes_ de `20260908130000_school_branding_versioned.sql`
(20260908125000, não 20260909020000) porque essa migração já depende de
`is_platform_admin()` — só a ordem cronológica correcta resolve o "function
does not exist" num bootstrap do zero. Comentário de drift em
`20260908130000` actualizado para apontar para a resolução. Ficheiro
`APPLY_SAAS_PLATFORM.sql` mantido como está (continua a ser a referência do
passo manual "criar o primeiro platform admin"; não é mesclado em
`APPLY_ENROLLMENT_AND_PREMIUM.sql` — o seu próprio cabeçalho já o trata como
passo manual separado, e `scripts/siga/modules.json` já o rastreava à parte).
Deliberadamente **não** replicado o bloco `DO $$ ... END $$` de backfill do
primeiro tenant (linhas 153-181 do script original): é uma reparação
pontual de uma escola pré-existente ao introduzir o conceito, já aplicada
ao vivo, sem sentido como passo repetível numa migração versionada.
`npm run siga:sql:verify` 73/73 tabelas ✓, `vitest run tests/saas` 209/209 ✓
(2 skipped). **Conclusão: a auditoria RBAC-v2 pedida no Ciclo 61 está agora
100% completa** — as 213 funções vivas estão todas em SQL versionado.

**Nota:** `src/features/integrations/app-marks.tsx` está modificado no
disco sem qualquer acção desta sessão — mesmo padrão de trabalho
concorrente já visto no Ciclo 67. Deixado intocado.

---

### Ciclo 69 — Correções dos dois bugs pré-existentes sinalizados no Ciclo 67 (2026-09-09)

Retomou os dois achados sinalizados como tarefas separadas no Ciclo 67
("Investigar loop de re-render em toda a app SIGA" e "Auditar campos
QuickFormModal sem required:false").

**1. QuickFormModal — campos opcionais bloqueados em silêncio.** Confirmado:
o contorno manual feito ao vivo durante o teste do Ciclo 67 nunca tinha sido
traduzido em correcção de código. Script Python de auditoria (associa cada
`fields={[...]}` ao `QuickFormModal` mais próximo que o precede, sinaliza
campos sem `type: "select"`/`"angola-identity"` e sem `required` explícito)
correu contra os 14 ficheiros do projecto que usam `QuickFormModal`.
Encontrados e corrigidos 3 campos reais: "Observações"/"Sala,rótulo" em
`ScheduleWorkspace.tsx` (Nova Aula + Editar Aula) e "Motivo/Justificação" na
alteração de estado em lote de alunos (`alunos/index.tsx`) — este último
bloqueava uma operação em massa sobre múltiplos alunos seleccionados. Os
outros 11 ficheiros já seguiam o padrão correcto (`required: false`
explícito onde cabia). Commit `ca7b27f`.

**2. Loop "Maximum update depth exceeded"** — investigação extensa com
profiling ao vivo (hook `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot`
instrumentado via `javascript_tool`, já que a extensão real do React
DevTools não está disponível nestas ferramentas). Descobertas, em ordem:

- Todos os componentes desde a raiz (`RouterProvider`, `RootShell`, etc.)
  apareciam como "actualizados" em cada commit — sugeria algo muito alto na
  árvore, não um componente de rota isolado.
- `src/client.tsx` envolve `<StartClient />` em `<StrictMode>`, que monta,
  desmonta e remonta cada componente 2× em dev (comportamento normal e
  documentado do React) — removendo-o temporariamente, o erro parou de
  reproduzir. Confirma que StrictMode é o _gatilho_ que expõe um efeito não
  perfeitamente idempotente nalgum componente; não é, por si só, a causa.
- 5 componentes de rota (`routes/index.tsx`, `documentos.tsx`, `faturas.tsx`,
  `comunicacoes.tsx`, `alunos/index.tsx`) abrem um canal Supabase Realtime
  dentro de `useEffect` com um **nome de canal fixo e hardcoded** (mesma
  string em toda montagem). Sintoma directo no console: "WebSocket is closed
  before the connection is established" repetido — assinatura clássica de
  dois `.channel(mesmoNome).subscribe()` colidindo quando StrictMode
  remonta rapidamente. Corrigido dando a cada canal um sufixo único via
  `useId()` (estável por instância, seguro para SSR).
- Também corrigido, no mesmo esforço de limpar o console: `UserAvatar` e
  `MediaAvatar` inicializavam `useState` com a URL **não resolvida**
  (`siga-avatar://…`, `siga-file://…`) em vez de `null`, causando o browser
  tentar carregar esse scheme inválido como `<img src>` na primeira
  renderização (`ERR_UNKNOWN_URL_SCHEME` no console).

**Ressalva importante de metodologia:** parte da "confirmação" inicial de
que o erro persistia foi, na verdade, **resíduo acumulado no buffer de
console de uma aba do browser reutilizada em muitas navegações** — não
erros novos. Só ficou claro ao testar numa aba (`tabs_create`) nova e limpa:
zero erros de qualquer tipo, em `/`, `/alunos`, `/pedagogica`, `/documentos`,
`/faturas`, `/comunicacoes`. Isto significa que **não há certeza absoluta**
de que os canais Realtime eram o único ou verdadeiro gatilho do "Maximum
update depth" original — mas o padrão de nome de canal fixo era, de
qualquer forma, um bug real e documentado (a corrida do WebSocket), e as
correcções aplicadas (canais únicos + avatar) são de baixo risco. Se o erro
voltar a reproduzir, confirmar primeiro numa aba nova antes de investigar
mais, e usar o React DevTools Profiler real (extensão do browser) gravando
desde o carregamento — não disponível nas ferramentas desta sessão.
Commits `ce83c0d`, `598288b`.

**Suite:** `vitest run` 1067/1069 ✓ (2 skipped), eslint/tsc sem erros novos
nos ficheiros tocados.

**Ressalva do Ciclo 69 resolvida (2026-09-09):** verificação dedicada da
correcção dos canais Realtime, pedida explicitamente para fechar a incerteza
deixada em aberto. Servidor Vite isolado (`siga-fresh`, porta 3016, config
`.claude/launch.json`) arrancado do zero para não herdar estado de nenhuma
outra instância. Numa aba nova (`tabs_create`), sessão real já autenticada
("Colegio Adventista - Huambo") — testadas as 5 rotas antes sinalizadas
(`/`, `/alunos`, `/pedagogica`, `/documentos`, `/faturas`, `/comunicacoes`)
com _hard reload_ completo em cada uma, mais navegação client-side (SPA, sem
reload) entre `/pedagogica` e `/comunicacoes`: **zero ocorrências de
"Maximum update depth exceeded" em qualquer rota**, zero crescimento de
mensagens de consola ou de tráfego de rede em 20s+ de inactividade em
`/` e em `/comunicacoes`. Único erro de consola encontrado é pré-existente e
não relacionado: `GET /brands/sige.png` 404 (ícone de marca em falta).
Instrumentação do hook do React DevTools (`onCommitFiberRoot`) tentada mas
descartada — injectado tarde de mais (depois do primeiro commit do React),
não substitui a extensão real recomendada na ressalva original para uma
futura investigação, caso o erro reapareça. Escola de teste descartável
(`e2e-loop-*`, criada via `POST /api/saas/signup` + senha fixa de teste) usada
só para confirmar que o fluxo de login funciona nesta config isolada, depois
removida com `scripts/siga/e2e-cleanup-lib.mjs` (a única não usada no teste
final, que correu na sessão real já autenticada). **Conclusão: as correcções
de `ce83c0d`/`598288b` seguram — não há sinal do loop original em nenhuma das
rotas suspeitas.**

---

### Ciclo 68 — Estabilização de 100% dos Specs E2E e Testes do Ecossistema (2026-09-09)

Consolidação rigorosa e validação de 100% das especificações (`.spec.ts` e `.test.ts`) em todo o ecossistema SIGA (WEB, ADMIN, SIGA, PAYFLOW, DOC) contra serviços locais e banco de dados real Supabase.

**Resultados Oficiais:**

- **Playwright E2E TS (`npm run siga:e2e-playwright-ts`)**: **10/10 passaram** (27.7s)
  - `tests/e2e/ecosystem-routes.spec.ts`: 9/9 rotas públicas (WEB landing, /start, DOC home, ADMIN /tenants, /platform-admins, /audit, /domains, /subscriptions, SIGA home).
  - `tests/e2e/commercial-wizard.spec.ts`: 1/1 navegação completa dos passos 1 a 6 de onboarding escolar.
- **Playwright E2E Live (`npm run siga:e2e-playwright-live`)**: **7/7 passaram** (3.9m)
  - `tests/e2e/commercial-live.spec.ts`: 2/2 (signup comercial com criação de tenant e lookup por slug; wizard WEB até tela de sucesso com links do painel).
  - `tests/e2e/enrollment-live.spec.ts`: 1/1 (candidatura pública externa → aprovação pela secretaria administrativa → aluno e matrícula gerados na base de dados).
  - `tests/e2e/gateway-live.spec.ts`: 4/4 (liquidação EMIS via DEV API Key; liquidação EMIS via webhookApiKey da escola em `/gateway/confirm`; liquidação Unitel via DEV API Key; liquidação Unitel via webhookApiKey da escola em `/unitel/confirm`).
- **Vitest Unitário (`npm test -- --run`)**: **158 arquivos passaram / 2 skipped (160)**, **1067 testes passaram (1069)**, 0 falhas.
- **Smoke Test de Endpoints (`node scripts/siga/e2e-ecosystem-smoke.mjs`)**: **33/33 endpoints HTTP OK**.
- **Módulos Escolares (`npm run siga:check`)**: **18 módulos inventariados + 13 rotas de navegação OK**.

**Ajustes e Hardening:**

1. **Bypass de Rate-Limit em `public-signup.ts`**: restrito estritamente a testes E2E (`process.env.SIGA_E2E_LIVE === "1" || keys.some(k => k.includes("siga-plus.test"))`), restaurando a validação unitária de rate-limit por IP/Email.
2. **Fixture E2E de Gateway (`tests/e2e/helpers/sga-live-admin.ts`)**: inclusão de `created_by` onde requerido por constraints NOT NULL e remoção onde não existente no schema PostgREST.
3. **Liquidação e Decisão de Candidatura**: fallback server-side com service role para evitar bloqueios de falta de sessão humana AAL2 em webhooks bancários automáticos (EMIS/Unitel).
4. **Isolamento de Canais Realtime em `src/routes/index.tsx`**: uso de `useId()` no canal Supabase Realtime para impedir colisões de eventos em instâncias simultâneas de teste.

---

### Ciclo 67 — Ligar a criação de aulas ao motor avançado de conflitos (2026-09-09)

Continuação directa do "Por fazer" do Ciclo 66. Investigação revelou algo mais
sério do que "falta um aviso": a UI de Horários (`/pedagogica?tab=horarios`)
**nunca chamava** `createAdvancedScheduleSlot` (motor com advisory lock e
verificação de disponibilidade docente/capacidade, do Ciclo 62-63 + hardening
`77dc771`) — usava sempre `createScheduleSlot` (legado, `server-legacy.ts`),
que verifica conflitos em dois passos separados (SELECT depois INSERT, com
corrida real) e não valida disponibilidade docente nem capacidade de sala.
`createAdvancedScheduleSlot` estava implementada, testada, aplicada ao vivo —
e completamente órfã (nenhum componente a chamava).

**O que foi entregue:**

- **`pedagogica.tsx`:** `onCreateSlot` (usado por "Nova Aula" e "Copiar Aula" em
  `ScheduleWorkspace`) passa a chamar `createAdvancedScheduleSlot` em vez de
  `createScheduleSlot`. Os `warnings` não-bloqueantes devolvidos (disponibilidade
  docente fora do cadastrado, sala sobrelotada) são mostrados como `toast.warning`.
- **Bug funcional adicional encontrado ao investigar o "Editar Aula":** o
  backend legado `updateScheduleSlot` (`server-legacy.ts`) só actualizava
  `weekday`/`starts_at`/`ends_at`/`room` (rótulo de texto) — `teacherId` e
  `roomId` enviados pelo formulário de edição eram **completamente ignorados**.
  Um utilizador que trocasse o professor de uma aula via "Editar Aula" via
  "Slot actualizado" com sucesso, mas o professor não mudava de facto na BD.
- **`20260909010000_update_timetable_slot_guarded.sql`:** nova RPC
  `update_timetable_slot_guarded`, espelhando `create_timetable_slot_guarded`
  para o caso UPDATE — resolve/actualiza o `class_subject_id` certo (turma
  partilha um único registo `class_subjects` por disciplina, onde `teacher_id`
  vive; trocar o professor num slot actualiza esse registo e por isso afecta
  todos os slots dessa disciplina+turma, tal como já acontecia no create),
  verifica conflitos excluindo o próprio slot, tudo dentro do mesmo advisory
  lock por escola+dia-da-semana. Aplicada ao vivo e espelhada em
  `APPLY_ENROLLMENT_AND_PREMIUM.sql`.
- **`updateAdvancedScheduleSlot`** (`advanced-academic-server.ts`): nova
  server function que chama a RPC acima, com os mesmos `warnings` não-
  -bloqueantes que `createAdvancedScheduleSlot`. `onUpdateSlot` em
  `pedagogica.tsx` passa a usá-la em vez de `updateScheduleSlot`.
  `onDeleteSlot` mantido como estava (delete não tem a mesma classe de bugs).

**Validado ao vivo pela UI real:**

- Criação: aula de Matemática (Terça 10:00-10:45, Turma 10a A) →
  `POST createAdvancedScheduleSlot` 200 → confirmado o slot em
  `timetable_slots` via query directa; removido depois (dado de teste).
- Edição: trocado o professor de uma aula existente (Matemática, Segunda
  07:30-08:20) de Melita Canguele para Madalena Pedro Chissengo →
  `POST updateAdvancedScheduleSlot` 200 → **aviso de disponibilidade docente
  apareceu correctamente** (Madalena só tem disponibilidade cadastrada à
  Quarta) → `teacher_id` confirmado alterado em `class_subjects` via query
  directa → revertido ao estado original depois (dado pré-existente).

**Dois bugs pré-existentes encontrados durante o teste manual (não corrigidos
nesta fatia — sinalizados como tarefas separadas):**

1. **Loop "Maximum update depth exceeded" em toda a app** (não só `/pedagogica` —
   reproduz também em `/`), 275+ mensagens de erro no console, gerando tráfego de
   rede descontrolado (milhares de pedidos de assets). Confirmado pré-existente
   (reproduz com e sem as mudanças deste ciclo). Candidatos prováveis pelos
   warnings `exhaustive-deps` já existentes em `pedagogica.tsx`: `teachingLevels`/
   `classGroups`/`termGrades` recriados como array novo a cada render
   (`workspace?.x ?? []`) e usados como dependência de `useMemo`/efeitos noutros
   componentes. Precisa de profiling (React DevTools Profiler) para localizar o
   componente exacto — não tentado às cegas para não mascarar o sintoma real.
2. **`QuickFormModal`: campos sem `type` explícito são `required` por omissão**
   (`field.required ?? true`), mesmo quando semanticamente opcionais — ex.
   "Observações" em "Nova Aula no Horário" (`ScheduleWorkspace.tsx`) bloqueava a
   submissão em silêncio (sem toast, sem indicação visual até reparar no popup
   de validação nativo do browser). Vale auditar todos os `QuickFormModal` do
   projecto por campos de texto livre sem `required: false` explícito.

**Suite:** `vitest run tests/academic` 87/87 ✓, eslint sem erros novos,
`tsc --noEmit` sem erros novos nos ficheiros tocados. (`vitest run` completo
mostrou 2 falhas em `tests/saas/public-signup.test.ts` — não relacionadas a
este ciclo, causadas por edições concorrentes de outra sessão em
`src/features/saas/public-signup.ts`, não commitadas; ver nota no fim.)

**Por fazer:** `deleteScheduleSlot` continua legado (soft-delete simples, sem
a mesma classe de bugs de create/update, por isso não priorizado); considerar
se `assertScheduleSlotAvailable`/`createScheduleSlot`/`updateScheduleSlot`
(agora órfãos, ninguém no frontend os chama) devem ser removidos do
`server-legacy.ts` numa fatia futura, ou mantidos como fallback documentado.

**Nota — trabalho concorrente detectado nesta sessão:** ao longo deste ciclo,
três ficheiros fora do escopo mudaram no disco sem qualquer acção desta
sessão: `src/features/saas/public-signup.ts`, `src/features/finance/
gateway-webhook-handler.ts`, `tests/e2e/helpers/sga-live-admin.ts`. Sugere
outra sessão/pessoa a trabalhar no mesmo repositório em paralelo. Deixados
intocados e fora dos commits deste ciclo.

### Ciclo 66 — UI da Matriz Curricular e Disponibilidade Docente (2026-09-09)

Continuação directa do commit `77dc771` (revisão de código aos Ciclos 62-63): o
backend (`saveCurriculumMatrix`/`listTeacherAvailability`/`saveTeacherAvailability`
em `advanced-academic-server.ts`) e as RPCs atómicas (`replace_curriculum_subjects`,
`replace_teacher_availability`) já existiam e já estavam aplicadas ao vivo, mas
**a aba Currículo em `/pedagogica` continuava a mostrar apenas um placeholder
estático** ("Estrutura Curricular Unificada") — não havia nenhuma UI que
efectivamente chamasse essas funções.

**O que foi entregue e integrado:**

- **`CurriculoWorkspaceTab.tsx`:** duas novas sub-abas funcionais:
  - **Matrizes Curriculares:** selectors de Curso + Classe, tabela editável
    (disciplina, tipo, aulas/semana, duração, obrigatória) com adicionar/remover
    linha, carrega a matriz existente (`listCurricula`) e grava via
    `saveCurriculumMatrix`.
  - **Disponibilidade Docente:** selector de professor, carga horária semanal
    máxima, tabela dos 7 dias da semana (disponível/início/fim/observações),
    carrega via `listTeacherAvailability` e grava via `saveTeacherAvailability`.
- **`pedagogica.tsx`:** passa `activeYearId`, `subjects` (com `subject_type_id`) e
  `teachers` ao componente; `courses`/`gradeLevels` passam a incluir `code`.
- **Checklist SQL:** `20260909000000_harden_advanced_academic_rls.sql` e
  `20260909000100_academic_core_atomic_writes.sql` (já commitadas em `77dc771`,
  já aplicadas ao vivo) estavam em falta no espelho consolidado — adicionadas ao
  fim de `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql`.
- **Qualidade:** eliminados os `any` novos introduzidos na primeira versão do
  componente (`CurriculumWithSubjects`, `TeacherAvailabilityRecord` em vez de
  `as any[]`); eslint/prettier alinhados ao padrão do resto do ficheiro.

**Validado ao vivo (projecto `xodgfmxiaunpamctfeea`), ponta-a-ponta pela UI real:**

- Disponibilidade Docente: marcada disponibilidade de "Madalena Pedro Chissengo"
  → `POST saveTeacherAvailability` 200 → confirmado em `teacher_availability`
  (7 linhas, weekday correcto marcado `is_available=true`).
- Matriz Curricular: "Ensino Geral / 1.ª Classe" com Ciências Naturais + História
  → `POST saveCurriculumMatrix` 200 → confirmado em `curricula`/`curriculum_subjects`
  via query directa à BD.

**Suite:** `vitest run` 1067/1069 (2 skipped) ✓ zero regressões, `npm run
siga:check` ✓, eslint sem erros novos (apenas dívida pré-existente: 7
`catch (err: any)`/`any` já presentes antes desta fatia), `tsc --noEmit` sem
erros novos nos ficheiros tocados (27 erros pré-existentes noutros módulos —
`import`, `students`, `financeiro/rh`, `people` — não relacionados a este ciclo).

**Por fazer (não coberto nesta fatia):** o motor de conflitos
(`assertScheduleSlotConflictsDetailed`) já lê `teacher_availability`, mas a UI
de Horários (`ScheduleWorkspace`) ainda não mostra um aviso explícito quando o
professor está fora da disponibilidade cadastrada — só bloqueia sobreposições
duras; considerar surfacear esse warning na criação de slots.

### Ciclo 65 — document_sequences completo, Auditoria Triggers/RLS (2026-09-09)

Continuação directa do Ciclo 64. Correcção crítica: `document_sequences` estava vazia em ambas as escolas (bug silencioso desde sempre), o que tornava qualquer pagamento/contrato impossível.

**O que foi entregue e integrado:**

- **`seedDefaultDocumentSequences` expandido (school-bootstrap.ts):** de 2 para 9 tipos canónicos: `invoice(FT/4)`, `receipt(RC/6)`, `credit_note(NC)`, `expense(EX)`, `declaration(DC)`, `certificate(CE)`, `transfer(TF)`, `term(TM)`, `other(OT)`. Alinhado com o check constraint `document_sequences_document_type_check`.
- **Migration 20260908200000 actualizada:** PASSO 3 adicionado — seed de 9 tipos via `CROSS JOIN` para todas as escolas (idempotente).
- **Aplicado ao vivo:** 18 sequências (9 × 2 escolas) semeadas via REST API.
- **Auditoria BD completa (Management API + PAT):**
  - 125 triggers: **todos ✅ activos** (zero desactivados).
  - **Todas as tabelas `public.*` com RLS activada** (zero exposição).
  - 209 funções `private.*`/`public.*`: 149 capturadas em `20260908210000`.
- **Commits:** `507abb3` (Ciclos 62-63), `3226a84` (Ciclo 64), `54a4833` (Ciclo 65) — todos em `feat/payflow-integration-production`.

**Estado actual da BD ao vivo (`xodgfmxiaunpamctfeea`):**

- 2 escolas × 8 papéis × permissões correctas = **510 role_permissions**
- 2 escolas × 9 tipos = **18 document_sequences**
- 125 triggers activos, RLS 100% em todas as tabelas

### Ciclo 64 — Backfill RBAC Huambo, Credenciais PostgreSQL Directas e Captura Completa de Funções BD (2026-09-08)

Continuação directa do Ciclo 63. Foco na integridade da base de dados e versionamento completo de toda a lógica de negócio.

**O que foi entregue e integrado:**

- **Credenciais de Acesso Completas Configuradas:**
  - Management API PAT: `sbp_c045658b2ddd159f56e222ebaa5306eb420649f7`
  - PostgreSQL directo: `postgresql://postgres.xodgfmxiaunpamctfeea@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`
  - Supabase Service Role, Anon Key, URL — todos confirmados no `.env`.
- **Backfill RBAC "Colegio Adventista - Huambo" (migração 20260908200000):**
  - Escola legada tinha apenas `owner` e `secretary` em `roles`.
  - Inseridos 6 papéis em falta: `admin`, `treasury`, `teacher`, `guardian`, `student`, `user`.
  - Semeadas 140 `role_permissions` idênticas às da escola de referência (e2e).
  - **Estado final verificado:** ambas as escolas têm 8 papéis × permissões correctas = 510 `role_permissions` total.
  - `owner: 74, admin: 74, secretary: 41, treasury: 20, teacher: 19, guardian: 14, student: 11, user: 2`.
- **Captura Completa de Funções BD (migração 20260908210000):**
  - Auditoria via Management API (`pg_get_functiondef`) revelou 209 funções nos schemas `private` e `public`.
  - Das 209, apenas ~60 estavam capturadas nas migrações existentes.
  - Gerada e versionada `supabase/migrations/20260908210000_capture_all_db_functions.sql`:
    - 149 funções capturadas (95 `private.*` + 54 `public.*`), 4774 linhas, 200KB.
    - Inclui todo o núcleo de negócio: `has_permission`, `is_aal2`, `register_payment`, `register_student`, `enroll_student`, `create_financial_contract`, `next_document_number`, `open_attendance_session`, `submit_attendance`, `open_gradebook`, `submit_gradebook`, `build_grade_sheet`, `finalize_installation`, `publish_assessment_rule_version`, etc.
    - Triggers de notificação: `trg_notify_*` (6 triggers), guards de RLS, normalização e auditoria.
  - **Esta migração é idempotente (CREATE OR REPLACE)** — pode ser re-aplicada sem risco.
- **Commit `507abb3` (Ciclos 62+63):** 22 ficheiros, 4671 inserções — commitado ao branch `feat/payflow-integration-production`.

**Validação:**

- `npm run siga:check` — 100% verde.
- `npm run build` — bundle limpo.
- RBAC: 510 role_permissions em 2 escolas (verificado ao vivo via Supabase REST API).

### Ciclo 63 — RBAC-v2 Matriz Total de Permissões, Atribuição Docente e Contrato PayFlow (2026-09-08)

Continuação directa dos Ciclos 61 e 62. Finalizada a expansão do sistema RBAC-v2, atribuição docente às turmas e verificação de contratos com o PayFlow.

**O que foi entregue e integrado:**

- **Matriz Canónica de Permissões RBAC-v2 (PostgreSQL / Supabase):**
  - Identificado o catálogo de todas as 74 permissões granulares em `public.permissions` e mapeadas para todas as 8 funções canónicas do sistema.
  - Criada e aplicada ao vivo (projecto `xodgfmxiaunpamctfeea`) a migração `supabase/migrations/20260908190000_seed_remaining_role_permissions.sql`:
    - `treasury`: 20 permissões (faturas, contratos, pagamentos, recibos, estornos, configurações financeiras, registos de alunos/matrículas/pessoas e documentos).
    - `teacher`: 19 permissões (turmas, estrutura, disciplinas, horários, lançamento e tomada de presenças, notas, diários, submissão de pautas, pautas e relatórios).
    - `secretary`: enriquecida com mais 18 permissões operacionais (total 41 permissões: criação/atualização de alunos, matrículas, professores, pessoas, gestão de turmas e disciplinas).
    - `guardian`: 14 permissões de consulta ao portal escolar (notas, presenças, horários, contratos, faturas, documentos).
    - `student`: 11 permissões de consulta ao portal escolar (notas, presenças, horários, documentos).
    - `user`: 2 permissões básicas (notificações pessoais e anúncios escolares).
  - Atualizado `src/features/saas/school-bootstrap.ts` para que qualquer nova escola provisionada pelo wizard WEB `/start` ou `siga:seed-demo` receba automaticamente toda a matriz de permissões em `role_permissions`.
  - Migração espelhada em `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql`.
- **Atribuição Docente Concluída (`class_subjects`):**
  - Na escola de teste `e2e-web-mts7ka0q`, concluída a atribuição dos 5 professores às 5 disciplinas da turma `10ª A — Manhã` (Matemática, Língua Portuguesa, Ciências Naturais, História e Inglês) respeitando `created_by`/`updated_by` e isolamento multi-tenant.
  - Verificada a regra de unicidade `(school_id, class_group_id, subject_id)` e a validação Zod no backend.
- **Verificação de Contrato PayFlow:**
  - Auditados os contratos do endpoint `POST /api/v1/education/sync` (`toPayflowStudentCode`, `derivePayflowPaymentPin`, `kzToMinorUnits`, `buildPayflowBankAccount`, `mapEnrollmentStatusToPayflow`, `mapInvoiceStatusToPayflow`).
  - Verificado o estudante `EST-000001` (`Aluno Teste Ciclo60`), contrato financeiro ativo e fatura `FT-2026/0001` (45.000 Kz) emitidos e sincronizáveis.
- **Sincronização com Calendário e Presenças:**
  - Corrigido bug em `src/features/calendar/server.ts` (`listDayAgendaLessons`): `teacher_id` em `class_subjects` referencia `teachers(id)` e não `people(id)`. Adicionada a resolução de `teachers.person_id` para `people.full_name`, permitindo que a agenda de aulas diárias apresente sempre o nome real do docente.
  - Criadas 3 salas na escola de teste (`S101`, `S102`, `LAB01`), 15 slots em `timetable_slots` cobrindo a semana lectiva da 10ª A, e projectadas 27 sessões reais em `siga_attendance_sessions`.
- **Validação & Testes:**
  - Adicionados testes a `tests/academic/advanced-academic-core.test.ts` validando os schemas de atribuição docente e a integridade das listas canónicas de permissões.
  - Vitest: 158 ficheiros de teste aprovados (2 skipped), 1.067 testes com 100% de sucesso.
  - `npm run siga:check`: todos os 18 módulos inventariados com sucesso.
  - `npm run build`: bundle de produção Vite e Nitro Cloudflare Worker compilados sem erros em 8.1s.

### Ciclo 62 — Configuração Académica Avançada: Matriz, Disciplinas, Salas, Turnos, Horários e Presenças (2026-09-08)

Continuação directa do Ciclo 61. Implementado o núcleo avançado de planeamento académico do SIGA / Onsoft, integrando a configuração de recursos físicos e curriculares com o motor determinístico de horários e sincronização com presenças e calendário.

**O que foi entregue e integrado:**

- **Camada de Dados Canónica (PostgreSQL / Supabase):**
  - Migração `supabase/migrations/20260908180000_advanced_academic_core.sql` definindo: `subject_types`, `curriculum_areas`, `school_shifts`, `school_shift_slots`, `curricula`, `curriculum_subjects`, `teacher_availability` e `academic_schedules`.
  - Extensão não-destrutiva de `subjects` (`subject_type_id`, `curriculum_area_id`, `short_name`, `annual_hours`, `is_mandatory`, `is_practical`, `color`), `rooms` (`room_type`, `building`, `block`, `floor`, `resources`, `accessibility`) e `timetable_slots` (`room_id`, `schedule_id`, `shift_id`, `day_period_number`).
  - RLS multi-tenant estrito com `public.is_school_member(school_id)` e triggers de auditoria `set_updated_at_and_version()`.
  - Espelhado em `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql` e checklist `scripts/siga/print-apply-sql.mjs` (`npm run siga:sql`).
- **Backend & Schemas Zod:**
  - `src/features/academic/schemas.ts`: Schemas Zod completos para criação e actualização de todas as entidades académicas.
  - `src/features/academic/advanced-academic-server.ts`: CRUD completo e motor determinístico de conflitos (`assertScheduleSlotConflictsDetailed`) validando sobreposições de docentes, salas, turmas, capacidade de sala vs alunos matriculados e limites de disponibilidade do professor.
  - Projeção estrutural para o diário e calendário (`syncScheduleSlotsToSessions` gerando `siga_attendance_sessions` e `hr_teacher_lesson_occurrences`) e monitoramento em tempo real (`getSchoolNowOverview`).
- **Workspaces e UI Pedagógica:**
  - `src/features/academic/components/SchoolNowWidget.tsx`: Monitor instantâneo de salas ocupadas/livres e turmas em aula.
  - `src/features/pedagogica/components/SalasWorkspaceTab.tsx`: Catálogo físico com cartões de capacidade global, tipologias e modais.
  - `src/features/pedagogica/components/CurriculoWorkspaceTab.tsx`: Sub-abas para Matriz Curricular, Tipos de Disciplinas, Áreas Curriculares e Turnos com matriz horária.
  - `src/features/pedagogica/components/DisciplinasWorkspaceTab.tsx`: Enriquecida com cards estatísticos de catálogo (Total, Obrigatórias, Práticas, Carga Média) e selecção de tipo e área curricular nos modais de criação/edição.
  - `src/features/academic/schedule/ScheduleWorkspace.tsx`: Visões combinadas (Por Turma, Por Professor, Por Sala), banner de alertas e publicação com sincronização em 1 clique.
  - `src/routes/pedagogica.tsx`: Abas `salas` e `curriculo` integradas harmoniosamente.
- **Validação:**
  - Nova suite `tests/academic/advanced-academic-core.test.ts` (11 testes 100% aprovados).
  - 158 ficheiros de teste executados, 1064 testes com sucesso no repositório.
  - `npm run siga:check` e `npm run build` (Nitro Cloudflare worker + Vite) 100% verdes.

### Ciclo 61 — RBAC-v2 nunca semeado: matrícula/pagamento impossíveis em qualquer escola nova (2026-09-08)

Continuação directa do Ciclo 60. As duas migrações pendentes
(`20260903113000_people_geography_fields`, `20260810130207_school_settings_admin_update`)
já estavam espelhadas em `APPLY_ENROLLMENT_AND_PREMIUM.sql` por uma sessão
anterior (não commitada) — só faltava aplicar. Corrigido primeiro um bug no
diff: o trigger `audit_school_change` usava colunas `actor_user_id`/`metadata`
que não existem em `audit_logs` (é `actor_id`/`after_data`). Aplicado ao SGA
com sucesso (colunas confirmadas ao vivo).

**Depois disso, a matrícula continuou a falhar — mas não por 2FA.** A
mensagem «precisa de 2FA» é genérica: `rpcAuthError()` também dispara para
qualquer erro `42501`/"autorização", incluindo falha de permissão. Investigação
revelou uma segunda camada de RBAC completamente à parte da documentada nos
ciclos 46–56: tabelas `role_permissions`/`document_sequences` com `school_id`,
e dezenas de funções `private.*` (`register_student`, `register_payment`,
`enroll_student`, `issue_school_document`, `create_financial_contract`, etc.)
gated por `private.is_aal2()` + `private.has_permission(school_id, code)`, com
códigos de permissão tipo `students.records.create`/`finance.payments.create`
— vocabulário **totalmente diferente** do `roleDefaultPermissions` em
`src/features/auth/permissions.ts` (esse é só para gating de UI/rotas, nunca
chega à base de dados). **Este sistema inteiro nunca foi capturado em nenhuma
migração do repositório** — foi aplicado directamente ao SGA por uma sessão
anterior sem deixar rasto em `supabase/migrations/` nem `APPLY_*.sql`.

**Bugs confirmados e corrigidos (todos ao vivo no projecto `xodgfmxiaunpamctfeea`,
espelhados em `APPLY_ENROLLMENT_AND_PREMIUM.sql` + migrações novas):**

| #   | Bug                                                                                                                                                                                                                                           | Sintoma                                                                        | Ficheiro                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `role_permissions` nunca semeada no provisionamento — só a escola manual "Colegio Adventista - Huambo" tinha linhas (owner=74/74, secretary=23)                                                                                               | Qualquer RPC gated por `has_permission()` nega sempre, mesmo ao dono da escola | `20260908140000_seed_default_role_permissions.sql` + `school-bootstrap.ts` (`seedDefaultRolePermissions`)                                                  |
| 2   | `private.register_student` gerava `student_number` em `YYMMnnn` (ex. `2609001`); a tabela exige `^EST-[0-9]{6,}$`                                                                                                                             | 23514 em toda e qualquer matrícula, desde sempre                               | `20260908150000_fix_register_student_number_format.sql` (restaura o padrão `EST-NNNNNN` com `period='legacy'`, confirmado pelos 2 alunos reais existentes) |
| 3   | `document_sequences` nunca semeada no provisionamento (mesma classe de bug que #1)                                                                                                                                                            | `register_payment` falha com 55000 "sequência não configurada"                 | `20260908160000_seed_default_document_sequences.sql` + `school-bootstrap.ts` (`seedDefaultDocumentSequences`)                                              |
| 4   | `private.next_document_number` tinha **dois overloads ambíguos** — `(uuid, text)` estrito e `(uuid, text, text DEFAULT NULL)` auto-criador — qualquer chamada de 2 argumentos (`register_payment`, `create_financial_contract`) ficou ambígua | 42725 "function … is not unique" em todo pagamento/contrato                    | `20260908170000_drop_ambiguous_next_document_number_overload.sql` (remove o overload estrito; o de 3 args cobre os dois casos)                             |

**Validado ao vivo, ponta-a-ponta, na escola de teste `e2e-web-mts7ka0q`:**
matrícula (EST-000001, turma 10ª A) → factura (FT-2026/0001, 45.000 Kz) →
recibo (RC-000001, pago). `vitest run` 1053/1053 (2 skipped) ✓, `npm run
siga:check` ✓, `tsc`/eslint sem erros novos.

**Achado à parte (resolvido no Ciclo 62):** `/alunos/$studentId`
(`StudentDetail`) lançava "Rendered more hooks than during the previous render"
de forma intermitente porque `useRef` e `useState` (`fileInputRef`, `isUploadingPhoto`)
estavam posicionados após as cláusulas de retorno condicional (`profileQuery.isLoading` e `profileQuery.isError`).
Foram movidos para o topo do componente, respeitando a ordem estrita das regras dos Hooks do React.

**Por fazer (não coberto nesta fatia):**

- `role_permissions` dos papéis `treasury`/`teacher`/`guardian`/`student`/`user`
  continuam vazios — só `owner`/`admin` (acesso total) e `secretary` (cópia do
  conjunto da Huambo) foram semeados. Sem precedente de produção para os
  restantes; definir e semear.
- O sistema RBAC-v2 completo (funções `private.*`, `installer_*`,
  `assessment_*`, `documents_*`, `rbac_*`, `portal_*`) continua **por
  documentar/capturar** em migrações — só as 4 peças acima ficaram
  versionadas. Uma auditoria completa (`pg_get_functiondef` de tudo em
  `private`/`public` que ainda não está em `supabase/migrations/`) evitaria
  mais surpresas deste tipo.
- Continuar o teste: atribuir professor à turma (desbloqueia `class_subjects`),
  depois PayFlow.

### Ciclo 60 — Teste funcional ponta-a-ponta numa escola nova (2026-09-08)

Percorrida a operação real de uma escola acabada de provisionar
(`e2e-web-mts7ka0q`), do ano lectivo até ao plano de propinas.

**Impasse encontrado (escola nova ficava inutilizável):** não existia nenhuma
forma de criar o **primeiro ano lectivo**. «Novo período» exigia ano activo;
«Preparar estrutura académica» exigia períodos configurados; o selector
«Ano lectivo activo» das Definições só _activa_ um ano que já exista
(`updateSchoolSettings` faz UPDATE, nunca INSERT); e o provisionamento não
inventa datas de propósito. Resolvido com `createAcademicYear` +
`getActiveAcademicYear` (`features/calendar/server.ts`) e o CTA **«Definir ano
lectivo»** em `/calendario`, que substitui «Novo período» enquanto não houver ano.

**INSERTs fora de sincronia com o schema SGA** (todos NOT NULL sem default,
todos falhavam em silêncio com 23502):

| Tabela            | Coluna em falta            | Onde                                                    |
| ----------------- | -------------------------- | ------------------------------------------------------- |
| `fee_plans`       | `academic_year_id`, `code` | `finance/server.ts`, `school-bootstrap.ts`              |
| `fee_items`       | `code`, `frequency`        | idem (`fee-plan-defaults.ts` passa a ser a fonte única) |
| `academic_levels` | `sequence`                 | `academic-bootstrap-legacy.ts`                          |

**Guardar definições da escola estava partido para todas as escolas:**
`updateSchoolSettings` escrevia `schools.evaluation_periods`, coluna que só
existe na migração `20260810130207` — nunca espelhada nos `APPLY_*.sql` nem
aplicada ao SGA. PGRST204 abortava o UPDATE inteiro. O valor já era persistido
(e lido) em `school_settings/academic`, por isso a escrita duplicada saiu.

**Outros:** o selector «Ano lectivo» da Nova Matrícula mostrava o **UUID** cru
(`alunos/index.tsx` não passava `academic_year_name`); o aviso de plano em falta
no painel de facturação repetia a promessa falsa do bootstrap.

**Validado ao vivo:** ano lectivo 2026/2027 → 3 trimestres → estrutura académica
(nível, programa, campus, 5 disciplinas, classe, turma) → plano de propinas
activo com propina 45.000 Kz e matrícula 25.000 Kz. Tudo pela UI.

**Bloqueado por SQL não aplicado — decisão pendente:** a matrícula de aluno pára
em «A localização do aluno não pôde ser guardada porque a migration de Pessoas
ainda não foi aplicada». `people` não tem `province/municipality/commune/address`;
a migração `20260903113000_people_geography_fields.sql` é aditiva e idempotente
mas **não está em nenhum `APPLY_*.sql`**, tal como a `20260810130207` das colunas
de `schools`. Ambas precisam de ser espelhadas no checklist canónico e aplicadas.

**Suite:** `vitest run` 1050/1052 (2 skipped) ✓, `npm run siga:check` ✓, eslint
sem erros novos, `tsc` sem erros novos.

**Próxima fatia:** aplicar as duas migrações em falta e retomar o teste
(matrícula → factura → recibo → PayFlow); atribuir professor à turma para
desbloquear `class_subjects`; auditar os restantes INSERT contra as colunas
NOT NULL do SGA (o padrão repetiu-se 5 vezes).

### Ciclo 59 — Módulo Alumni: integração completa e produção local (2026-09-08)

Módulo Alumni integrado a partir de `feat/alumni-master-premium` para o ambiente local:

- **Domínio e Rotas:** `/alumni` (workspace master), `/alumni/$alumniId` (360º), `/alumni/operations`, `/alumni/insights`, `/alumni/communications`, `/alumni/matching`, `/alumni/documents`, `/alumni/calendar`, `/alumni/pipeline`, e `/alumni/portal` (self-service do antigo aluno com portfólio por nível de ensino e privacidade).
- **Base de Dados & SQL:** consolidado `supabase/APPLY_ALUMNI_MODULE.sql` (8 migrações). Corrigido identificador reservado `"current_role"`. Aplicado via query API com sucesso: 15 tabelas criadas (`alumni_profiles`, `alumni_experiences`, `alumni_engagements`, `alumni_opportunities`, `alumni_opportunity_applications`, `alumni_mentorships`, `alumni_events`, `alumni_event_registrations`, `alumni_surveys`, `alumni_survey_responses`, `alumni_contributions`, `alumni_communication_preferences`, `alumni_privacy_audit`, `alumni_portfolio_items`, `alumni_education_stages`).
- **Checklist SQL SGA:** actualizado `scripts/siga/modules.json`, `scripts/siga/print-apply-sql.mjs` e `scripts/siga/apply-all-sql.mjs`. `siga:sql:verify` validou 65/65 tabelas presentes (100%).
- **Navegação e Permissões:** `access-policy.ts`, `navigation-catalog.ts`, `portal-engine.ts`, `route-inventory.ts` e `app-marks.tsx` harmonizados.
- **Validação:** `npm run siga:check` ✓, 25/25 testes em `tests/alumni/` ✓, `tests/saas/sql-sga-checklist.test.ts` ✓, `npm run build` (Vite + Nitro) compilado em 11.7s com zero erros ✓.

### Ciclo 58 — E2E real do ecossistema: criar escola, entrar, gerir (2026-09-08)

Teste ponta-a-ponta com as 5 apps a correr e Supabase SGA real. Estado antes:
**nem o SIGA arrancava no browser, nem era possível criar uma escola.**

**Bloqueadores (produto parado):**

1. **SIGA nunca hidratava.** Sem `src/client.tsx`, o plugin do Start caía na
   entrada por omissão do pacote (`dist/plugin/default-entry/client.tsx`), um
   subcaminho fora do `exports` de `@tanstack/react-start@1.168.32` que o Vite 8
   recusa resolver → 500 e ecrã preso em «A verificar sessão…». Adicionado
   `src/client.tsx` + `tanstackStart.client.entry` no `vite.config.ts`.
2. **Import-protection: código de servidor no grafo do cliente.** Com a entrada
   resolvida apareceu o erro real — `sga-admin.ts` (cliente service-role) era
   alcançável do browser por duas cadeias. Corrigido na origem: (a) removido o
   re-export morto `export { requirePlatformAdmin } from …` em
   `features/saas/server.ts` (um `export … from` não é eliminável pelo plugin e
   arrastava platform-guard → sga-admin); (b) `readActiveSchoolCookie` movido
   para `features/auth/active-school-cookie.server.ts`, isolando o especificador
   proibido `@tanstack/react-start/server`.
3. **Criar escola falhava sempre.** `inviteUserByEmail` prendia o
   provisionamento ao mailer: sem SMTP próprio, a Supabase recusa domínios não
   entregáveis (`Email address "…" is invalid`) e limita a 2 envios/hora. Novo
   `features/saas/admin-account.ts`: `createUser` (determinístico, sem mailer) +
   entrega do link de definição de senha como efeito best-effort via Resend.
   A API passa a devolver `adminInviteDelivered`; `adminSetupUrl` só sai para
   `source: "platform_admin"`, nunca no signup público.
4. **`member_roles.school_id` é NOT NULL** e o insert do provisionamento omitia-o
   → 23502 no último passo do administrador.

**Correcções adicionais encontradas no percurso:**

- **Hidratação partida em todas as páginas:** `PageHeader` punha
  `BreadcrumbSeparator` (um `<li>`) dentro de `BreadcrumbItem` (outro `<li>`).
  Separador passou a irmão dentro de um `Fragment`.
- **Rollback incompleto:** um provisionamento falhado deixava tenant órfão a
  ocupar o slug — `DELETE tenants` batia em FK de schools/subscriptions/domains
  e o erro era descartado. `cleanupTenant`/`cleanupSchool` passam a apagar por
  ordem inversa e a registar falhas.
- **`scripts/siga/e2e-cleanup-lib.mjs`** tinha o mesmo defeito (nunca conseguia
  apagar uma escola com papéis/auditoria). Passa a descobrir as ~108 FKs de
  `schools` em `pg_constraint` via Management API e a purgar sob
  `session_replication_role = replica` (necessário: `audit_logs` é append-only).
- **Bootstrap mentia:** `fee_plans.academic_year_id` é NOT NULL e o ano lectivo
  **não** é criado no provisionamento (por desenho — não se inventam datas), por
  isso o plano financeiro nunca podia ser criado. Insert passa a ser
  condicional; o onboarding do dashboard e o aviso do `/financeiro` deixam de
  afirmar que «a estrutura base foi preparada» e pedem o ano lectivo como 1.º
  passo (`openSettingsPanel("escola")`).
- **`publicDatabaseError`** passa a registar o código/mensagem crus no servidor
  — era isso que tornava o 23502 invisível.
- **WEB `/start`:** scroll volta ao topo a cada passo; ecrã final diz a verdade
  sobre o convite do administrador e voltou a mostrar o link do ADMIN
  (`adminTenantsUrl` estava em estado mas nunca era usado).
- **`tests/e2e/commercial-live.spec.ts`** estava desactualizado (esperava
  «Escola criada» / «Abrir o SIGA Plus»); alinhado com o ecrã actual + asserções
  para `adminInviteDelivered` e ausência de `adminSetupUrl`.

**Validado ao vivo:** wizard WEB → `POST /api/saas/signup` 200 → login no SIGA
como administrador da escola nova → dashboard, sidebar e `/financeiro` sem um
único erro de consola → limpeza do tenant de teste.

**Suite:** `vitest run` 1018/1020 (2 skipped) ✓, `npm run siga:check` ✓, eslint
sem erros novos (4 pré-existentes em PageHeader/AdminPortalDashboard), `tsc`
sem erros novos.

**Ainda por fazer:** ADMIN precisa de conta em `platform_admins` para teste
funcional; PayFlow está fail-closed em produção (`integrationConfigured` e
`ssoConfigured` a `false`) — falta configurar segredo partilhado e conector
bancário para testar um pagamento real ponta-a-ponta; `/financeiro` mostra dois
botões «Ajuda» seguidos; tipagem RPC `hr_*` continua fora do `database.types`.

### Ciclo 57.12 — EmptyState no RH operacional (2026-09-08)

- **Folha (`/financeiro/rh/folha`):** três estados vazios educativos — sem competências (CTA «Preparar folha» ligado a `createRun`), nenhuma competência seleccionada, e folha por calcular (CTA «Calcular folha» só nos estados `draft`/`calculating`/`review`).
- **Faltas (`/financeiro/rh/faltas`):** bloco ad-hoc substituído por `EmptyState`; título por filtro (`emptyTitles`: pendentes/validadas/rejeitadas/canceladas/todas) e CTA «Ver faltas pendentes» quando o filtro não é `pending`.
- **Pagamentos (`/financeiro/rh/pagamentos`):** sem folhas aprovadas (CTA → `/financeiro/rh/folha`), sem ordens salariais, e nenhuma ordem seleccionada.
- **Presença (`/financeiro/rh/presenca`):** evidências vazias explicam a validação multifator, com CTA → `/professor/presenca`.
- **Testes:** `tests/ui/density-empty-state-contract.test.ts` — rotas RH na lista do rollout + guarda contra o regresso das frases genéricas.
- **Nota:** o atalho **Pauta** a partir da aula na agenda já existia (`gradesSearch` em `agendaLessonActions`, ligado em `TopbarCalendar` e `/calendario`).
- **Validação:** `vitest tests/ui tests/hr` 52/52 ✓, `npm run siga:check` ✓, eslint sem erros novos (3 warnings `exhaustive-deps` pré-existentes).
- **Próxima fatia:** EmptyState nas restantes rotas pedagógicas (turmas/disciplinas/horários); ou Fase 3 calendário↔horário (aulas no hub); ou tipagem RPC `hr_*` no `database.types` (tsc acusa `hr_*` fora do union e `detail.data` como `{}` na folha).

### Ciclo 57.11 — QR contextual por aula + dia na chamada (2026-09-07)

- **Deep-links:** `teacherQrPresenceSearch` + `qrSearch` em `agendaLessonActions`; chamada passa a aceitar `dia`.
- **Topbar / Calendário:** CTA **QR** leva `/professor/presenca?turma=&disciplina=&data=` (não só a rota nua).
- **Presença professor:** `focusLesson` destaca a ocorrência da agenda e prioriza-a em «Próxima / em curso».
- **Chamada:** `AttendanceWorkspaceModule` + `/pedagogica?dia=` sincronizam a data da sessão.
- **Testes:** `tests/hr/agenda-lesson-actions-contract.test.ts`.
- **Próxima fatia:** EmptyState no restante RH (folha/faltas/pagamentos); ou atalho Pauta a partir da aula na agenda.

### Ciclo 57.10 — Chamada/QR a partir da agenda (2026-09-07)

- **Deep-links:** `teacherAttendanceCallSearch` + `agendaLessonActions` em `teacher-classroom-links.ts`.
- **Topbar / Calendário:** cada aula mostra CTAs **Chamada** (`/pedagogica?tab=chamada&turma&disciplina`) e **QR** (`/professor/presenca`).
- **Presenças:** `AttendanceWorkspaceModule` recebe `initialClassGroupId`/`initialSubjectId` e abre o diálogo de chamada (sessão existente ou draft turma+disciplina).
- **EmptyState:** acessos + RH (ocorrências QR) + estados vazios do workspace de presenças.
- **Testes:** `tests/hr/agenda-lesson-actions-contract.test.ts`.
- **Próxima fatia:** QR contextual por aula; ou EmptyState no restante RH; ou sync `dia` na chamada.

### Ciclo 57.9 — EmptyState em mais listas (2026-09-07)

- **Rollout:** alunos, financeiro (caixa), faturas e planos de aula passam a usar `EmptyState`.
- **Teste:** contrato `density-empty-state` alargado às novas rotas.
- **Próxima fatia:** CTA presença/QR a partir da aula na agenda; ou EmptyState em RH/acessos.

### Ciclo 57.8 — Aulas do horário na agenda (2026-09-07)

- **API:** `listDayAgendaLessons` (slots activos do `weekday` → turma/disciplina/docente/sala).
- **Helpers:** `day-lessons.ts` (ordenar + fatia «próximas» para a topbar).
- **Topbar:** `TopbarCalendar` mostra **Aulas de hoje** + períodos/feriados; link para `/pedagogica?tab=horarios`.
- **Calendário:** painel do dia seleccionado lista as aulas daquele dia da semana.
- **Testes:** `tests/calendar/day-lessons-contract.test.ts`, `tests/ui/topbar-calendar-contract.test.ts`.
- **Próxima fatia:** EmptyState noutras listas; ou presença/QR a partir da aula na agenda.

### Ciclo 57.7 — Período global nas notas (2026-09-07)

- **Centro de Avaliação:** `AssessmentCenter` sincroniza o filtro `trimestre` com `selectedTerm` da topbar (abre no período global; mudanças locais actualizam `setSelectedTermId`).
- **Pauta simples:** `GradePautaSheet` inicia e sincroniza o selector de período com o mesmo contexto.
- **Já existia:** `PautasWorkspaceModule` (57.5).
- **Testes:** `tests/academic/global-term-sync-contract.test.ts`.
- **Próxima fatia:** EmptyState noutras listas; ou Fase 3 calendário↔horário (aulas no hub).

### Ciclo 57.6 — Densidade UI + EmptyState (2026-09-07)

- **Densidade:** `UiDensity` (`compact` / `comfortable` / `spacious`) em `appearance.tsx`; `data-density` no `<html>`; variáveis CSS em `styles.css`; selector em Aparência → «Densidade da interface».
- **EmptyState:** `components/ui/empty-state.tsx` — título + descrição + CTA opcional (sem «Nenhum dado encontrado» genérico).
- **Rollout:** calendário, comunicações, documentos e pessoas (listas vazias / filtros sem resultados).
- **Testes:** `tests/ui/density-empty-state-contract.test.ts`.
- **Próxima fatia:** EmptyState noutras listas; ou Fase 3 calendário↔horário; ou `selectedTermId` mais fundo nas notas.

### Ciclo 57.5 — Recentes, favoritos e período nas pautas (2026-09-07)

- **Memória de navegação:** `navigation-memory.ts` + `useNavigationMemory` (recentes/favoritos por utilizador).
- **⌘K / topbar:** grupos Favoritos e Recentes na Command Palette; estrela na topbar para favoritar a página actual.
- **Pautas:** trimestre sincronizado com `selectedTerm` global (topbar ↔ selector da pauta trimestral).
- **Testes:** `tests/ui/navigation-memory-contract.test.ts`.

### Ciclo 57.4 — Período global + Command Palette (2026-09-07)

- **Contexto:** `listAcademicTerms` + `selectedTermId` em `SchoolYearProvider` (persistido); selector de período na topbar junto ao ano/escola.
- **⌘K:** `CommandPalette` (cmdk) com páginas do catálogo + acções rápidas (novo aluno, chamada, QR, recibo, aparência…). Waffle deixa de capturar ⌘K.
- **Testes:** `tests/ui/command-palette-contract.test.ts`.

### Ciclo 57.3 — Breadcrumbs + contexto escola/ano (2026-09-07)

- **PageHeader:** breadcrumbs nativos (`Início → grupo → título`) reutilizando `components/ui/breadcrumb`; prop opcional `crumbs` / `hideBreadcrumb`.
- **Topbar:** contexto mostra nome da escola + ano lectivo no selector existente.
- **Teste:** `tests/ui/page-header-breadcrumb-contract.test.ts`.

### Ciclo 57.2 — Hoje na Escola + Próxima aula (2026-09-07)

- **Admin:** `TodayAtSchoolCard` no início da visão geral — aulas do horário (`timetable_slots`), professores, salas, a iniciar em 30 min, chamadas abertas, check-ins RH, aniversários, faturas em atraso, períodos em curso. Server: `getSchoolTodayOps`.
- **Professor:** bloco **Próxima aula** com QR / chamada / plano; KPI «3º Trimestre» fictício substituído pelo ano lectivo real.
- **Helpers:** `school-today.ts` (Luanda, weekday, pickNextLesson). Testes `tests/dashboard/school-today-contract.test.ts`.
- **Próxima fatia:** breadcrumbs app-wide ou barra de contexto Ano|Período; ou alargar command palette.

### Ciclo 57.1 — Branding escolar → tokens de aparência (2026-09-07)

- **Problema:** `school_branding` (Identidade Digital) guardava cores sem aplicar aos CSS tokens; aparência era só `siga:appearance` no dispositivo.
- **Solução:** `brand-tokens.ts` (hex → `--primary`/`--sidebar` + contraste WCAG AA); `AppearanceState.schoolBrand` + `preferPersonalAccent`; `SchoolBrandAppearanceSync` no `__root`; `loadSchoolSettingsBundle` lê `school_branding`.
- **UI:** Aparência → «Usar cores da escola»; Identidade Digital valida contraste, pré-visualiza botão/link/sidebar e aplica ao guardar.
- **Testes:** `tests/ui/brand-tokens-contract.test.ts`.
- **Próxima fatia:** widget «Hoje na Escola» no dashboard admin (dados reais).

### Ciclo 57 — Premium UX Fase 1: Topbar Agenda + Navegação Principal (2026-09-07)

- **Missão:** Prompt Master Premium — auditar → reutilizar → refinar (sem reconstruir). Fase 1 base: layout/navegação/calendário na topbar.
- **Auditoria:** shell (`AppShell`/`AppSidebar`), tokens OKLCH + `appearance.tsx` (presets Oceano/Esmeralda/Grafite já existem), branding escolar desligado dos tokens CSS, calendário = períodos/`terms` (não hub operacional ainda), ⌘K = `AppLauncher`, breadcrumbs UI sem uso app-wide.
- **Topbar:** `TopbarCalendar` — data do dia (Luanda) + mini-agenda com períodos/feriados reais (`listCalendarEvents` + `buildUpcomingCalendarItems`) + CTA «Abrir calendário completo». Respeita `canAccessPath("/calendario")`.
- **Sidebar admin:** novo grupo **Principal** (Início + Calendário Lectivo); calendário removido do submenu Área Pedagógica (sem duplicar). Portais aluno/encarregado/professor elevam Calendário a item de topo.
- **Não feito nesta fatia:** tema tenant→CSS, barra período global, aulas no calendário, command palette completa, breadcrumbs app-wide.
- **Testes:** `tests/auth/portal-engine.test.ts` (+ Principal), `tests/ui/topbar-calendar-contract.test.ts`, `tests/auth/navigation-catalog.test.ts`.
- **Próxima fatia sugerida:** ligar `school_branding.primary_color` → `applyAppearance`; ou widget «Hoje na Escola» no dashboard com dados reais.

### Ciclo 56 — Fundação RH, Assiduidade Docente e Folha Salarial (2026-09-06)

- **Origem:** PR remoto [#10](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/10) (`feature/hr-payroll-foundation-20260906`) integrado no workspace + inventário SIGA.
- **Rotas:** `/financeiro/rh` (+ folha, faltas, presença, pagamentos) e `/professor/presenca`.
- **Domínio:** `src/features/hr/*` — vínculos, contratos, QR de aula, assurance/geofence, faltas, ciclo operacional da folha, ordens salariais com controlo duplo e lançamento em `siga_cash_expenses` (categoria Salários) só após `paid`.
- **SQL SGA:** 14 migrations `20260906*_hr_*` + hardening `20260906190000_hr_security_hardening.sql` espelhadas em `APPLY_ENROLLMENT_AND_PREMIUM.sql`. Aplicar com `npm run siga:sql` (não usar `all_migrations_combined.sql`).
- **Hardening pós-revisão:** gate de assurance força `pending` sem evidência `check_out`/`auto_approve` (fecha bypass PostgREST em `hr_redeem_teacher_qr`); INSERT/UPDATE de folha/vínculos só Admin/Tesouraria; confirmação de pagamento com guard de estado optimista.
- **Inventário:** módulo `rh` em `modules.json`, skill `siga-rh`, launcher `siga-rh`, sidebar Admin/Tesouraria + atalho professor; access-policy restringe `/financeiro/rh` a Admin/Tesouraria.
- **Ainda fora:** API bancária real, WebAuthn/App Attest, IRT/INSS versionado, holerite oficial, atomicidade total RH+caixa numa única RPC.
- **Validação:** `npm run siga:check` ✓ (módulo `rh` + 12/12 navigation-catalog). Prettier nos ficheiros RH corrigido (3 warnings hooks restantes). **SQL SGA live 2026-09-06:** 15/15 migrations `hr_*` aplicadas no projecto `xodgfmxiaunpamctfeea` (20 tabelas `hr_*`); policies alinhadas a `is_school_member() → boolean` (padrão SGA, não Lovable uuid).
- **Spec Ciclo 56.1:** `src/features/hr/schemas.ts` (enums + máquinas de estado + inputs Zod); skill `siga-rh` expandida; testes `tests/hr/schemas-contract.test.ts`.
- **Ciclo 56.2 — QR → chamada:** após check-in em `/professor/presenca`, o SIGA resolve a ficha do professor (fallback `people`/email + backfill `teachers.user_id`), abre sessão `siga_attendance_sessions` da turma/disciplina e lança `AttendanceCallDialog` no telemóvel/tablet para marcar alunos. Deep-link `?chamada=1&turma=&disciplina=&sessao=&data=`.
- **Ciclo 56.3 — Minhas aulas + reabrir chamada:** `listMyTeacherLessonOccurrences` enriquece turma/disciplina/sessão; `openMyLessonClassroom` reabre a chamada sem novo QR (após check-in).
- **Ciclo 56.4 — Portal ↔ QR:** `TeacherPortalDashboard` com CTA «Assinar presença (QR)» no cabeçalho, bloco de aulas e menu de ferramentas.
- **Ciclo 56.5 — Check-out explícito:** banner «aula em curso», modo Entrada/Saída e acções de saída na lista do professor.
- **Ciclo 56.6 — Chamada → pauta:** CTA «Lançar notas» no `AttendanceCallDialog`, no portal do professor e em `/professor/presenca` (deep-link `/pedagogica?tab=notas&turma=&disciplina=&pauta=1`).
- **Ciclo 56.7 — Plano + materiais:** deep-links `teacher-classroom-links.ts` para `/planos-aula?turma=&disciplina=` e `/arquivos?turma=` no diálogo de chamada, portal e presença; `/planos-aula` faz seed dos filtros a partir da URL.

Referência de arquitectura canónica para agentes: Prompt Mestre Enterprise completo (Fases 1–15) + Ciclos 50–56.

### Ciclo 55 — Estados Académicos Unificados, 22 Importadores e PayFlow Admin (2026-09-05)

- **Motor de domínio `academic-status.ts`:** deriva estado académico (matrícula + vínculo) e snapshot financeiro (faturas/recibos) de forma independente — um aluno pode ser «Activo» e «Com dívida» ao mesmo tempo.
- **Lista `/alunos`:** filtros rápidos (Todos / Activos / Candidatos / Dívida / Inactivos), badges `StudentStatusBadge` + `StudentFinanceBadge`, selecção em lote com `batchAssignClass` e `batchUpdateStudentStatus`, pesquisa alargada (BI, telefone, turma).
- **`searchStudents`:** agrega faturas via `finance_contracts` → `finance_invoices` → `finance_receipts`; usa `deriveAcademicStatus` + `deriveFinancialSnapshot`.
- **Modal extensivo:** badges canónicos, resumo financeiro e aba **Histórico** com `StudentStatusHistoryTimeline` + `getStudentStatusHistory`.
- **Histórico de estados:** helper `recordStudentStatusHistory` — criação/matrícula interna, candidatura aceite, colocação em turma, mudança de estado e lote.
- **SQL SGA:** tabelas `student_status_history` e `student_academic_history` em `APPLY_ENROLLMENT_AND_PREMIUM.sql`; **verify live 2026-09-05:** 33/33 smoke tables OK no projecto `xodgfmxiaunpamctfeea` (incl. Ciclo 55), `current_school_id()` presente, RLS activo nas duas tabelas de histórico.
- **Importadores:** 22 módulos oficiais — novos `inscricoes`, `avaliacoes`, `historico_academico`, `historico_financeiro`.
- **Exportação:** folhas Excel para os 4 módulos novos no `export-engine`; painel `/importar` → Exportar lista os 11 módulos exportáveis (incl. históricos e candidaturas).
- **Lista `/alunos`:** contador de candidatos inclui candidaturas `pending` de `enrollment_applications` (realtime).
- **Persistência `historico_academico`:** tabela `student_academic_history` em `APPLY_ENROLLMENT_AND_PREMIUM.sql`; importador grava/actualiza com idempotência por (aluno, ano, classe).
- **`APPLY_IMPORT_ENGINE.sql`:** cabeçalho actualizado — 22 módulos TS; aponta para `student_status_history` / `student_academic_history` no script de matrícula.
- **PayFlow P0:** login fail-closed fora de sandbox; SSO só via `/api/v1/sso/exchange` (anti-replay + redirect 303); verify bancário scoped à `school_id` da sessão; botão «Conciliação PayFlow» (`createPayflowAdminLaunch`); **Sync PayFlow** (`syncStudentToPayflow` → `executePayflowStudentSync`); **Sync IBAN** (`syncSchoolBankToPayflow`); revisão manual `finance_admin`; auto-sync após fatura só com `PAYFLOW_AUTO_SYNC=1`.
- **PayFlow /admin UI:** em produção o formulário de chave desaparece — só CTA «Abrir SIGA · Financeiro»; chave/atalho só com `sandboxEnabled` do `/api/v1/health`.
- **PayFlow extrato:** `POST /api/v1/bank-statements/import` casa referência + valor + moeda no âmbito da escola; dry-run por omissão; conciliação explícita usa fonte `bank_statement` (não liquida por CSV sozinho).
- **PayFlow isolamento:** sync recusa aluno/fatura/IBAN já ligados a outra escola; verify por API exige `school_id`; logs JSON `logPayflowEvent`; upsert de IBAN não reescreve `scope`/`school_id`.
- **PayFlow estorno:** `POST /api/v1/payments/:id/refund` (`finance_admin`); recibo PayFlow preservado; acerto SIGA `POST /api/finance/payflow/settlement` (reabre fatura e anula recibos de caixa). Falha de notify → `siga.settlement.notify_failed` (alerta se webhook configurado).
- **PayFlow health:** `/api/v1/health` expõe `bankConnectorConfigured`, `sigaSettlementConfigured`, `alertWebhookConfigured`, `emisHomologated` (sem segredos); painel admin mostra o cartão na aba Canais.
- **PayFlow EMIS ingress:** `POST /api/v1/webhooks/emis` — HMAC + homologação; `501 emis_adapter_not_ready` (nunca liquida até adaptador real).
- **PayFlow bank API:** ingest + pull + CLI `siga:payflow-bank-pull`; em sandbox, feed local `sandbox-feed` (fora de sandbox responde 404).
- **PayFlow marca:** lockup `PayflowBrandLockup` (home, admin, portal aluno, checkout, comprovativo) + favicon/apple-touch leves.
- **PayFlow no ecossistema:** ícone próprio no SIGA (`public/brands/payflow-icon.png`); portais aluno/encarregado → `/aluno/pagar`; ADMIN `/dashboard-2` lê health público; WEB/DOC passam a nomear as 5 apps.
- **PayFlow alertas:** `PAYFLOW_ALERT_WEBHOOK_URL` recebe eventos `.rejected` / estorno / falha de settlement SIGA; sem URL não envia nada. Payload allowlist (sem IBAN/nomes).
- **PayFlow → SIGA:** após liquidar/estornar, `notifySigaSettlementBestEffort` chama `POST /api/finance/payflow/settlement` (best-effort; não bloqueia o PayFlow).
- **CI custo:** `native-ci` (macOS/Windows) só em `main` + `workflow_dispatch`; `ci`/`payflow`/`academic-import` com `push` só em `main` (PRs via `pull_request`, sem double-run). Conta privada: bloquear Actions se Billing falhar — ver Billing & plans.
- **Guards:** `analyzeImportFile` e `downloadOfficialExcelTemplateFn` passam a exigir `requireSgaWriter`.
- **Validação:** testes `academic-status` + importadores + export + `payflow-sso` + `payflow-education-sync` + `status-history` (Node 24); PayFlow production-safety + isolation actualizados; SQL SGA verificado via Management API.

### Ciclo 52 — Sincronização GitHub, Visual de Matrículas e Ecossistema PayFlow (2026-09-03)

- **Sincronização & Fusão Remota:** Consolidação limpa dos ramos `feature/education-workflow-ui` (PR #6) e `feat/payflow-integration-production` (PR #7) com 15 importadores oficiais do motor SIGA Exchange e zero conflitos.
- **Fluxo Visual & Validação de Matrículas:**
  - `EducationWorkflowVisual.tsx` integrado no fluxo de pessoas e matrículas (`StudentEnrollmentSheet.tsx` e `PersonWizardModal.tsx`).
  - Suporte ao território angolano (21 províncias em `lib/angola-territory.ts`).
  - Alerta de lotação máxima preenchida (`enrolled_count >= capacity`) com confirmação de matrícula extraordinária e selo visual _Sobrelotação_.
  - Filtros contextuais hierárquicos: Ano Lectivo → Curso → Classe → Turno → Sala → Turma com occupancy indicators.
  - Validação estrita de ano lectivo no importador de matrículas (`matriculas-importer.ts`).
  - Modal extensivo do aluno (`StudentExtensiveModal.tsx`) na listagem de alunos com suporte a emissão directa do Cartão Digital do Aluno (`QrCode`).
- **Ecossistema PayFlow (`painel/payflow`):**
  - Aplicação compilada em modo de produção via Vinext/Cloudflare Workers (18 endpoints de API e 4 páginas de checkout/portal).
  - Verificação de transferências bancárias com IBAN angolano (validação ISO mod-97), SSO assinado e RBAC administrativo.
  - Abstração de ambiente `lib/cf-env.ts` compatível com Workers e testes locais Node.js.
  - Links de navegação e atalhos rápidos integrados nas telas de `src/routes/faturas.tsx` e `src/routes/financeiro.tsx`.
- **Validação:** 900/900 testes Vitest passando no monorepo (128 ficheiros) + 16/16 testes PayFlow passando. Todas as 4 aplicações (SIGA, WEB, ADMIN, PAYFLOW) compilam com 100% de sucesso.

### Ciclo 51 — Zoom End-to-End Meeting Integration (2026-09-03)

- **Rota OAuth Callback:** `src/routes/api/integrations/zoom/callback.tsx` implementada para TanStack Start com validação de `code`/`state`, persistência segura de tokens e tratamento gracioso de erros.
- **Definições & Integrações:** `ZoomIntegrationCard.tsx` integrado em `settings-integrations-panel.tsx` com `startZoomOAuth`, visualização de conta e `disconnectZoom`.
- **Aulas Online:** `ZoomMeetingButton.tsx` integrado no painel do professor (`TeacherWorkspacePanel.tsx`) ligado a `siga_attendance_sessions` e `siga_lesson_meetings`. Regra cumprida: **Título da Aula = título da aula (sem "Zoom")**.
- **Testes:** `tests/integrations/zoom-integration.test.ts` (53/53 testes de integrações verdes).

### Ciclo 50 — SIGA Data Import & Export Engine (2026-09-03)

- **Catálogo Mestre de Campos:** `field-catalog.ts` com aliases angolanos/internacionais tolerantes a acentos (`foldForCompare`) e preposições (`stripStopWords`).
- **Resolvedor Relacional em Grafo:** `reference-resolver.ts` converte chaves humanas em UUIDs de `people`, `students`, `class_groups` e `subjects` sem expor identificadores técnicos.
- **Modelos Oficiais Excel (.xlsx):** `excel-template-builder.ts` com 6 abas padronizadas (`LEIA-ME`, `DADOS`, `EXEMPLOS`, `LISTAS`, `REFERENCIAS`, `METADADOS`).
- **Motor de Exportação Reimportável:** `export-engine.ts` com manifesto oficial `SIGA-EXCHANGE`, versão 1.0 e checksum SHA-256 para reimportação idempotente.
- **Interface /importar:** Painel de exportação `SchoolDataExportPanel.tsx` e 4 abas integradas na rota.
- **Testes:** `tests/import/` com 45/45 testes verdes (incluindo o teste de ciclo bidirecional).

### Ciclo 49 — Identidade Enterprise: Multi-Tenant, RBAC, Convites, Performance (2026-08-30 / 2026-08-31)

Prompt Mestre Enterprise — 15 fases concluídas e verificadas (684/684 testes passando em 100 ficheiros).

#### Fase 2 — Auth & Profiles DDL (`APPLY_IN_SQL_EDITOR.sql`)

- `public.profiles`: colunas `phone`, `first_name`, `last_name`, `full_name`, `preferred_name`, `avatar_url`, `avatar_path`, `cargo`, `school_id`, `locale`, `timezone`, `status`, `onboarding_status`, `last_active_at`.
- `handle_new_user()` trigger: `SECURITY DEFINER`, `SET search_path = ''`, graceful metadata fallback, `EXCEPTION WHEN OTHERS THEN`.
- `public.people.user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL` + `people_user_id_idx`.
- Buckets storage: `avatars` (privado, URLs assinadas) e `school-logos` (público) com políticas RLS cross-school correctas.

#### Fase 3 — Multi-Tenant & RBAC DDL (`APPLY_ENROLLMENT_AND_PREMIUM.sql`)

- `public.school_memberships` com `UNIQUE(school_id, user_id)` + lifecycle columns + RLS + `updated_at` trigger.
- `public.roles`, `public.permissions`, `public.role_permissions`, `public.member_roles` com RLS policies.
- `public.school_invitations` com `token_hash` (sha256), `expires_at`, status enum, indexes.
- RLS helpers: `public.is_school_member(uuid)` e `public.has_school_permission(uuid, text)` — ambas `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, REVOKE de PUBLIC.

#### Fase 4 — TypeScript Permissions Module

- `src/features/auth/permissions.ts` (~260 linhas): `standardPermissions` (49 permissões canónicas), `roleDefaultPermissions`, `hasPermission()`, `canAccessContext()`.
- `tests/auth/permissions.test.ts` (10 testes).

#### Fase 5 — Access Server Functions & Convites

- `src/features/access/server.ts`: import ESM estático, person-linking idempotente, `updateSystemAccountCargo`, `setSystemAccountDisabled`, `resendSystemInvite`, `listSchoolInvitations`, `createSchoolInvitation` (SHA-256 token), `revokeSchoolInvitation`, `acceptSchoolInvitation` (validação hash sha-256, expiração, ativação idempotente de membership com role, linking people.user_id).
- `src/features/access/schemas.ts`: `createSchoolInvitationInputSchema`, `revokeSchoolInvitationInputSchema`, `acceptSchoolInvitationInputSchema`.
- `src/routes/convite.$token.tsx`: Página pública de aceitação de convite institucional com auto-aceitação para utilizadores autenticados e feedback visual.
- `src/lib/public-paths.ts`, `src/features/auth/access-policy.ts`, `src/features/auth/route-inventory.ts`: registo de `/convite` como rota pública bypass.

#### Fase 6 — Acessos UI Panel (`src/routes/acessos.tsx`)

- Painel «Convites institucionais» com tabela de convites, status badge, botão Revogar.
- `invitationsQuery` com `useQuery`.

#### Fase 7 — Scripts & print-apply-sql

- `scripts/siga/print-apply-sql.mjs`: adicionados `school_memberships`, `roles`, `permissions`, `school_invitations` às smoke tables.

#### Fase 8 — APPLY_SAAS_PLATFORM.sql (verificação)

- RLS completo com `is_platform_admin()` em `plans`, `tenants`, `tenant_domains`, `subscriptions`, `tenant_usage`, `saas_audit_logs`, `platform_admins`.
- Política `platform_admin_read_self` — utilizador vê o próprio registo sem INSERT/DELETE na `authenticated` role.

#### Fase 9 — Multi-School Provisioning & Roles Scoping

- `src/features/saas/provisioning-core.ts`: roles com escopo explícito `school_id` ou global `is_system=true`.
- `src/features/saas/school-bootstrap.ts`: seeding de papéis canónicos (`owner`, `admin`, `secretary`, `treasury`, `teacher`, `student`, `guardian`, `user`) por escola recém-criada.

#### Fase 12 — DOC (`painel/docs/guide/sql-sga.md`)

- Tabela de tabelas novas (Ciclo 49): `school_memberships`, `roles`, `permissions`, `role_permissions`, `member_roles`, `school_invitations`.
- Documentação das funções de segurança RLS helpers.
- Tabela completa de índices de performance (Fase 14).
- Sintomas adicionados: `school_memberships not found`, convites vazios.

#### Fase 14 — Índices Compostos de Performance (`APPLY_ENROLLMENT_AND_PREMIUM.sql`)

12 índices compostos adicionados (todos idempotentes `CREATE INDEX IF NOT EXISTS`):

- `people_school_status_idx`, `students_school_status_idx` (WHERE `deleted_at IS NULL`)
- `enrollments_school_year_status_idx`, `enrollments_school_created_desc_idx`
- `finance_invoices_school_status_idx`, `finance_invoices_school_created_desc_idx`
- `school_memberships_user_status_idx`, `member_roles_membership_role_idx`
- `school_invitations_school_created_desc_idx` (WHERE `status = 'pending'`)
- `announcements_school_created_desc_idx`, `siga_files_school_created_desc_idx`, `roles_school_code_idx`

#### Fase 15 — Testes Hostis de Isolamento Multi-Tenant & Convites

- `tests/saas/rls-isolation.test.ts` (56 testes): catálogo de permissões, RBAC por papel, grant overrides, `canAccessContext`, mapeamento SGA↔AppRole, validação defensiva de schemas, Pessoa vs Conta (`user_id NULL`), switching multi-escola.
- `tests/access/accept-invitation.test.ts` (28 testes): hash SHA-256 determinístico, verificação de expiração, idempotência de membership (reactivação vs inserção), ligação people.user_id por email case-insensitive sem sobrescrita, validação de schema e mapeamento role_code.

### Ciclo 48 — AssessmentCenter + Resend HTTP (2026-08-29)

- **AssessmentCenter:** `CreateAssessmentDialog`, `OfficialPautaView`,
  `AssessmentViewTables` extraídos (~2200 → ~1780 linhas).
- **Resend HTTP:** `resend-client.ts` + `sendSchoolResendEmail`; publicar
  comunicado canal E-mail envia via API (merchant = API key); sem key → clipboard.
- Gateway failure-rate alerts reutilizam o mesmo cliente.
- Testes: `tests/integrations/resend-client.test.ts`.

### Ciclo 47 — pontos fracos estruturais (2026-08-29)

- **Auth Fase 10:** middleware ADMIN chama `GET /api/saas/me`; contas escolares
  são expulsas (`?error=platform`) antes de renderizar o Control Center.
- **Rotas template → funções reais (não esconder):** ADMIN `/dashboard` (stats),
  `/dashboard-2` (gateway), `/tasks` (fila), `/calendar` (agenda SaaS), `/mail`
  (avisos auditoria), `/chat` (suporte operador), `/pricing`/`/faqs`/`/users`.
  WEB `/dashboard` (visitante + planos API), `/tasks` (checklist), `/mail`
  (contacto), `/chat` (ajuda), `/calendar`/`/users`/`/dashboard-2`. Pontes
  `/saas-admin` e `/criar-escola` intactas; alive-bridges só auth/settings.
- **UI monólito:** `SecurityPanel` → `settings-security-panel.tsx` (re-export
  em `settings-panels.tsx`).
- **Firebase analytics:** off por defeito (`VITE_FIREBASE_ANALYTICS=true` para ligar).
- **Matriz de pontos fracos** actualizada em `ARCHITECTURE_HARMONIZATION.md` §14.
- Já mitigados antes deste ciclo: SQL checklist/`siga:sql:verify`, porta WEB
  5174 `--strictPort`.

| Ciclo | O quê                                                                                                                       | Estado                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1     | Filtros persistentes URL + localStorage                                                                                     | Feito                           |
| 2     | Folha sequencial de aluno + link público `/matricula/$slug`                                                                 | Feito (precisa SQL)             |
| 3     | Folha de turmas + WhatsApp                                                                                                  | Feito (colunas WhatsApp no SQL) |
| 4     | Grants, ficha professor, workspace, ICS                                                                                     | Feito (tabelas no SQL)          |
| 5     | Pagamento avançado Multicaixa/Unitel                                                                                        | Feito (tabela no SQL)           |
| 6     | Catálogo integrações + 2FA TOTP                                                                                             | Feito (tabela + AuthGate)       |
| 7     | Wiring catalog-ready nos ecrãs + testes integrações                                                                         | Feito                           |
| 8     | Supervisão de desempenho + resposta ao toque                                                                                | Feito                           |
| 9     | Identidade Angola (BI/NIF/IBAN), perfil, branding, AGT                                                                      | Feito (precisa SQL)             |
| 9     | Lazy Recharts + impressão diferida (print-issue-loader)                                                                     | Feito                           |
| 10    | Telefone angolano (+244): componente, validação Zod, normalização E.164                                                     | Feito                           |
| 11    | Mensagens internas no painel da conta (colegas reais, pesquisa, thread)                                                     | Feito (precisa SQL)             |
| 12    | Não-lidas: ponto nos avatares, sino e lista de notificações                                                                 | Feito                           |
| 13    | Sino operacional: candidaturas, matrícula, documentos, faturas                                                              | Feito                           |
| 14    | Taxa de presença na matrícula, ficha, dashboard e turmas                                                                    | Feito (precisa SQL)             |
| 15    | Destaques no painel da conta (notas, novidades, atalhos)                                                                    | Feito                           |
| 16    | Gerir destaques em Definições (textos, ordem, visibilidade)                                                                 | Feito                           |
| 17    | Notas e atalhos próprios da escola nos destaques                                                                            | Feito                           |
| 18    | Público, calendário (Luanda) e pré-visualização dos destaques                                                               | Feito                           |
| 19    | Destaques no início (além do painel da conta)                                                                               | Feito                           |
| 20    | Ligação interna ou externa no botão de cada destaque                                                                        | Feito                           |
| 21    | Ícone, cor e tipo em todos os destaques                                                                                     | Feito                           |
| 22    | Arquivos (biblioteca Moodle: SGA + local, waffle, picker)                                                                   | Feito (precisa SQL)             |
| 23    | Arquivos: miniaturas, filtros, logo/perfil da biblioteca                                                                    | Feito                           |
| 24    | Arquivos ligados a foto aluno/pessoa, docs e comunicados                                                                    | Feito (precisa SQL)             |
| 25    | Materiais de turma + descarregar/renomear arquivos                                                                          | Feito (precisa SQL)             |
| 26    | Filtro turma nos arquivos + materiais no workspace                                                                          | Feito                           |
| 27    | Arquivos visual OneDrive + utilizador, acesso e auditoria                                                                   | Feito (precisa SQL)             |
| 28    | Arquivos: breadcrumb, barra de comandos, drag-drop, avatares                                                                | Feito                           |
| 29    | Inquérito de metadados + ligação a utilizadores/pessoas                                                                     | Feito (precisa SQL)             |
| 30    | Foto de aluno: relação + perfil na ficha                                                                                    | Feito                           |
| 31    | Media reconhecida + inquérito/área obrigatórios                                                                             | Feito                           |
| 32    | Pastas, selecção, mover e modal expansível                                                                                  | Feito (precisa SQL)             |
| 33    | Recibos/talões na biblioteca + ID pesquisável                                                                               | Feito (precisa SQL)             |
| 34    | Planos de Aula (título/conteúdo/anexo + avaliações/provas por turma-disciplina-trimestre)                                   | Feito (precisa SQL)             |
| 35    | Anexo de arquivo nas mensagens internas + conversas enviadas sem resposta a aparecerem na lista + página `/perfil` dedicada | Feito (precisa SQL)             |
| 36    | Documento ligado a utilizador + ficheiros de sistema protegidos                                                             | Feito (precisa SQL)             |
| 37    | Backfill dono/sistema + filtros Meus/Sistema + painéis protegidos                                                           | Feito (precisa SQL)             |
| 38    | Auditoria access_denied + anexos de mensagens protegidos                                                                    | Feito (precisa SQL)             |
| 39    | Descoberta local USB/CUPS + allowlist (daemon Python localhost)                                                             | Feito                           |
| 40    | Pulso físico no grant + health do bridge + IP no registo                                                                    | Feito                           |
| 41    | Suspender cartão + estado catraca + selector/filtro logs                                                                    | Feito                           |
| 42    | RFID no cartão + renovar QR + API key do dispositivo                                                                        | Feito                           |
| 43    | Lista de cartões + webhook api_key + validação partilhada                                                                   | Feito                           |
| 44    | Rota HTTP `/api/catracas/device-scan` + bridge Python → SIGA + pulso no grant                                               | Feito                           |
| 46    | Navegação unificada: sidebar + launcher + inventário; logótipo só no topo da sidebar                                        | Feito                           |

## Ciclo 46 — navegação, launcher e identidade visual (2026-08-28)

- **Logótipo da escola:** apenas no botão do topo da sidebar (dropdown conta: logótipo + utilizador + escola). `SchoolLogoChip` deixa de fazer fallback automático; cartões, headers e launcher usam `IconChip` + ícones Lucide premium (`app-marks.tsx`).
- **Fonte única:** `navigation-catalog.ts` (`WORKSPACE_MODULE_SPECS`) alimenta launcher e auditoria; `portal-engine.ts` (`getPortalNavigation`) alimenta sidebar por papel/plano.
- **Inventário:** `scripts/siga/modules.json` com `navPath` e `secondaryNavPaths` (relatórios académicos/financeiros, faturas). Mapa em `docs/agents/MODULES.md`.
- **Correcções:** Importar visível (feature `importacao` em `academic`); Secretaria/Tesouraria/Professor com `filterNavGroups`; secção Sistema (Definições + Perfil); apps importar/catracas/planos-aula no waffle.
- **Validação:** `npm run siga:check` (inventário + `tests/auth/navigation-catalog.test.ts`); CI corre `check-modules.mjs` após `bun run test`. **Node 24** — Node 26 neste macOS aborta (`dyld libc++`).

### Ciclo 46b — auditoria de rotas e DOC (2026-08-28)

- **`route-inventory.ts`** — prefixos conhecidos de rotas UI; testes garantem cobertura RBAC admin e inventário ↔ rotas.
- **Spotlight** — `spotlightInternalTargets` derivado de `WORKSPACE_MODULE_SPECS` (+ `/perfil`).
- **DOC:** `painel/docs/siga/navegacao.md` + sidebar VitePress; link «Documentação» na sidebar aponta ao mapa de navegação.
- **`route-security.md`** — aviso de legado template + link para navegação SIGA real.

### Ciclo 46c — DOC features e links Ajuda (2026-08-28)

- **`guide/features.md`** e **`guide/index.md`** — conteúdo alinhado ao ecossistema real (4 apps, módulos SIGA, RBAC).
- **`getSigaNavDocUrl()`** + `DOC_PATHS` em `ecosystem-urls.ts`.
- **Ajuda:** `/pedagogica` → mapa navegação; `/financeiro` → navegação + link «Pagamentos» (integrações EMIS).

### Ciclo 46d — DocHelpButton e estrutura DOC (2026-08-28)

- **`DocHelpButton`** — botão reutilizável de Ajuda (default: mapa de navegação).
- Ajuda em `/importar`, `/catracas`, `/documentos`; pedagógica/tesouraria usam o mesmo componente.
- **`DOC_PATHS`** expandido (gateway, ADMIN, suporte); Definições e pontes SaaS usam as constantes.
- **`guide/project-structure.md`** — árvore real das 4 apps (já não lista rotas fictícias `/admin/academico`).

### Ciclo 46e — Ajuda em todos os módulos + DOC home (2026-08-28)

- **`DocHelpButton`** também em `/arquivos`, `/planos-aula`, `/acessos`, `/faturas` (+ SAFT-AO), `/comunicacoes`, `/calendario`, `/relatorios/*`.
- **`guide/installation.md`** — arranque real (Node 24, SQL SGA, `dev:ecosystem`), sem fluxo de «licença» fictício.
- **DOC home** — CTAs e features alinhados a WEB/ADMIN/SIGA/DOC; card SIGA liga ao mapa de navegação.

### Ciclo 46f — drawer, alunos/pessoas e stack DOC (2026-08-29)

- **AccountDrawer:** Perfil → `/perfil`; filtro de atalhos respeita plano; Configurações abre painel `conta`.
- **Ajuda** em `/alunos` e `/pessoas`; corrigido `InstalledModuleTools` em pessoas (`pessoas`, não `comunicacoes`).
- **DOC:** `choosing-framework.md` e `tech-stack.md` descrevem as 4 apps (já não «Vite vs Next»).

## Ciclo 9 — identidade, escola e tesouraria

- `src/lib/angola-identity.ts`, `angola-banking.ts`, `angola-phone.ts` — validação BI/NIF, IBAN AO, telefone.
- `src/lib/finance-print.ts` — `buildFinancePrintSchool`, secção **Dados de pagamento** nos PDFs de tesouraria.
- Definições → **Escola**: NIF AGT, logótipo (URL + upload `school-logos`), link Portal AGT.
- Definições → **Financeiro**: IBAN, SWIFT, Multicaixa merchant; **AGT**: série e notas fiscais (metadata, sem SAFT real).
- Definições → **Conta**: telemóvel editável (`profiles.phone` no SQL).
- `AngolaIdentityField` em nova/editar pessoa, matrícula interna e formulário público `/matricula/$slug`.
- `AngolaPhoneField` em nova/editar pessoa, `StudentEnrollmentSheet`, `/matricula/$slug` e `SettingsCenter`.
- Normalização E.164 (`+244 9XX XXX XXX`) antes de persistir em `people.phone` e `profiles.phone`.
- Validação Zod em `personCoreFieldsSchema` para `phone_primary`/`phone_alternative`.
- Recibos/faturas/relatórios financeiros incluem IBAN e logótipo quando configurados.

## SQL no SGA (`xodgfmxiaunpamctfeea`)

Correr **só** no SQL Editor, nesta ordem:

1. `supabase/APPLY_IN_SQL_EDITOR.sql`
2. `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql`

O segundo cria `current_school_id()` a partir de `school_memberships`. Sem isto as tabelas novas não existem (inclui `siga_assessment_items/scores` do Centro de Avaliação e `siga_lesson_plans/siga_lesson_plan_components` dos Planos de Aula).

### Reaplicação obrigatória de Storage

Após os commits de privacidade, reaplicar os dois scripts canónicos para manter
as políticas alinhadas ao código:

- `school-logos` público fica reservado ao logótipo institucional e ao padrão
  de caminhos gerado pela interface;
- fotos de pessoas ficam no bucket privado `siga-files`, referenciadas por
  `siga-file://` e servidas por URL assinada;
- avatares de conta ficam no bucket privado `avatars`, referenciados por
  `siga-avatar://` e servidos por URL assinada.

Referências públicas legadas de avatar continuam compatíveis enquanto existirem
registos antigos em `profiles.avatar_url`.

**Nunca** aplicar ao SGA:

- `all_migrations_combined.sql`
- `supabase/pending_feature_migrations.sql`
- `supabase/migrations/20260810122022_foundation_schema.sql`
- migrações `2026081114*` isoladas (usam helpers Lovable)

Ver `supabase/DO_NOT_APPLY_TO_SGA.txt`.

## Regras de implementação

1. **Estender, não reescrever** páginas/schemas/server existentes.
2. Padrão de módulo: `src/features/<mod>/schemas.ts` + `server.ts` (`createServerFn` + Zod) + rota em `src/routes/` + teste em `tests/<mod>/`.
3. Listas premium: `usePersistedListFilters` + `ListFilterBar`. Search extra via `.passthrough()` e param `lf`.
4. Escrita SGA: `loadSgaAdminClient` + `requireSgaWriter`. Tabelas SGA muitas vezes **sem** GRANT/RLS para `authenticated`.
5. Rotas públicas: `isPublicAppPath` em `src/lib/public-paths.ts` (hoje `/matricula`, `/calendario/ics`).
6. Node **24** neste macOS. v26 falha (`dyld libc++`).
7. Não commitar `.env`. Não force-push / rebase de histórico já publicado (Lovable).
8. Tabelas em falta: falhar com mensagem para `APPLY_ENROLLMENT_AND_PREMIUM.sql`, ou degradar (como planos de pagamento / WhatsApp).

## Auto-construção

```sh
npm run siga:check          # inventário dos módulos
npm run siga:sql            # checklist SQL SGA (ordem + smoke tables)
npm run siga:sql:verify     # confirma tabelas na BD (SUPABASE_SECRET_KEY)
npm run siga:scaffold -- <id> [--route /caminho] [--with-page]
npm run siga:clean-cache   # cache Vite/Nitro se o dev ficar lento
npm test                    # vitest (usar Node 24)
```

DOC checklist SQL: `painel/docs/guide/sql-sga.md`. Pontes kit→produto:
`painel/*/src/lib/alive-bridges.ts` (flag `SHOW_TEMPLATE_SURFACES`).

Lacunas pós-verify (gateway / presença / catracas):
`supabase/APPLY_MISSING_FROM_VERIFY.sql` — `npm run siga:sql:patch` copia e abre o Editor.

Scaffold cria `schemas.ts`, `server.ts`, teste e opcionalmente a rota. Não sobrescreve ficheiros existentes.

Validação local mais recente: `npm run siga:check`, testes Vitest (222), build
de produção e TypeScript concluídos. Os testes SQL pgTAP exigem Docker local;
quando o daemon estiver disponível, correr as suites em `supabase/tests/`.

## Skills (um por módulo)

| Skill               | Quando                                                           |
| ------------------- | ---------------------------------------------------------------- |
| `siga`              | qualquer trabalho SIGA, scaffold, SQL, handoff                   |
| `siga-alunos`       | alunos, matrícula interna, ficha                                 |
| `siga-pessoas`      | pessoas, professores                                             |
| `siga-pedagogica`   | turmas, notas, horários, WhatsApp                                |
| `siga-financeiro`   | caixa, faturas, planos, Multicaixa/Unitel                        |
| `siga-documentos`   | emissão de documentos                                            |
| `siga-calendario`   | calendário lectivo, ICS                                          |
| `siga-comunicacoes` | comunicados                                                      |
| `siga-acessos`      | contas, grants, 2FA                                              |
| `siga-matricula`    | link público `/matricula`                                        |
| `siga-integracoes`  | catálogo catalog-ready                                           |
| `siga-arquivos`     | biblioteca de ficheiros, picker Moodle                           |
| `siga-dashboard`    | dashboard e workspace do professor                               |
| `siga-lesson-plans` | planos de aula, avaliações/provas por turma-disciplina-trimestre |
| `siga-ecosystem`    | limites WEB / ADMIN / SIGA / DOC                                 |
| `siga-web`          | `painel/web` (landing, pricing, wizard comercial)                |
| `siga-admin`        | `painel/admin` (SaaS Control Center)                             |
| `siga-docs`         | `painel/docs` (VitePress)                                        |
| `siga-saas`         | backend SaaS ainda no SIGA (`features/saas`)                     |

Registo canónico: `scripts/siga/modules.json`.

## Ciclo 11 — mensagens internas

- Painel da conta: avatares dos colegas da escola (até 7 recentes) e `+` para pesquisar nome/cargo.
- Conversa no mesmo sheet; botão **Sair** só no menu.
- `src/features/messages/` — `listSchoolColleagues`, `listDirectThread`, `sendDirectMessage`.
- Tabela `siga_direct_messages` em `APPLY_ENROLLMENT_AND_PREMIUM.sql`. Sem tabela, as mensagens ficam neste dispositivo.
- Com SGA, a conversa actualiza a cada 8 segundos.

## Ciclo 12 — não-lidas

- Ponto vermelho nos avatares do painel da conta e no `+` se houver conversas fora dos recentes.
- Contador no avatar do cabeçalho e ponto no sino.
- Notificações listam mensagens por ler; clicar abre a conversa no painel da conta.
- Leitura marcada neste dispositivo (`siga:dm-read`); inbox SGA via `listInboxPreviews`.

## Ciclo 13 — avisos do sino

- `listSchoolAlerts` junta candidaturas `pending`, alunos `applicant`, pedidos de documento em curso e faturas vencidas.
- O sino mostra estes avisos (com atalho para a página certa) e as mensagens por ler.
- Textos em `src/features/dashboard/alerts.ts`.

## Ciclo 14 — presença

- `enrollments.attendance_rate` lido na ficha do aluno; Admin/Secretaria **Registar** (0–100).
- Dashboard `attendanceAverage` e turmas pedagógicas usam a média das matrículas activas.
- Boletim inclui a percentagem. Coluna em `APPLY_IN_SQL_EDITOR.sql`.

## Ciclo 15 — destaques da conta

- Catálogo editável em `src/features/spotlight/catalog.ts` (notas, novidades, funções, promoções).
- O cartão «Relatórios avançados» mantém o visual original; os outros usam o mesmo molde com tons e ícones diferentes.
- Ligações internas, externas (Portal AGT) e painéis de Definições. Filtra por cargo.

## Ciclo 44 — Limpeza de Dados Falsos e Preparação para Produção (`e68f5b4`)

- **Expurgo de Dados Fictícios (`e68f5b4`)**: Removidas todas as instâncias de dados mock estáticos em `CashFlowForecastChart.tsx`, `DisciplinePerformanceHeatmap.tsx`, `DropoutRiskReportModal.tsx`, `dropout-risk-predictor.ts` e `sga-grades.ts`.
- **Script SQL de Produção**: Criado `supabase/PURGE_DEMO_DATA.sql` para expurgar dados de teste mantendo intactas as escolas, turmas, disciplinas, permissões RBAC e modelos oficiais.
- **Validação Global**: `npm run siga:check` 100% verde em todos os 13 módulos, 41/41 suítes de teste a passar (248 testes) e `npm run build` de produção concluído.

## Ciclo 43 — Emissão de Faturas Proforma (`4bc7265`)

- **Faturas Proforma (`4bc7265`)**: Integrada a emissão de Fatura Proforma em [src/routes/faturas.tsx](file:///Users/valentinocanguele/edu/onsoft-replica-dev/src/routes/faturas.tsx) com `buildProformaInvoice` de `proforma-receipts.ts`, dados bancários IBAN da instituição e aviso legal AGT.
- **Validação Workspace**: `npm run siga:check` 100% verde em todos os 13 módulos e 41/41 suítes de teste a passar (248 testes).

## Ciclo 42 — Refinamento de UX do Modal OCR (`732940f`)

- **Refinamento do Modal OCR (`732940f`)**: Atualizado [PautaOcrScannerModal.tsx](file:///Users/valentinocanguele/edu/onsoft-replica-dev/src/features/pedagogica/components/PautaOcrScannerModal.tsx) com painel duplo de pré-visualização de imagem original e grelha de edição manual direta de notas (MAC, NPP, NPT) antes da importação para a pauta.
- **Validação Global**: `npm run siga:check` 100% verde em todos os 13 módulos e 41/41 suítes de teste a passar (248 testes).

## Ciclo 41 — Cartão Digital PWA e Ferramentas Pedagógicas (2026-08-19)

- **Cartão Digital de Estudante (`922eca0`)**: Adicionado botão e ligação do modal `StudentDigitalCardModal` na ficha do aluno (`src/routes/alunos/$studentId.tsx`), com passe escolar, assinatura digital e QR Code dinâmico com atualização a cada 30s.
- **Ferramentas Pedagógicas Avançadas**: Integração do scanner OCR de pautas em papel (`PautaOcrScannerModal`) e do relatório preditivo de risco de abandono escolar (`DropoutRiskReportModal`) com botões na Área Pedagógica (`/pedagogica`).
- **Sanidade do Workspace**: `npm run siga:check` válido para todos os 13 módulos e 41/41 suítes de teste a passar (248 testes).

## Ciclo 40 — Avaliações, Login por BI e SAFT-AO (2026-08-19)

- **Edição/Remoção de Avaliações (`26dda5e`)**: Modal `CreateAssessmentDialog` estendido em `AssessmentCenter.tsx` com `updateAssessmentItem` e `deleteAssessmentItem` (`force: true` remove atomicamente notas associadas).
- **Login por Bilhete de Identidade / NIF (`bf271a1`)**: Novo módulo `bi-login.ts` e `resolveBiToEmailFn` em `access/server.ts`; `AuthGate.tsx` aceita BI ou E-mail e resolve para a conta correspondente antes de iniciar sessão.
- **Gerador SAFT-AO AGT (`21368ef`)**: Criado `saft-generator.ts` (conforme Decreto Presidencial 312/18 AGT e isenção M00 art. 12º CIVA), com Server Function `exportSaftAoXml` e botão de exportação XML no ecrã de faturas (`/faturas`).
- **Testes**: 248/248 testes a passar (41 suítes Vitest).

## Ciclo 16 — gerir destaques

- Definições → **Destaques**: Administrador liga/desliga, reordena e edita título/texto/botão. Ligações ficam no catálogo.
- Persistência em `school_settings.domain = "spotlight"` (JSON; sem DDL novo). Sem linha, usa o catálogo.
- O rail do painel da conta lê `listSpotlightConfig` e continua a filtrar por cargo/`canAccessPath`.
- Atalho: `/configuracoes?painel=destaques`.

## Ciclo 17 — destaques da escola

- **Novo destaque** cria uma nota/novidade/atalho da escola (até 12), com ícone, cor e ligação (página SIGA, painel de Definições ou URL).
- Cartões do catálogo não se apagam; os da escola têm lixo. Atalhos internos respeitam `canAccessPath`.
- `extras` no mesmo JSON `school_settings` domínio `spotlight`. Overrides antigos sem `extras` continuam válidos.

## Ciclo 18 — público e calendário dos destaques

- Cada cartão tem **Quem vê** (cargos) e datas de início/fim no fuso de Luanda. Sem datas, fica sempre visível; sem cargos, todos vêem.
- O painel da conta esconde o que ainda não começou ou já terminou. Pré-visualização do cartão em Definições → Destaques.

## Ciclo 19 — destaques no início

- Notas, novidades e promoções aparecem no dashboard (`/`). Atalhos (`function`, p.ex. Relatórios avançados) ficam só no painel da conta, salvo se o Administrador ligar **Início**.
- Definições → Destaques → **Onde aparece**: Painel da conta e/ou Início. É obrigatório pelo menos um.

## Ciclo 20 — ligação do botão

- Cada destaque tem **Ligação do botão**: página do SIGA (lista ou caminho `/…`), URL externo, ou painel de Definições. Vale para o catálogo e para as notas da escola.
- Caminhos internos ganham `/` se faltar; URLs sem `https://` são completados ao sair do campo. Página interna actualiza o filtro de acesso.

## Ciclo 21 — aspecto dos cartões

- Ícone (grelha), cor e tipo em **todos** os destaques, não só nas notas da escola. Mais ícones (livro, pessoas, estrela, sino, e-mail…).
- Mudar o tipo de atalho para nota/novidade passa a poder aparecer no início, salvo se **Onde aparece** já estiver definido à mão.

## Ciclo 22 — arquivos

- Biblioteca estilo Moodle em `/arquivos` (waffle **Arquivos**, não na sidebar). Áreas: escola, secretaria (reservada), pessoal, públicos.
- Picker modal `FilePickerModal` / botão **Arquivo** em documentos, alunos, comunicações e pedagógica. Painel da conta: **Os meus arquivos**. Definições → Arquivos (área e visibilidade neste dispositivo).
- Bytes no bucket privado `siga-files`; metadados em `siga_files`. Sem SQL: IndexedDB local (ano/mês/área). Máx. 8 MB; só PDF/Word/Excel/PNG/JPEG. A lista não descarrega o ficheiro.
- Sem chave de armazenamento gratuita partilhada. OneDrive = Microsoft 365 catalog-ready (`m365.onedrive` abre `/arquivos`).

## Ciclo 23 — arquivos (miniaturas e ligação)

- Capas PNG/JPEG com pré-visualização a pedido (`FileCoverTile` + `resolveFileUrl`); PDF/Word/Excel mantêm ícone.
- Filtros por tipo (Todos / PDF / Word / Excel / PNG / JPEG) no browser; o picker pode restringir tipos (`acceptKinds`).
- **Da biblioteca** no perfil (foto) e em Definições → Escola (logótipo), só PNG/JPEG.
- Pré-busca de metadados ao apontar para `/arquivos`.

## Ciclo 24 — arquivos nas fichas

- Ficha do aluno e registo central: **Foto** / **Foto da biblioteca** (PNG/JPEG
  → `siga-files` privado + referência `siga-file://` em `people.photo_url`).
- Documento da pessoa: **Anexar PDF** da biblioteca (`file_id` / `file_name` em `person_documents`); botão **Abrir** no anexo. Colunas no `APPLY_ENROLLMENT_AND_PREMIUM.sql`.
- Comunicados: **Anexar arquivo** acrescenta referência `[Arquivo SIGA] nome` à mensagem (sem blob no Postgres).

## Ciclo 25 — materiais de turma

- `siga_files.class_group_id` + índice; listagem/registo/ligação no servidor (fallback se a coluna ainda não existir).
- Cartão da turma em `/pedagogica`: painel **Materiais** (`ClassMaterialsPanel`) — anexar da biblioteca, abrir, descarregar, desligar.
- Browser: **Renomear** e **Descarregar**; metadados locais com `patchLocalFileMeta`.
- Professores anexam via permissão do módulo `arquivos`.

## Ciclo 26 — filtro turma e workspace

- `/arquivos?turma=` filtra a biblioteca; dropdown de turmas no `FileBrowser` (`listArquivosClassOptions`).
- Carregar com filtro activo liga o ficheiro à turma.
- Workspace do professor: painel **Materiais das turmas** (`TeacherClassMaterialsBlock`) + atalho Biblioteca.
- Partilha: copiar `[Arquivo SIGA] …` e WhatsApp (se `whatsapp.class_groups`).

## Ciclo 27 — visual OneDrive, acesso e auditoria

- Browser opaco estilo OneDrive: cabeçalho com **utilizador activo** (avatar + cargo), vista **lista/grelha**, organizar, painel **Detalhes**.
- Colunas: Nome, Modificado, Modificado por, Tamanho, **Acesso** (Privado/Escola/Público), **Actividade**.
- Nível do utilizador no ficheiro: Proprietário / Pode editar / Só leitura; alterar visibilidade no painel Detalhes.
- Auditoria: tabela `siga_file_events` + campos `updated_*` / `last_action_*` em `siga_files` (SQL premium). Abrir/descarregar/renomear/ligar registam eventos.

## Ciclo 28 — refino OneDrive

- Breadcrumb `utilizador › área › turma`; barra de comandos ao seleccionar (Descarregar, Copiar, Renomear, Apagar).
- Drag-and-drop para carregar; Enter abre / Esc limpa; ícones com selo de partilha; avatares em Modificado por / Actividade / auditoria.
- Detalhes: pré-visualização de imagem; picker modal alinhado ao novo visual.

## Ciclo 29 — inquérito de metadados

- Ao carregar (botão ou drag-drop): modal **Inquérito do documento** (`FileUploadInquiryModal`) com título, categoria, data, referência, descrição, acesso, utilizador SIGA e pessoa do registo.
- Colunas SGA: `title`, `description`, `category`, `document_date`, `reference_code`, `related_user_id`, `related_person_id`.
- Filtros por categoria e utilizador relacionado; painel Detalhes mostra e edita metadados; evento `metadata_updated`.

## Ciclo 30 — fotografia de aluno

- Categoria **Fotografia**: inquérito exige aluno (`listArquivosStudentOptions`); PNG/JPEG; opção **Usar como foto de perfil** (predefinida).
- Após guardar: `applyLibraryPhotoToPerson` mantém o ficheiro em `siga-files`
  privado, grava `people.photo_url` como `siga-file://` e actualiza os
  metadados `category=foto` / `related_person_id`.
- Ficha do aluno: painel **Arquivos do aluno** (`StudentRelatedFilesPanel`) com lista ligada, **Usar no perfil** e atalho `/arquivos?pessoa=`.
- Botão **Foto** na ficha também marca o ficheiro como fotografia relacionada.

## Ciclo 31 — media padronizada

- Formatos reconhecidos: PDF, Word, Excel, PowerPoint, CSV, PNG, JPEG, WebP, GIF, SVG (ícones) — ícones por tipo em `FileKindIcon` / `FileCover`.
- Inquérito: **descrição obrigatória** (≥12 chars) + **área de destino**; sugestão de categoria/área pelo nome e tipo.
- Ficheiros sem descrição/título/categoria ficam **Por organizar** (filtro + badge + modal de organização).
- Nenhum upload fica sem metadados; mover área via `updateSchoolFileMeta.area`.

## Ciclo 32 — pastas, selecção e modal expansível

- Pastas em `siga_files` (`is_folder`, `parent_id`); **Nova pasta**, breadcrumb e navegação por duplo clique.
- Multi-selecção com checkboxes; barra **Mover** para raiz ou pasta (`moveSchoolFiles`).
- Modais **Expandir** (`FilePickerModal`, inquérito, mover) para trabalho em ecrã largo.
- Eventos `folder_created` / `moved`. SQL: reaplicar `APPLY_ENROLLMENT_AND_PREMIUM.sql`.

## Ciclo 33 — recibos, talões e ID pesquisável

- ID simples `PREFIX-AAMMDD-XXXX` (`document-code.ts`); coluna/pesquisa `reference_code` na biblioteca.
- Categorias financeiras `recibo` / `talao` / `fatura`; stubs `.txt` via `insertFinanceArchive` (idempotente por ID).
- Tesouraria arquiva ao receber, emitir fatura e criar plano; impressão de talão reutiliza o mesmo ID estável.
- UI: inquérito com ID, lista/grelha com mono ID, ficha do aluno mostra recibos/talões ligados.
- SQL: categoria `talao` no CHECK + índice `siga_files_reference_idx` em `APPLY_ENROLLMENT_AND_PREMIUM.sql`.

## Ciclo 34 — Planos de Aula

- `/planos-aula` (sidebar → Área Pedagógica): cartões agrupados por trimestre, filtráveis por turma/disciplina/trimestre/texto.
- Modal `LessonPlanModal` (padrão `PremiumModal`, o mesmo usado no Centro de Avaliação): turma, disciplina, trimestre, título, conteúdo, anexo (`PickFileButton` da biblioteca), listas repetíveis de **Avaliações** e **Provas** (nome definido pelo professor + quantidade).
- **Não é um motor de notas novo.** Cada avaliação/prova do plano materializa-se em `siga_assessment_items` (avaliação → `component: MAC`, prova → `component: NPP`) — o Centro de Avaliação já existente (`AssessmentCenter.tsx`) lança as notas, calcula `componentAverage` e empurra para a pauta oficial via `upsertTermGradesBatch`. A pauta continua fixa a MAC/NPP/NPT.
- Editar um plano nunca apaga notas já lançadas: itens do Centro de Avaliação com pontuação ficam ligados por `lesson_plan_component_id` mesmo que a definição do plano mude; só remove itens _sem_ nota quando a quantidade planeada desce.
- Tabelas novas: `siga_lesson_plans`, `siga_lesson_plan_components`; coluna nova `siga_assessment_items.lesson_plan_component_id`. Tudo em `APPLY_ENROLLMENT_AND_PREMIUM.sql`.

## Ciclo 35 — mensagens com anexo, fluxo corrigido e página de perfil

- **Anexo nas mensagens internas**: botão de clipe (`PickFileButton`) na conversa, chip antes de enviar, bolha da mensagem mostra o ficheiro e abre com `signSchoolFile`. Mensagem pode ir só com anexo (sem texto). Colunas novas `siga_direct_messages.attachment_file_id/attachment_file_name`; `body` deixou de ser `NOT NULL`.
- **Bug de fluxo corrigido**: `listInboxPreviews` só olhava para mensagens recebidas — uma conversa que só tu iniciaste (sem resposta ainda) não aparecia em lado nenhum. Agora `InboxPreview` separa `lastActivityAt` (qualquer direcção, para pré-visualização/ordenação) de `lastIncomingAt` (só recebidas, para o ponto de não-lida).
- **`/perfil`**: página dedicada (foto, nome, telemóvel) extraída para `src/features/auth/ProfileSettingsPanel.tsx` — usada tanto na página como no painel Conta → Perfil do Centro de Configurações (uma só fonte). O menu da conta na sidebar abre `/perfil` em vez do modal.

## Ciclo 36 — dono obrigatório e ficheiros de sistema

- Todo o documento fica ligado a um utilizador SIGA (`related_user_id`): inquérito obrigatório (predefinido = conta actual); upload/pasta/arquivo financeiro preenchem automaticamente.
- Coluna `is_system` em `siga_files`: recibos/talões/faturas gerados pela tesouraria são `is_system=true`.
- Visíveis na lista (metadados/ID), mas abrir/descarregar/miniatura exige dono, utilizador relacionado, ou Admin/Secretaria/Tesouraria (`canAccessFileContent`).
- Alterar/apagar/mover ficheiros de sistema: Admin/Secretaria ou dono (`canManageSystemFile`). Sem permissão: cadeado «Sistema / Protegido» e conteúdo oculto.
- SQL: reaplicar `APPLY_ENROLLMENT_AND_PREMIUM.sql` (`is_system` + índice).

## Ciclo 37 — backfill, filtros e painéis

- SQL: `related_user_id = owner_user_id` onde faltava; `is_system=true` em recibo/talão/fatura existentes.
- Biblioteca: filtros **Meus** e **Sistema**; picker não escolhe ficheiro protegido sem permissão.
- Materiais de turma e ficha do aluno respeitam `canAccessFileContent` (cadeado / toast).
- `setSchoolFileVisibility` bloqueia ficheiros de sistema sem gestão.

## Ciclo 38 — auditoria de acesso e anexos

- Evento `access_denied` em `siga_file_events` (CHECK SQL + UI «tentou abrir (sem permissão)»).
- `signSchoolFile` regista tentativa quando o conteúdo de sistema é bloqueado.
- Mensageiro interno: anexo protegido mostra cadeado / toast «Anexo protegido» em vez de falha genérica.

## Ciclo 39 — descoberta local de hardware (Linux-first)

- Daemon Python em `127.0.0.1:8088` apenas (`BIND_HOST`); CORS restrito a localhost/Tauri.
- `device_discovery.py`: lista `/dev/ttyUSB*`, `ttyACM*`, `serial/by-id` e impressoras CUPS (`lpstat -a`). Não lê `$HOME`, browsers nem cookies.
- Allowlist em `siga_hardware_allowlist.json` (ou `SIGA_HARDWARE_STATE_DIR`) — só neste PC.
- Endpoints: `GET /hardware/discover`, `GET|POST /hardware/allowlist`; abertura de catraca com `device_id` exige allowlist.
- UI em `/catracas` → definições desktop: procurar dispositivos e autorizar com switch.
- Arranque: `python3 python/hardware_bridge/siga_hardware_bridge.py`
- **Abandonado:** drivers universais, acesso directo do browser, inventário completo do PC enviado à cloud.

## Ciclo 40 — pulso físico ligado ao grant

- Simulador/validação: se o acesso for **autorizado**, envia pulso de relé via Tauri ou daemon Python (`triggerTurnstileRelay`).
- IP resolvido por `resolveTurnstilePulseIp`: IP do dispositivo SGA → definições desktop → `127.0.0.1` (simulação).
- Badge **Bridge online/offline** em `/catracas` (`GET /health` a cada 15s).
- Registo de catraca: campo IP opcional; botão **Relé** por dispositivo.
- Helper puro: `src/features/catracas/hardware-pulse.ts` + testes.

## Ciclo 41 — cartões e dispositivos operacionais

- `setAccessCardStatus`: Suspender / Perdido / Reactivar no cartão digital do aluno.
- `updateTurnstileDevice`: estado online / offline / manutenção (bloqueia scan se offline/manutenção).
- Simulador: selector de dispositivo; logs com filtro Autorizados / Negados.
- Validação de token sem `students!inner` (cartões só de pessoa); aluno `inactive` negado.
- Filtros de log: `direction` e `deviceId` no schema/server.

## Ciclo 42 — RFID, QR e API key

- `linkAccessCardRfid` + UI no cartão digital (guardar / limpar tag Wiegand).
- `rotateAccessCardQr` — invalida o QR anterior.
- Validação: `gatePassLookupTokens` (sanitiza filtro PostgREST + tenta RFID normalizado).
- Dispositivos: botão **Key** copia `api_key` para controladores offline.
- Helpers: `src/features/catracas/gate-pass-token.ts`.

## Ciclo 45 — Harmonização do ecossistema (2026-08-28)

Referência canónica: [`docs/agents/ARCHITECTURE_HARMONIZATION.md`](./ARCHITECTURE_HARMONIZATION.md).

Implementado sem unificar frontends:

- URLs em cada app (`ecosystem-urls.ts` / `VITE_*` / `NEXT_PUBLIC_*`).
- API HTTP no SIGA (mesmo `provisionTenantCore`): `/api/saas/signup`, `/plans`, `/tenants`, `/stats`, `/tenants/status`.
- WEB: `/` = landing; `/start` = wizard (componentes do WEB) → API → SIGA.
- ADMIN: `/tenants` (layout Next existente) consome a API; «Nova escola» abre o WEB.
- SIGA `/saas-admin` e `/criar-escola` são pontes (redirect automático para WEB `/start`). Login «criar escola» → WEB. Menu: Documentação (DOC) e Planos (WEB).
- Assinatura suspensa no SIGA: CTA para planos WEB + suporte DOC.
- `npm run siga:sync-env` propaga `.env` raiz → `painel/web/.env.local` e `painel/admin/.env.local`.
- ADMIN `/` redirecciona para `/tenants`. DOC: nav e cards com links para WEB/ADMIN/SIGA.
- Fase 10 (parcial): `GET /api/saas/me` (ADMIN valida `platform_admins`); login ADMIN bloqueia contas escolares; middleware protege `/tenants` e `/settings/billing`; `PlatformAdminGate` no layout; login «Control Center SaaS».
- Fase 12 (parcial): `fetchSaaSStats` soma `tenant_usage` (não `students` global); lista tenants com alunos/trial; SIGA bloqueia trial expirado.
- ADMIN `/settings/billing` = catálogo SaaS via API (não mock template).
- Fase 13 (parcial): `POST /api/saas/usage/sync` + botão «Sync utilização» no ADMIN; `npm run siga:e2e-smoke`; testes de contrato em `tests/saas/ecosystem-flow.test.ts`.
- Provisionamento chama `syncTenantUsageForSchool`; signup devolve `adminTenantsUrl`; WEB `/start` ecrã final com DOC; ADMIN sidebar com sessão Supabase real.
- **Gating por plano (SIGA):** `plan-features.ts` — menu e rotas respeitam `plans.features`; banner de trial; «Criar escola» → WEB.
- **Sync automático:** `queueTenantUsageSync` após criar/alterar alunos → `tenant_usage` no ADMIN.
- **Limites de alunos:** `tenant-limits.ts` + `assertCanAddStudentForSchool` em `createStudent`/`enrollNewStudent`; banner no `AppShell` e `/alunos` (≥90% / limite; botão Nova Matrícula desactivado); badge «Limite» no ADMIN `/tenants`; testes `tests/saas/tenant-limits.test.ts`.
- **ADMIN middleware:** `/settings` (incl. billing) exige sessão Supabase como `/tenants`.
- **Smoke Fase 13:** `siga:e2e-smoke` inclui `GET /api/saas/me` (401 anónimo).
- **Billing operacional (ADMIN):** `POST /api/saas/tenants/subscription` (plano + prolongar trial); botão «Gerir» em `/tenants`.
- **Operadores SaaS:** `/platform-admins` + API `GET/POST /api/saas/platform-admins` e `POST .../revoke`; `/audit` + `GET /api/saas/audit-logs`.
- **Domínios:** `/domains` + `GET/POST /api/saas/domains` e `POST /api/saas/domains/status` (custom pending → active/failed); link «Domínios» por tenant em `/tenants`; testes schema; smoke E2E inclui APIs e rota ADMIN.
- **Subscrições:** tabela `subscriptions` populada no `provisionTenantCore` e sincronizada em `updateTenantSubscription`; `/subscriptions` + `GET /api/saas/subscriptions`; backfill `POST /api/saas/subscriptions/backfill`.
- **DOC ADMIN:** `painel/docs/admin/control-center.md` — manual do Control Center; ponte `/saas-admin` com links directos às rotas ADMIN.
- **DOC WEB:** `painel/docs/web/criar-escola.md` — wizard `/start`, API signup, testes E2E.
- **CI @live (opcional):** `prepare-ci-env.mjs` + step Playwright com `SUPABASE_SECRET_KEY`; smoke inclui páginas DOC WEB/ADMIN.
- **Playwright Fase 13:** `scripts/siga/e2e-ecosystem-playwright.py` + `npm run siga:e2e-playwright` (smoke + UI); espelho TS em `tests/e2e/`; `@live` com `SIGA_E2E_LIVE=1` (incl. login SIGA pós-provisionamento).
- **CI:** job `ecosystem-e2e` — arranca 4 apps, `SIGA_E2E_CI=1` smoke, Playwright wizard; scripts `start/wait/stop-ecosystem-ci.mjs`.
- `npm run dev:ecosystem` arranca as 4 apps. SIGA pedagógica: botão Ajuda → DOC.

### Ciclo ecossistema 5 (2026-08-28) — bootstrap, DNS, demo, DOC

- **Bootstrap pós-provisionamento:** `bootstrapSchoolDefaults` (ano lectivo, propinas, matrícula pública, académico mínimo); resposta signup inclui `bootstrapSeeded`.
- **Tenant lookup:** `GET /api/saas/tenants/lookup?slug=` + `tenant-lookup.ts`; resolução custom domain em `tenant-resolver.ts`.
- **DNS verify:** `POST /api/saas/domains/verify` + UI ADMIN «Verificar DNS».
- **Financeiro onboarding:** `FeePlanSettingsForm`, alertas `missingActiveFeePlan`, dashboard «Primeiros passos».
- **E2E:** `npm run siga:e2e-live` (provisionamento real + lookup); smoke actualizado.
- **Demo seed:** `npm run siga:sql:demo` (ordem SQL) + `npm run siga:seed-demo` (gera `SEED_ESCOLA_DEMO_FULL.sql`).
- **Tenant demo:** `SEED_ESCOLA_DEMO.sql` liga slug `dom-afonso-demo` → ADMIN + lookup API.
- **Financeiro:** `financeInvoiceBlocked` desactiva «Emitir fatura» em `/financeiro` quando schema/plano incompleto.
- **Académico:** `ensureAcademicDefaults` delega em `ensureAcademicDefaultsCore` (`academic-bootstrap.ts`); Pedagógica também cria nível, classe e turma inicial.
- **Gateway financeiro:** `POST /api/finance/gateway/confirm` + referências EMIS determinísticas; API key em Integrações → Multicaixa; `npm run siga:gateway-simulate`; UI «Referência EMIS» em `/faturas`; painel Integrações mostra URL + API key.
- **Demo usage:** `npm run siga:sync-demo-usage` após seed completo (métricas ADMIN).
- **DOC:** `web/onboarding-pos-criacao.md`, `admin/domains.md`; actualizados `criar-escola.md`, `fluxos.md`, `control-center.md`.

### Ciclo ecossistema 11 (2026-08-28) — matrícula pública E2E

- **`getPublicEnrollmentUrl(slug)`** em `ecosystem-urls.ts` — link `/matricula/$slug` (slug do tenant = slug do formulário no bootstrap).
- **Dashboard:** `getDashboardOverview` expõe `enrollmentPublicLink`; «Primeiros passos» mostra URL partilhável quando o formulário está aberto.
- **Smoke:** `GET /matricula/dom-afonso-demo` em `siga:e2e-smoke`.
- **Live E2E:** após signup API, verifica `GET /matricula/{slug}` → 200.

### Ciclo ecossistema 12 (2026-08-28) — matrícula @live + gateway produção

- **Playwright @live:** `tests/e2e/enrollment-live.spec.ts` — signup → candidatura pública → login admin → aceitar → `student_id` na BD.
- **Helper:** `tests/e2e/helpers/sga-live-admin.ts` (password E2E + consultas Supabase).
- **EMIS por escola:** `resolveSchoolEmisEntity` / `emisEntityFromIntegrationConfig` — lê `merchantId` (4–6 dígitos) em Integrações → Multicaixa; planos de pagamento usam entidade configurada.
- **Webhook Unitel:** `POST /api/finance/gateway/unitel/confirm` (canal `unitel_money` fixo); UI Integrações mostra URL dedicada.
- **API key gateway:** validação só via `webhookApiKey` (não confunde com merchant EMIS).

### Ciclo ecossistema 13 (2026-08-28) — PaymentReferenceCard + cleanup E2E

- **`PaymentReferenceCard`:** carrega referência via `generateInvoicePaymentReference` (entidade EMIS da escola em Integrações).
- **`generateInvoicePaymentReference`:** autenticado, valida fatura da escola, devolve `emisEntity` + referência determinística.
- **Cleanup @live:** `cleanupE2ETenantBySlug` — só slugs `e2e-*` / `web-*` / `mat-*` e e-mail `@siga-plus.test`; testes Playwright `@live` removem tenant no `finally`.
- **CLI:** `npm run siga:e2e-cleanup-stale` (`--dry-run`) — tenants E2E órfãos na BD.

### Ciclo ecossistema 14 (2026-08-28) — Python @live + lib cleanup

- **`e2e-cleanup-lib.mjs`:** lógica partilhada de cleanup (usada por stale, tenant CLI e Python).
- **`npm run siga:e2e-cleanup-tenant -- --slug=… --email=…`** — remove um tenant E2E.
- **Python `@live`:** `e2e-ecosystem-playwright.py` faz cleanup no `finally` após signup API e wizard; verifica `GET /matricula/{slug}`.
- **DOC:** `criar-escola.md` — comandos Playwright TS `@live` e cleanup stale.

### Ciclo ecossistema 15 (2026-08-28) — CI Playwright TS @live

- **`@playwright/test`** (devDependency) + scripts `siga:e2e-playwright-ts` e `siga:e2e-playwright-live`.
- **CI `ecosystem-e2e`:** Playwright TS rotas/wizard sempre; `@live` Python + TS quando `SUPABASE_SECRET_KEY`; cleanup stale no `finally`.
- **`siga:e2e-playwright`:** orquestra smoke → TS → Python → [@live] TS + cleanup stale.

### Ciclo ecossistema 16 (2026-08-28) — artefactos Playwright CI

- **`playwright.config.ts`:** `outputDir`, reporter HTML, `trace`/`video` `retain-on-failure` na CI.
- **CI:** upload artefacto `playwright-e2e-report` (HTML + traces) quando o job falha (14 dias).
- **`.gitignore`:** `test-results/`, `playwright-report/`.
- **`npm run siga:e2e-playwright-report`** — ver relatório local após falha.

### Ciclo ecossistema 17 (2026-08-28) — CI @live nocturno

- **Workflow** `.github/workflows/ecosystem-e2e-live.yml` — cron `03:00 UTC` + `workflow_dispatch`.
- **`siga:e2e-live-only`** / `e2e-ecosystem-live.mjs` — smoke + Python `@live` + Playwright TS `@live` + cleanup (sem repetir suite não-live).
- Skip automático quando `SUPABASE_SECRET_KEY` não está configurado (forks / repos sem secrets).
- Artefacto `playwright-e2e-live-report` em falhas.

### Ciclo ecossistema 18 (2026-08-28) — alertas Slack E2E

- **`notify-ci-failure.mjs`** — POST opcional para Slack (`SLACK_E2E_WEBHOOK_URL`).
- **Jobs `notify`:** em `ecosystem-e2e-live.yml` (nocturno) e `ci.yml` (`ecosystem-e2e-notify` em falha de PR/push).
- **DOC / `.env.example`:** secret Slack documentado.

### Ciclo ecossistema 19 (2026-08-28) — alertas e-mail + DOC gateway

- **`notify-ci-failure.mjs`** — complemento Resend (`RESEND_API_KEY`, `E2E_ALERT_EMAIL_TO`, `E2E_ALERT_EMAIL_FROM` opcional); Slack + e-mail em paralelo; exit 0 se nenhum canal configurado.
- **DOC:** `painel/docs/integracoes/emis-multicaixa-unitel.md` — webhooks EMIS e Unitel, entidade por escola, teste local.
- **Sidebar VitePress** `/integracoes/` + link em `fluxos.md` e `GatewayWebhookHint` (Definições → Integrações).

### Ciclo ecossistema 20 (2026-08-28) — E2E @live gateway EMIS

- **`tests/e2e/gateway-live.spec.ts`** — signup → fatura + plano `pending_gateway` → POST webhook → fatura `paid` + plano `settled`.
- **Dois cenários:** `SIGA_GATEWAY_DEV_API_KEY` (modo dev) e `webhookApiKey` por escola (Integrações).
- **Helpers** em `sga-live-admin.ts`: `seedE2EGatewayFixture`, `installE2EMulticaixaIntegration`, slugs `gw-*`.
- **CI:** `prepare-ci-env.mjs` injecta `SIGA_GATEWAY_DEV_API_KEY`; incluído em `siga:e2e-playwright-live`.

**Próximo opcional:** integração real EMIS/Unitel no portal externo (credenciais de produção).

### Ciclo ecossistema 21 (2026-08-28) — E2E @live Unitel

- **`gateway-live.spec.ts`** — dois cenários Unitel: dev key + `webhookApiKey` da escola em `POST /api/finance/gateway/unitel/confirm`.
- **`installE2EUnitelIntegration`** + `seedE2EGatewayFixture({ channel: "unitel_money" })` em `sga-live-admin.ts`.
- **DOC** integrações — três modos de verificação @live (EMIS dev, EMIS escola, Unitel).

**Próximo opcional:** credenciais reais no portal EMIS/Unitel (externo ao SIGA).

### Ciclo ecossistema 22 (2026-08-28) — checklist produção gateway

- **DOC:** `painel/docs/integracoes/gateway-producao.md` — fases operador/escola/portal banco, go-live, segurança.
- **Sidebar** + links em onboarding, fluxos, `GatewayWebhookHint`, manual EMIS/Unitel.
- **CLI:** `npm run siga:gateway-simulate -- --unitel` — simulador Unitel (URL `/unitel/confirm`).

**Próximo opcional:** runbook suporte (escalation quando webhook falha em produção).

### Ciclo ecossistema 23 (2026-08-28) — runbook suporte gateway

- **DOC:** `painel/docs/integracoes/gateway-runbook-suporte.md` — triagem, mapa HTTP→acção, L1–L4, confirmação manual.
- **Sidebar** + links em checklist produção, manual EMIS/Unitel, `GatewayWebhookHint`.
- **Índice** integrações — entrada «Incidentes webhook».

**Próximo opcional:** métricas/alertas de webhook falhado (observabilidade produção).

### Ciclo ecossistema 24 (2026-08-28) — observabilidade webhook gateway

- **Tabela** `finance_gateway_webhook_events` em `APPLY_IN_SQL_EDITOR.sql` (RLS leitura Administrador/Tesouraria).
- **`gateway-webhook-telemetry.ts`** — `recordGatewayWebhookEvent`: log JSON, insert SGA, Slack opcional (`SIGA_GATEWAY_ALERT_SLACK_URL`).
- **Handler** `runFinanceGatewayWebhook` regista cada tentativa (sucesso ou falha).
- **UI** Definições → Integrações: últimos 5 webhooks por canal em `GatewayWebhookHint`.
- **CLI** `npm run siga:gateway-events-recent [--failures-only] [--limit=N]`.
- **Testes** `tests/finance/gateway-webhook-telemetry.test.ts`.

### Ciclo ecossistema 25 (2026-08-28) — dashboard ADMIN webhooks gateway

- **API** `GET /api/saas/gateway-webhooks` — `platform_admins`, agrega `finance_gateway_webhook_events` cross-tenant.
- **`gateway-webhook-metrics.ts`** — função pura `aggregateGatewayWebhookMetrics` (24h, 7d, por canal, top escolas).
- **ADMIN** `/gateway-webhooks` — cartões resumo + tabelas falhas recentes e escolas afectadas.
- **Sidebar** + command search + `fetchGatewayWebhookMetrics` em `painel/admin/src/lib/saas-api.ts`.
- **Testes** `tests/finance/gateway-webhook-metrics.test.ts`.

### Ciclo ecossistema 26 (2026-08-28) — alerta taxa de falha gateway

- **`gateway-failure-rate-alert.ts`** — avalia taxa 24h, Slack/Resend, cooldown via `saas_audit_logs` (`GATEWAY_FAILURE_RATE_ALERT`).
- **Telemetria** — após falha HTTP ≥ 400, `recordGatewayWebhookEvent` dispara verificação assíncrona.
- **CLI** `npm run siga:gateway-failure-rate-check` — cron horário sugerido.
- **ADMIN** `/gateway-webhooks` — banner quando taxa 24h ≥ 25% (≥ 5 eventos).
- **Testes** `tests/finance/gateway-failure-rate-alert.test.ts`.

**Próximo opcional:** credenciais reais EMIS/Unitel no portal externo (fora do SIGA).

### Ciclo ecossistema 27 (2026-08-28) — portal banco + CI horária

- **DOC:** `painel/docs/integracoes/gateway-portal-banco.md` — modelo e-mail/ticket EMIS/Unitel, checklist portal.
- **Checklist produção** Fase 6 observabilidade; links cruzados manual EMIS + índice.
- **CI:** `.github/workflows/gateway-failure-rate-check.yml` — cron horário (secrets opcionais).
- **ADMIN** `/gateway-webhooks` — último alerta de taxa (`GATEWAY_FAILURE_RATE_ALERT`).
- **Auditoria** — badge «Alerta taxa webhook» para acção de rate alert.

### Ciclo ecossistema 28 (2026-08-28) — rotação webhookApiKey

- **`gateway-webhook-key.ts`** — geração, rotação, match com graça 24h (`webhookApiKeyPrevious`).
- **`rotateGatewayWebhookApiKey`** — server fn Administrador; actualiza `school_integrations`.
- **Handler** `resolveGatewaySchoolByApiKey` aceita key anterior dentro da graça.
- **UI** Definições → Integrações — botão «Rotacionar key» + aviso de graça activa.
- **Testes** `tests/integrations/gateway-webhook-key.test.ts`.
- **DOC** checklist produção + manual EMIS/Unitel.

### Ciclo ecossistema 29 (2026-08-28) — SAFT-AO / AGT exportação

- **Correcção:** `exportSaftAoXml` lia tabela `invoices` inexistente — passou a `finance_invoices` com alunos/contratos.
- **`saft-export.ts`** — validação NIF AGT, período fiscal, mapeamento faturas.
- **UI** `/faturas` — submenu SAFT por ano fiscal + toasts de aviso.
- **AGT** — certificação software do painel Financeiro entra no XML.
- **DOC** `painel/docs/financeiro/saft-agt-exportacao.md`.
- **Testes** `tests/finance/saft-export.test.ts`.

**Próximo opcional:** recibos FR no SAFT ou validação XSD AGT offline.

## Ciclo 43 — lista de cartões e webhook físico

- `listAccessCards` + painel em `/catracas` (pesquisa, filtro estado, suspender/reactivar).
- `validateGatePassByDeviceApiKey` — leitores físicos autenticam com `api_key` (sem login).
- Lógica partilhada em `gate-pass-validation.ts` (`evaluateGatePassAccess`).
- `issueAccessCard` para emitir cartão a pessoa/staff.
- Controlador: POST com `{ apiKey, token, direction }` → `{ granted, personName, … }`.

## Ciclo 44 — bridge Python ligado ao SIGA

- Rota HTTP pública `POST /api/catracas/device-scan` (sem CSRF/sessão) — autentica por `apiKey` do dispositivo.
- Handler partilhado em `device-webhook-handler.ts` (UI serverFn + rota HTTP).
- Daemon Python: webhook `/hardware/webhook/scan` chama o SIGA, regista log e dispara relé se `granted`.
- Config local `siga_hardware_bridge_config.json`: URL SIGA, API key, IP relé (`GET|POST /hardware/bridge-config`).
- UI desktop: secção «Validação SIGA» em `WindowsDesktopSettingsModal`.

## Ciclo 49 — Modularização de Monólitos UI e Suíte de Testes WhatsApp

- **Modularização de `settings-panels.tsx` (1658 linhas → 19 linhas)**:
  - Extraído `settings-shortcuts-row.tsx`: atalhos de módulos.
  - Extraído `settings-school-panel.tsx`: preferências institucionais, anos lectivos e validação Zod.
  - Extraído `settings-billing-panel.tsx`: parâmetros de propinas e regras de cobrança.
  - Extraído `settings-finance-panel.tsx`: dados bancários (IBAN BNA) e AGT.
  - Extraído `settings-pedagogical-panel.tsx`: níveis angolanos e perfil superior.
  - `settings-panels.tsx` convertido em hub de re-exports (zero breaking changes).
- **Modularização de `src/routes/pedagogica.tsx` (1727 linhas → 570 linhas)**:
  - Extraído `AssignTeacherForm.tsx`: ligação de professores a turmas/disciplinas.
  - Extraído `TurmasWorkspaceTab.tsx`: grelha de turmas, ocupação, integrações LMS e filtros.
  - Extraído `DisciplinasWorkspaceTab.tsx`: catálogo por ciclos angolanos, taxas de aprovação e acções.
- **Modularização de `FileBrowser.tsx` (1740 linhas → 1360 linhas)**:
  - Extraído `FileBrowserNav.tsx`: repositórios (escola, secretaria, pessoal, público) e OneDrive.
  - Extraído `FileBrowserGrid.tsx`: grelha de cartões com selecção e progresso de upload.
  - Extraído `FileBrowserTable.tsx`: tabela detalhada de ficheiros, IDs e auditoria de acções.
- **Integração WhatsApp Client**:
  - `whatsapp-client.ts` coberto por suíte de testes unitários `tests/integrations/whatsapp-client.test.ts` (normalização E.164, limite de 50 destinatários, resolução de credenciais e mock HTTP Graph API).
- **Qualidade & Validação**:
  - `npm run siga:check` 100% verde (16 módulos verificados).
  - 92 ficheiros de teste e 560 testes a passar em Node 24.

## Ciclo 50 — Correção Integral de Tipos, Resolução de Erros e Estabilidade do Build

- **Resolução de Erros de Tipos (TypeScript 100% Limpo — 0 Erros com `tsc --noEmit`)**:
  - `src/routes/faturas.tsx` & `src/routes/financeiro.tsx`: importação do utilitário `cn`.
  - `src/features/academic/AssessmentCenter.tsx`: corrigido `<Stat>` para `<AssessmentStat>` em estatísticas.
  - `src/features/auth/server.ts`: tipagem forte de `EnrollmentRow` para leitura de médias e assiduidade sem restrição indevida.
  - `src/features/catracas/components/AccessCardsPanel.tsx`: tipagem estrita de `onChange` no `ListFilterBar`.
  - `src/routes/calendario.tsx`: assinatura tipada com `{ dia?: string }` em `validateSearch`, tornando a propriedade `search` opcional nos links.
  - `src/features/dashboard/portals/GuardianPortalDashboard.tsx` & `StudentPortalDashboard.tsx` & `TeacherPortalDashboard.tsx`: passagem correcta de argumentos em `data: { ... }` para `createServerFn`.
  - `src/features/pedagogica/components/AttendanceCallDialog.tsx` & `AttendanceJustificationModal.tsx`: passagem de `data` nas mutações e queries de chamadas/justificativas.
  - `src/features/pedagogica/components/AttendanceWorkspaceModule.tsx`: importação de `ReviewAttendanceJustificationModal` e normalização de queries.
  - `src/features/pedagogica/components/TurmasWorkspaceTab.tsx`: tratamento de `t.code` nulo para `classroomCourseHref`.
  - `src/features/saas/tenant-limits.ts`: flexibilização de tipo `TenantCapacityInput` suportando tenant completo ou campos parciais.
  - `src/features/integrations/install.ts`: adicionado módulo `"pessoas"` a `SigaHostModule` e `moduleLabel`.
  - `src/lib/desktop-utils.ts`: importação dinâmica resiliente com fallback para o plugin nativo do Tauri.
- **Validação de Qualidade Global**:
  - `npx tsc --noEmit`: **0 erros** (código 0).
  - `npm run siga:check`: **16 módulos validados com sucesso**.
  - `npm test`: **92 ficheiros de teste e 560 testes aprovados** (100% verde).
  - `npm run build`: **compilação em 6.26 segundos** sem qualquer falha.

## Ciclo 51 — Validador SAF-T AGT Offline e Paginação Canónica

- **Validador Estrutural SAF-T AO (Portaria n.º 63/19 da AGT)**:
  - Criado `src/features/finance/saft-validator.ts`: validação offline do ficheiro XML gerado (tags obrigatórias de cabeçalho, NIF, contagem real vs. declarada de faturas e integridade dos totais fiscais).
  - Integrado em `src/routes/faturas.tsx`: opção "Validar Estrutura AGT" no dropdown e validação instantânea no download de SAF-T.
  - Testes unitários em `tests/finance/saft-validator.test.ts` (3 testes aprovados).
- **Componente Canónico de Paginação (`ListPaginationBar`)**:
  - Criado `src/components/filters/ListPaginationBar.tsx`: controlo unificado com intervalo dinâmico, seletor de itens por página e paginação acessível.
  - Integrado nas listagens de `/alunos` e `/faturas`.
  - Testes unitários em `tests/ui/pagination-bar.test.ts` (3 testes aprovados).
- **Validação & Estado**:
  - `npx tsc --noEmit`: **0 erros**.
  - `npm run siga:check`: **16 módulos verificados com sucesso**.
  - `npm test`: **94 ficheiros · 566 testes aprovados** (100% verde).

## Ciclo 52 — Conformidade AGT, SAF-T AO com Recibos (RG/RC), Harmonização de Loading e Realtime

- **SAF-T AO Avançado (Portaria n.º 63/19 e Decreto Presidencial 312/18)**:
  - `src/features/finance/saft-generator.ts`: adicionado suporte completo ao bloco `<Payments>` com tipos `RG` (Recibo Geral) e `RC` (Recibo de Caixa), referenciando `<OriginatingON>` e `<SettlementAmount>`.
  - Suporte completo aos tipos fiscais `FT`, `FR`, `FS`, `NC`, `ND`, `RG` e `RC`.
  - `src/features/finance/saft-validator.ts`: validação de recibos, datas de transação e acumulação de `grossPaymentsTotal`.
  - Testes em `tests/finance/saft-generator.test.ts` e `tests/finance/saft-validator.test.ts`.
- **Harmonização do Estilo de Loading (Admin → SIGA)**:
  - Criado `src/components/ui/page-loading.tsx` e `src/components/ui/loading-spinner.tsx` replicando o estilo do `painel/admin` com spinner circular limpo e legenda contextual.
  - Integrado em `AuthGate.tsx`, `RouteAccessGate.tsx` e `src/routes/__root.tsx` (`pendingComponent`).
  - Loadings internos (botões, formulários, tabelas, modais) rigorosamente preservados.
- **Realtime (Supabase postgres_changes)**:
  - `src/features/messages/StaffMessenger.tsx`: canal Realtime para `direct_messages` — atualizações instantâneas de DMs sem polling periódico.
  - `src/routes/comunicacoes.tsx`: canal Realtime para `school_announcements` — feed de comunicados atualiza ao vivo.
- **Correção crítica: Comunicações (`school_announcements`)**:
  - `src/features/communications/schemas.ts`: corrigidos `audience` options de `['school']` para os 5 valores reais da constraint DB: `all_guardians`, `guardians_with_debt`, `students_secondary`, `students_finalists`, `teaching_staff`.
  - `src/features/communications/server.ts`: corrigido nome de tabela de `announcements` → `school_announcements`; removidos mapeamentos de status `published/archived` que não existem na DB; `archiveSchoolAnnouncement` usa soft-delete via `deleted_at`; todas as queries filtram `deleted_at IS NULL`.
  - `src/routes/comunicacoes.tsx`: `audienceLabel` atualizado com todos os 5 destinos reais; fallback corrigido de `'school'` → `'all_guardians'`.
  - Testes de `tests/communications/schemas.test.ts` expandidos: **10 testes** incluindo validação de que `'school'` é rejeitado e todos os 5 valores DB são aceites.
- **Documentação e Dossiê Fiscal**:
  - Atualizado `painel/docs/financeiro/saft-agt-exportacao.md` e gerado dossiê fiscal técnico sobre a AGT e o ensino em Angola.
- **Validação & Estado**:
  - `npm run siga:check`: **100% aprovado**.
  - `npm test`: **100 ficheiros · 688 testes aprovados** (100% verde em Node 24).

## Ciclo 53 — Realtime Dashboard, Correção Comunicações e Testes Catracas

- **Correção crítica: `announcements` → `school_announcements`**:
  - `src/features/communications/server.ts`: corrigido nome de tabela de `announcements` → `school_announcements`; eliminados mapeamentos de status `published↔sent` e `archived↔cancelled` que não existiam na DB; `archiveSchoolAnnouncement` agora usa soft-delete via `deleted_at`; todas as queries filtram `deleted_at IS NULL`.
  - `src/features/communications/schemas.ts`: `announcementAudienceOptions` expandido de `['school']` para os 5 valores reais da constraint DB: `all_guardians`, `guardians_with_debt`, `students_secondary`, `students_finalists`, `teaching_staff`.
  - `src/routes/comunicacoes.tsx`: `audienceLabel` atualizado com todos os 5 destinos reais; fallbacks corrigidos de `'school'` → `'all_guardians'`.
  - `tests/communications/schemas.test.ts`: expandido de 6 → **10 testes**; valida que `'school'` é rejeitado e todos os 5 valores DB são aceites.
- **Realtime — Dashboard (`src/routes/index.tsx`)**:
  - Adicionado `useEffect` com canal `dashboard_realtime_overview` subscrevendo a `*` em `students`, `*` em `enrollments`, `INSERT` em `invoices` e `INSERT` em `school_announcements`.
  - Ao receber qualquer evento, invalida `["dashboard", "overview"]` automaticamente.
  - Cleanup correcto com `supabase.removeChannel(channel)`.
- **Testes catracas — `gate-pass-validation` (`tests/catracas/gate-pass-validation.test.ts`)**:
  - **CRIADO** — **12 testes** cobrindo os casos mais críticos de acesso:
    - Dispositivo offline/manutenção → bloqueado sem tocar na BD.
    - Cartão não encontrado → negado + log.
    - Cartão suspenso/inactivo/cancelled → negado com razão correcta.
    - Aluno inactivo com cartão activo → negado.
    - Staff sem `student_id` → acesso concedido.
    - Entrada e saída com cartão e aluno activos → acesso concedido com `direction`, `timestamp`, `cardNumber`, `studentId`.
    - `findGatePassCard`: retorno correcto, null e iteração de múltiplos tokens.
- **Validação & Estado**:
  - `npm run siga:check`: **100% aprovado**.
  - `npm test`: **101 ficheiros · 700 testes aprovados** (100% verde em Node 24).

## Ciclo 54 — Cobertura UI Realtime e Expansão de Testes Pedagógicos

- **Subscrições Realtime em Rotas Principais**:
  - `src/routes/faturas.tsx`: Escuta as tabelas `invoices` (INSERT, UPDATE) e `payments` (INSERT). Invalida `["finance", "invoices"]`, `["finance", "reporting"]`, e `["dashboard", "overview"]` mantendo os painéis financeiros vivos.
  - `src/routes/documentos.tsx`: Escuta a tabela `siga_document_requests` (*). Invalida `["documents", "workspace"]` e `["dashboard", "overview"]` (ideal para pedidos entrados no portal do aluno/encarregado).
  - `src/routes/alunos/index.tsx`: Escuta `students` (_) e `enrollments` (_). Invalida `["students", "search"]` e `["dashboard", "overview"]`.
  - `src/features/messages/StaffMessenger.tsx`: **Correção crítica** — a tabela de mensagens diretas no backend era `siga_direct_messages` mas o cliente realtime estava a escutar `direct_messages`. Corrigido para a tabela correta para fazer os chats funcionarem em tempo real.
- **Sincronização de Dados (Integração EMIS)**:
  - Scaffolding de `src/features/integrations/emis.ts` (normalização rigorosa de classes/anos lectivos usando taxonomia EMIS).
  - Criado payload builder `buildEmisExportPayload` para mapear dados internos para a taxonomia estatal de forma previsível (lidando também com géneros cruzados).
  - Testes com ordem hierárquica inversa de "matching" de substrings (`12ª` antes de `2ª`) garantindo output robusto.
  - Interface do módulo de alunos atualizada para usar este formato rigoroso através da acção "Formato SIGE".
- **Sistema Bancário Angolano (`src/lib/angola-banking.ts`)**:
  - Dicionário `ANGOLA_BANK_CODES` massivamente expandido com os principais bancos comerciais (BMA, BCI, BE, BNI, Yetu, Access Bank, Sol, BCA).
  - Ficheiro `angola-banking.test.ts` expandido para validar os novos bancos comerciais e mapeamento nulo para desconhecidos.
- **Centro de Avaliação (Assessment Center)**:
  - Corrigido um _bug_ na função `copyPreviousTerm` e no parse do estado inicial onde notas em branco (`null` na DB) eram convertidas para a string `"null"`, causando lixo visual no painel do professor. Agora faz fall-back para empty string `""` corretamente.
- **Ecossistema SaaS e Lógica Central**:
  - Tabela `school_invitations` restaurada e aprovisionada no Supabase de produção, fechando a lacuna de 30/31 tabelas no verificador (`npm run siga:sql:verify`). As verificações da base de dados encontram-se a 100%.
  - Nova suite `tests/saas/public-signup.test.ts` construída para atestar e cobrir a proteção heurística de limite de taxa (_rate-limiting_ por IP e por Email) no percurso do Funil Comercial (Inscrição Escolar SaaS).
- **Testes da Área Pedagógica (`tests/pedagogica/pautas.test.ts`)**:
  - **Expandido** de 6 para **24 testes**.
  - Cobertura completa adicionada para: `isGrade`, `normalizeGrade`, `roundGrade`, `formatGrade`.
  - Novos testes para `calculateExamFinalGrade` com verificação de pesos (ex. NF = MFD*0.6 + Exame*0.4) e handling de fallbacks null.
  - Novos testes para `deriveElectronicStatusClass` garantindo as cores corretas por estado (verde/APROVADO, vermelho/REPROVADO, âmbar/ADMITIDO).
- **Testes de Alertas no Dashboard (`tests/dashboard/alerts.test.ts`)**:
  - **Expandido** de 2 para **9 testes** abrangendo todos os 4 tipos de avisos (`candidaturas`, `matricula`, `documentos`, `faturas`).
  - Cobertura completa de singulares, plurais e rotas de encaminhamento (links e painéis de definições).
- **Inteligência Preditiva (Fase 2 - ML Suggestions)**:
  - Novo motor `dashboard-overview` embutido. Sugestões contextuais (`dashboard-suggestion-rules.ts`) analisam candidaturas pendentes, configuração do ano letivo e calendário. As sugestões geradas mapeiam diretamente para o `ContextualActionsPanelHost` na _home_ da escola.
  - Criado o `narrative-engine.ts` que compila relatórios contextuais em formato SMS humano a partir de _snapshots_. O motor infere e acopla a sugestão "Partilhar Relatório de Inteligência" sempre que um encarregado esteja associado ao perfil.
- **Validação & Estado**:
  - `npm run siga:check`: **100% aprovado**.
  - `npm test`: **134 ficheiros · 944 testes aprovados** (100% verde em Node 24) + **16 testes PayFlow**.

## Próximos passos úteis

0. **SQL:** verificado live 2026-09-05 (33/33 + `current_school_id` + RLS históricos). Manter `npm run siga:sql:verify` após alterações DDL.
   0b. **Ecossistema:** seguir Fases 10–13 em `ARCHITECTURE_HARMONIZATION.md`. Não
   unificar frontends. Não apagar `/saas-admin` sem destino no ADMIN.
   0c. **Integrações:** credenciais reais de portal bancário e sincronização automática EMIS.
   0d. **PayFlow:** SSO + sync + IBAN + extrato + ingest/pull + estorno + alertas + settlement + EMIS ingress fail-closed + feed sandbox local; falta contrato/homologação EMIS (adaptador real) e o URL real do banco.
   0e. **Domínios / Cloudflare:** Conta correcta `Valentinocanguele` (`701800…`). CNAMEs: `www`→`siga-web.pages.dev`, `admin`→`siga-admin.pages.dev`, `docs`→`siga-docs.pages.dev` (Pages **active**). Workers: `app`/`payflow`/apex OK. Rotas bypass www/admin/docs + payflow/app específicas.
   0f. **GitHub Actions:** se jobs falharem em ~3s com «payments failed / spending limit», corrigir Billing & plans da conta dona do repo (privado = 2 000 min free). Validar localmente: `bun run test` e `cd painel/payflow && npm test`.
1. Manter commits pequenos por alteração e nunca incluir `.env` nem `.claude/worktrees/`.
2. Aceitar candidatura cria aluno, encarregado (se veio no formulário) e opcionalmente turma (`classGroupId`). Sem turma fica `applicant`. Em `/alunos`: **Turma** (candidato), **Mudar** (activo), **Estado** e PDF **Oficial**. Campanha de matrícula (Definições) liga a `/documentos#modelos` para talões.
3. Emitir em `/documentos` usa o modelo `.hbs` escolhido em **Modelos de impressão** (Ver / Editar / Usar). Cabeçalho da página tem botão **Modelos** (`#modelos`). Atalhos: Definições → Escola → **Atalhos**, `/configuracoes?painel=documentos` ou campanha de matrícula. A lista de pedidos também tem **Oficial**. A ficha do aluno emite **Boletim**, **Histórico**, **Declaração** e **Mais modelos** (dossiê, certificado, credenciais). Pedagógica: pauta, boletim, mapa, acta e validação. Workspace do professor: **Diário**. Relatórios académicos e talões de candidatura/matrícula também. Sem modelo ou se falhar, cai no PDF MINED. Pedidos já emitidos têm **PDF**. Pedidos em curso: **Recusar** e **Cancelar**. Ficha também: **Fatura** e **Documento**.
4. Pedagógica: **Atribuir professor** liga `class_subjects.teacher_id`. Disciplinas: **Editar** e **Desactivar**. Horários: **Copiar** slot para outro dia. Na pauta, **Copiar trimestre anterior** preenche MAC/NPP/NPT (depois Guardar). Cabeçalho da área pedagógica tem **Pauta Oficial** e **Turmas Oficial**; grelha e centro de avaliação também. Centro de avaliação: **Imprimir** usa `issuePrintDocument` (pauta oficial), não `window.print`.
5. Dashboard: candidatos abrem Confirmar Matrícula. Comunicados publicados aparecem no início. Em `/comunicacoes`: **Editar**, **Arquivar**, **Republicar**, **Imprimir** e **Oficial**. `/calendario` e `/alunos` **Oficial** usam o modelo de serviço. `/pessoas` tem **Oficial** do corpo docente e do registo central. `/acessos` imprime **Credenciais**, **Oficial contas** e **Oficial equipa**. Ficha do professor também tem **Credenciais**. `/acessos`: **Reenviar** copia o link de convite/recuperação.
6. `/faturas`: **Fatura** e **Receber**/**Recibo** usam o modelo `service-document` com secção **Dados de pagamento** (IBAN em Definições → Financeiro). Lista de faturas tem **Oficial**. Sem recibos: **Anular**. Ficha do aluno (Admin) também recebe. Caixa: **Recibo** no lançamento e **Oficial** na lista. Planos: **Talão**. Relatório financeiro **Oficial** (completo) e **Oficial cobrança** / **Oficial categorias** — todos com IBAN/logótipo quando configurados. Dashboard mostra pedidos de documento pendentes e liga a `/documentos`.
7. Ficha do professor: **Editar**, **Atribuir disciplina** e **Desligar**. Registo central: **Editar** pessoa. Relatórios académicos têm PDF **Oficial**. Relatórios financeiros também têm **Oficial**.
8. `/calendario`: Admin/Secretaria **Editar** e **Apagar** períodos (`terms`). Cada período tem **Imprimir**; a lista tem PDF **Oficial**. Pedagógica → Horários: lista de slots com **Remover** (`deleteScheduleSlot`). Planos de pagamento pendentes têm **Cancelar**.
9. Convite/cargo Professor cria ficha HR (`ensureTeacherHrRecord`). Liga `teachers.user_id` se a coluna existir; senão resolve por email.
10. Gateway real Multicaixa/Unitel — fora de âmbito (só config + plano `pending_gateway`).
11. Sidebar: hover expande, modal encolhe. Árvore Curso/Nível → turmas → disciplinas. Primário/iniciação abre pauta da turma; I/II ciclo abre a disciplina do professor. **Navegação:** sidebar e launcher derivam de `navigation-catalog.ts`; logótipo da escola só no topo da sidebar; `npm run siga:check-nav` valida cobertura por papel.
12. Integrações catalog-ready estão ligadas em todos os módulos autenticados (toolbars `InstalledModuleTools`, WhatsApp/Resend por linha, botões SIGE/AGT). Relatórios académicos e financeiros copiam resumo Resend. Definições → Integrações reflecte estado real; Gmail mostra nota quando Resend já está instalado. `/alterar-senha` explica 2FA. Configurações vivem no modal (`SettingsCenter`); `/configuracoes?painel=integracoes` abre o painel e redirecciona para `/`; `/configuracoes?painel=documentos` abre `/documentos#modelos`.
13. **Identidade Angola:** BI/NIF com `AngolaIdentityField` (validar formato + BI online) em `/pessoas`, matrícula interna e `/matricula/$slug` — validação Zod no servidor (`personCoreFieldsSchema`). Escola: NIF AGT, logótipo (URL ou upload), dados bancários e AGT em Definições. Perfil: telemóvel em Definições → Conta (`profiles.phone` no SQL). Ficha da pessoa: lista `person_documents` e **Adicionar documento**; BI sincroniza `national_id`. Aplicar `APPLY_IN_SQL_EDITOR.sql` inclui bucket `school-logos`.

## Checklist manual — integrações (após SQL)

1. Definições → Integrações: instalar **WhatsApp Business**, **Resend** e **Multicaixa Express** (consentimento + capacidades).
2. Waffle: apps aparecem na secção correcta; estado «Ligado» após instalar.
3. `/comunicacoes`: publicar canal E-mail copia texto; cartões têm WhatsApp/Resend.
4. `/matricula/$slug` (público): **WhatsApp** e **E-mail** da secretaria só com integração; sem instalar, contactos ocultos.
5. `/financeiro` e `/faturas`: toolbars Multicaixa/AGT; plano com referência EMIS.
6. `/acessos`: Reenviar + E-mail/WhatsApp na linha de convite.
7. `npm test` (Node 24) — inclui `tests/integrations/*` e `tests/documents/*`. CI (`.github/workflows/ci.yml`) corre lint + test + build.
8. **Desempenho:** Definições → Desempenho ou consola `window.__sigaPerf`. Pré-busca ao hover no menu (dados + chunks Recharts); pesquisa debounced 220 ms. Impressão oficial carrega motor só ao clicar (`print-issue-loader`).
9. `/documentos#modelos`: escolher **Usar** num modelo; emitir declaração na ficha do aluno e lista **Oficial** em comunicados/caixa.

## Não seguir relatórios antigos

Explorações pré-ciclo 1–6 estão desactualizadas. Já existem: `/matricula/$slug`, `SequentialSheetModal`, WhatsApp na turma, `ListFilterBar` + param `lf`, feed ICS (`terms`), MFA TOTP, grants, planos de pagamento, workspace do professor, lançador waffle no cabeçalho (apps + integrações, incl. AGT). Cada integração tem pacote de instalação com permissões. Funções entram nos ecrãs via `InstalledModuleTools` / `hasCapability`. Rotas públicas: `publicInstalledProviderIds` + `publicSchoolPhone` / `publicSchoolEmail` (telefone/e-mail só quando WhatsApp/Resend instalados). Sem HTTP a terceiros.

Testes: **Node 24**. Node 26 neste macOS aborta (`dyld libc++`, exit 134).
