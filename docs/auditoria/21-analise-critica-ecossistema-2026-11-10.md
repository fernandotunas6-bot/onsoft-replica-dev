# SIGA Plus — Análise crítica do ecossistema (10/11/2026)

Continua a [20](./20-analise-critica-2026-10-26.md) (26/10) e o
[estado do ecossistema de 01/11](./estado-ecossistema-2026-11-01.md). Cobre as cinco apps:
SIGA (raiz), WEB (`painel/web`), ADMIN (`painel/admin`), PAYFLOW (`painel/payflow`) e DOC
(`painel/docs`). Ramo `claude/intelligent-bell-sw3qo4`, base `main` `2a13b02`.

**Sem SQL, sem deploy, sem escritas na produção.** A rede desta sessão não alcança
`portal-siga.com` nem `*.pages.dev`: nada aqui foi medido em produção. Os limites estão no fim.

## Em uma frase

O SIGA é sólido e muito testado, mas tinha um defeito sério no centro: **quem tem 2FA não
conseguia mudar nem recuperar a senha**. À volta dele, WEB, ADMIN e DOC ainda traziam o
modelo de UI de onde nasceram — logótipo de carrinho de compras, formulários que diziam ter
enviado sem enviar nada, 19 páginas de documentação de outro produto — e as quatro apps fora
do Worker do SIGA não enviavam **nenhum** cabeçalho de segurança.

## Linha de base (medida antes de alterar, `main` `2a13b02`)

| App     | Verificação                                              | Resultado                                                                                   |
| ------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| SIGA    | `tsc`, lint, `check:style`, `check:a11y`, módulos, build | Todos passam (tsc 80 s)                                                                     |
| SIGA    | `npm test` (Vitest)                                      | **5 981 ✓, 1 ✗**, 25 ignorados, 843 ficheiros — a falha é um ficheiro gerado desactualizado |
| WEB     | lint, build                                              | 0 erros, 22 avisos; build OK; pedaço `vendor` 590 KB (187 KB gzip)                          |
| ADMIN   | lint, `tsc`, build (exportação estática)                 | 0 erros, 1 aviso; OK                                                                        |
| PAYFLOW | lint, `npm test`                                         | 0 erros, 7 avisos; 60/60                                                                    |
| DOC     | build                                                    | OK — mas com `ignoreDeadLinks: true`, que escondia **12 ligações mortas**                   |

Tamanho: 5 274 ficheiros versionados, 152 rotas e 65 rotas de API no SIGA, 586
`createServerFn`, 848 ficheiros de teste, 272 migrações, 24 workflows.

## Achados e correcções

### P1 — 2FA bloqueava a mudança e a recuperação de senha (SIGA) — corrigido `07bb862`

O Supabase Auth só aceita uma senha nova numa sessão **aal2** quando a conta tem 2FA
verificado ([supabase/auth#1766](https://github.com/supabase/auth/pull/1766)), mesmo que a
confirmação no início de sessão esteja desligada (decisão do proprietário de 27/10). Dois
caminhos davam sessões aal1:

- `/auth/reset-password`: o link de recuperação. A página chamava `updateUser` e mostrava
  só «Não foi possível atualizar a senha». Afecta todos os administradores da plataforma
  (2FA obrigatório) e o pessoal que inscreveu um autenticador.
- `PasswordChangeForm` (Perfil, Definições, primeiro acesso): reautenticava com
  `signInWithPassword`, o que **descia** a sessão a aal1, e o `updateUser` seguinte falhava.

Agora os dois pedem o segundo factor com o `MfaChallenge` que já existia (chave de acesso ou
código), antes de gravar — e também quando é o servidor a recusar com `insufficient_aal`.
Nada fica mais permissivo. Testes: 5 casos novos; os de 2FA falham no código anterior.

### P1 — Sem cabeçalhos de segurança fora do Worker do SIGA — corrigido `b1a0e65`, `86a3ebd`

WEB, ADMIN e DOC (ficheiros estáticos no Cloudflare Pages) e o PayFlow (Worker próprio) não
enviavam HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` nem protecção contra
iframes. A consola da plataforma (login, 2FA, suspensão de escolas) e o checkout do PayFlow
podiam ser embebidos noutro site para enganar cliques, e a consola podia ser indexada.

- Pages: `public/_headers` em cada app (o build copia-o para a saída — verificado em `dist/`
  e `out/`). ADMIN e PayFlow com `DENY`; WEB e DOC com `SAMEORIGIN`. A CSP só define
  `frame-ancestors`: não bloqueia scripts nem estilos.
- PayFlow: `headers()` do `next.config.ts`, tudo menos `/` com `noindex`. Nota técnica: no
  vinext 0.0.50 `/:path*` vira `^/[^/]+.*$` (deixa `/` de fora) e `/:path+` um `+` literal;
  usam-se grupos de regex, como nos exemplos do Next. Testado contra o Worker compilado.

### P2 — Formulários que não fazem nada (WEB) — corrigido `b1a0e65`

- `/auth/forgot-password` era uma página pública com o formulário do modelo: sem acção, em
  inglês («Send Reset Link») e com ligação para
  `/templates/dashboard/shadcn-dashboard-landing-template/…` (404). O WEB não tem contas;
  passa a levar à recuperação de senha do SIGA.
- `/mail` dizia «Pedido registado neste dispositivo» sem enviar nada. Usa agora o formulário
  de contacto real da landing (grava para a equipa no ADMIN ou prepara o e-mail).

### P2 — Recuperação de senha do ADMIN sem saída — corrigido `077f6f2`

O ADMIN chamava `resetPasswordForEmail` com regresso a `/sign-in`, mas não tem nenhuma página
para definir a senha nova (nenhum `updateUser`): chegava o e-mail genérico do Supabase — que
o SIGA proíbe por não ter a marca institucional — e a pessoa voltava ao login sem saída.
Passa a guiar para a recuperação oficial do SIGA (e-mail institucional, link seguro e, com a
correcção P1, o 2FA tratado).

No mesmo commit: o `?next=` do login tinha uma lista de rotas própria que já divergia do
portão (de `/dashboard-2` caía-se em `/tenants`) — agora `safeAdminNext()` sobre a fonte
única; erros do login em português e anunciados a leitores de ecrã; consola `noindex`;
`/landing` deixa de se apresentar como «Modern Admin Dashboard Template»; PayFlow em
duplicado e «Atalhos vivos» na barra lateral.

### P2 — Identidade: o logótipo era o carrinho do modelo — corrigido `5c8d9be`

WEB, ADMIN e DOC usavam como logótipo e favicon o carrinho de compras do modelo
«ShadcnStore» (o SVG do DOC ainda trazia `className='size-7'` de JSX). A marca documentada
no SIGA é o letreiro «SIGA Plus» e o ícone «S» de `public/icons/`. Cada app tem agora a sua
cópia desse ícone em `public/brand/` (sem partilhar componentes entre apps) e favicons
gerados do original de 512 px. O favicon do WEB tinha `href` relativo e falhava em
`/blog/<artigo>`.

Saíram também os ficheiros promocionais do modelo publicados com o site
(`og-image.png` «ShadcnStore», `apps.png`, `dashboard.png` e `customizer.png` de 4320 px,
SVG do Next e da Vercel, um `favicon.png` de 851 KB) e as capturas brutas em
`public/.screenshots-raw/`. WEB `public/` 8,8 → 3,8 MB; ADMIN 5,1 → 2,3 MB.

### P2 — DOC com conteúdo de outro produto — corrigido `608d33a`

- 19 páginas do modelo (`/components`, `/theme-customizer`, `/vite`, `/nextjs`: shadcn/ui,
  «remover o personalizador», pnpm, Vercel, Netlify) saíram; `public/_redirects` leva os
  endereços antigos às páginas vivas.
- O suporte indicava Discord, o GitHub `shadcn-dashboard-template`, Twitter «@SIGA Plus»,
  nove endereços `@portal-siga.com` inventados e testemunhos fictícios («Jane Smith,
  TechCorp»). Agora só `suporte@portal-siga.com` e o formulário do portal.
- A licença descrevia uma «activação de instâncias» que não existe; remete agora para os
  Termos de serviço. Aparência e Contribuir reescritas a partir do código.
- O build falha com ligações mortas (excepções explícitas: localhost e `public/documentos`).
- A página inicial tinha `www.` e `admin.portal-siga.com` escritos à mão enquanto o WEB e o
  ADMIN estão publicados em `*.pages.dev`; segue agora as variáveis do deploy, como o menu.
- `og:image` apontava para um ficheiro inexistente e `og:url` para `https://siga-plus.local`.

### P3 — Testes dependiam da ordem de build — corrigido `cf5e7a4`

`site-pages.generated.json` e `painel/escolas/docs/routes.json` estão versionados mas não
incluíam as páginas `/propinas/` (PR #429): `npm test` sem build falhava. Regenerados. O
comentário de `deploy-production.yml` («não é versionado») está errado — ver pendências.
Também: a cache npm do PayFlow (`.npmrc` com caminho relativo) aparecia por versionar na raiz.

## Resultado depois das correcções

| App     | Verificação                      | Antes                      | Depois                                                 |
| ------- | -------------------------------- | -------------------------- | ------------------------------------------------------ |
| SIGA    | `npm test`                       | 5 981 ✓ / 1 ✗              | **6 014 ✓ / 0 ✗**, 25 ignorados, 848 ficheiros         |
| SIGA    | `tsc`, lint, estilo, a11y, build | OK                         | OK (`tsc` 0 erros; lint 0 erros e os mesmos 61 avisos) |
| WEB     | lint / build                     | 0 erros, 22 avisos / OK    | 0 erros, 22 avisos / OK                                |
| ADMIN   | lint / `tsc` / build             | 0 erros, 1 aviso / OK / OK | 0 erros, **0 avisos** / OK / OK                        |
| PAYFLOW | lint / testes                    | 0 erros, 7 avisos / 60     | 0 erros, 7 avisos / **63/63**                          |
| DOC     | build com ligações verificadas   | 12 mortas (escondidas)     | 0 mortas                                               |

Conferência no Chromium (builds locais): `/mail` com o formulário real, recuperação de senha
do WEB a seguir para o SIGA, entrada e recuperação do ADMIN, cabeçalho do DOC, marca nas três
apps, favicon `image/png` em rota aninhada, sem mensagens do GTM na consola.

## O que fica

### Decisões e acções do proprietário (continuam abertas)

1. **Staging isolado** (Supabase próprio, segredos no ambiente `staging`). Bloqueia o E2E
   autenticado, o Lighthouse das páginas com sessão e qualquer ensaio de RLS. É o maior
   multiplicador de risco, como em 26/10.
2. **Rodar segredos expostos:** a chave `sb_secret_…` colada a 26/10 e o segredo do Google
   OAuth (ver [20](./20-analise-critica-2026-10-26.md)). Sem registo de rotação no repositório.
3. **Domínios `www.`, `admin.` e `docs.portal-siga.com`** nos projectos Pages e, só depois,
   `VITE_*_URL` no deploy. As apps e o DOC já seguem essas variáveis.
4. **Protecção contra palavras-passe vazadas** no Supabase Auth e, na zona Cloudflare, SSL
   Full (strict), TLS mínimo 1.2, Always Use HTTPS e DNSSEC, pela ordem e com os cuidados do
   [handoff de segurança](../agents/HANDOFF_SECURITY_2026-11-02.md).
5. **Contacto de segurança:** publicar `/.well-known/security.txt` e um endereço próprio
   (hoje a DOC indica `suporte@portal-siga.com` com o assunto «Segurança»).
6. **2FA sem recurso:** quem perde o autenticador depende de um administrador para o repor.
   Avaliar códigos de recuperação.

### Engenharia (próximas PRs, por ordem)

1. **CSP do SIGA** continua `Report-Only` com `unsafe-inline`. Tirar scripts em linha ou usar
   _nonces_, e só então passar a obrigatória. Feito a 11/11: o hCaptcha da entrada passou a
   estar na política (sem ele, a CSP obrigatória impedia todas as entradas por senha) e o
   website escolar tem política própria. Antes de a tornar obrigatória, ler os relatórios
   `[csp]` dos logs do Worker durante alguns dias.
2. **Ficheiros gerados:** decidir se `site-pages.generated.json` deixa de ser versionado (e o
   teste o gera) ou se fica com um teste de coerência; corrigir o comentário do
   `deploy-production.yml`.
3. ~~Restos do modelo em código-fonte~~ — feito a 11/11 (ver «Continuação»). Fica o nome
   do pacote da raiz, `tanstack_start_ts`: confirmar antes se o nome do Worker deriva dele.
4. ~~WEB: pedaço `vendor` de 590 KB~~ e ~~imagem de partilha com a marca~~ — feitos a 11/11.
5. **Monólitos do SIGA** acima de 2 000 linhas: `finance/server.ts` (3 298),
   `higher-ed/server.ts` (3 238), `academic/server-legacy.ts` (2 348), `arquivos/server.ts`
   (2 192), `alunos/$studentId.tsx` (2 166). Partir por responsabilidade quando se tocar neles.
6. **PayFlow/vinext:** a semântica de padrões do vinext difere do Next em `/:path*` e
   `/:path+`. Qualquer `redirects`/`rewrites` novo deve ter teste contra o Worker compilado.
7. **Raiz do repositório:** `all_migrations_combined.sql` (141 KB), `logo.png` de 1 MB,
   `metadata.json` (AI Studio), `modelo de pautas/` (com espaços). Mover ou retirar depois
   de confirmar que nenhum script os usa.
8. **Chaves das catracas em texto simples** (`siga_turnstile_devices.api_key`, comparada com
   `.eq("api_key", …)`). A tabela já só é lida pelo servidor; guardar apenas o resumo
   SHA-256 protege as chaves se a base for exposta. Exige migração revista
   ([regras da base](../agents/DATABASE_RULES.md)); as catracas não precisam de chave nova.
9. **Funções do servidor (`/_serverFn`)** lêem o corpo dentro do TanStack Start, sem limite.
   A importação aceita 25 MB (≈ 35 MB em base64): medir os maiores carregamentos legítimos
   antes de fixar um tecto global.

## Continuação — 11/11/2026

**Publicação.** A PR #438 entrou na `main` como `01a21be` e foi publicada pelo «Deploy
produção» (run 42882698702, 19:11–19:21 UTC): verificação (tipos, lint, testes), as 5 apps
(DOC, WEB, ADMIN, PayFlow + D1, SIGA), DNS e serviços a responder. A seguinte (#325, run 42883125056) também passou. Auditoria pós-publicação (somente leitura) verde nas duas; a
vigilância de 11/11 02:14 UTC confirma a produção igual à `main` (`3a0cb75`).

**WEB — primeira visita mais leve (`7369c7f`).** Só a landing vai no pacote de entrada; as
outras páginas e o formulário de contacto (o único com `react-hook-form` e `zod`) carregam à
parte; React e o router num pedaço próprio. O build acrescenta ao `_headers` um
`Link: rel=modulepreload` para `/start` e `/pricing`. Medido com 4G lento e CPU 4× (mediana
de 5, servidor local com gzip e o `_headers` como o Pages):

| Página     | FCP antes → depois | LCP antes → depois |
| ---------- | ------------------ | ------------------ |
| `/`        | 2 548 → 1 924 ms   | 2 548 → 1 924 ms   |
| `/pricing` | 2 288 → 1 544 ms   | 2 288 → 1 964 ms   |
| `/start`   | 2 344 → 1 876 ms   | 2 344 → 2 304 ms   |

JS no caminho crítico de `/`: 787 → 492 KB (243 → 158 KB gzip).

**Dois defeitos anteriores encontrados ao medir:**

- **Âncoras da landing (`7369c7f`).** «Contacto» na barra vindo de outra página e o
  endereço `/#contact` deixavam a pessoa no topo; `#pricing` e `#features` caíam ao lado,
  porque o `content-visibility` muda a posição das secções enquanto se desce.
  `scrollToSection()` corrige até a secção ficar no topo (0 px em computador e telemóvel).
- **Pontes do WEB (`a6a550c`).** `/settings`, `/settings/billing` e `/auth/sign-up*`
  passavam um endereço absoluto ao `<Navigate>` do React Router, que o trata como caminho
  relativo: em produção iam para `/settings/https:/siga-web.pages.dev/pricing` (404).

**Restos do modelo (`a6a550c`, `d08889a`, `b0eb489`).** WEB e ADMIN: os endereços herdados
passam a ser sempre pontes; saem as páginas de demonstração, a flag `SHOW_TEMPLATE_SURFACES`,
o «Atualizar para Pro» do ADMIN e 188 ficheiros que nenhuma entrada alcançava (análise de
imports). ADMIN `public/` 2,3 MB → 28 KB. Pacotes `siga-plus-web` e `siga-plus-admin`; sai o
`pnpm-lock.yaml` do WEB, que nenhum script usava. Avisos de lint: WEB 22 → 15, ADMIN 1 → 0.

## Continuação — 11/11/2026, segundo lote

**Publicação da #440 (`e90dabb`).** «Deploy produção» run 42971698098: verificação, as 5
apps, DNS e serviços (publicação 06:27–06:29 UTC); auditoria pós-publicação verde (run
42972753681); Lighthouse verde. O CI da `main` (run 42971698027) ficou vermelho num só
passo, o smoke E2E em Python: «WEB /start: heading «Criar a sua escola» não visível». O
script olhava uma vez para o título logo após o `domcontentloaded`; desde a #440, `/start`
chega num pedaço à parte e o título aparece 0,7–0,9 s depois (medido no servidor de
desenvolvimento, como no CI). O teste TS equivalente espera e passou. Corrigido em
`ba71366` (espera até 15 s); com o próprio script contra o WEB local, a versão da `main`
reproduz a falha e a corrigida passa. A página não mudou.

**Marca nas pré-visualizações (`191d130`, `cad54b4`).** Imagem de partilha 1200×630 do
SIGA Plus no SIGA, no WEB e no DOC, com endereço absoluto (o WhatsApp e o LinkedIn não
aceitam relativos). No SIGA, «Portal de Gestão Escolar» e «Dashboard · SIGA — Gestão
Escolar» passam a «SIGA Plus — Gestão escolar» e «Início · SIGA Plus».

**DOC — páginas de segurança (`3627b04`, `1c1de40`).** «Segurança de rotas» e
«Endurecimento de segurança» reescritas a partir do código. A segunda mostrava SQL de
tabelas que não existem, uma CSP activa com um domínio inventado, cookies `HttpOnly` com
`SameSite=Strict` (a sessão vive num cookie legível, `SameSite=Lax`), senhas de 10
caracteres (são 8), catracas com HMAC e nonce, e uma checklist toda marcada.
`tests/saas/docs-security-pages.test.ts` prende cada número à constante de onde vem.

**API — limite de tamanho do corpo (`c3ed924`).** 31 rotas de `src/routes/api` liam o
corpo sem limite, quase todas antes de verificar chave, assinatura ou sessão. Com 128 MB por
Worker e corpos aceites até 100 MB, um pedido bastava para esgotar a memória do isolado.

| Tipo de pedido                                              | Limite   |
| ----------------------------------------------------------- | -------- |
| Códigos do registo, catracas, notificações e presença (app) | 16 KB    |
| Formulários, consola, app (lista de uma turma incluída)     | 256 KB   |
| Artigo do blog (60 000 caracteres)                          | 512 KB   |
| Avisos de pagamentos, e-mail e SMS                          | 1 MB     |
| Avisos da Meta (WhatsApp)                                   | 3 MB     |
| Entrega de trabalho na app (anexo de 5 MB em base64)        | ≈ 6,9 MB |

Os webhooks continuam a receber o texto exacto, para a assinatura cobrir os mesmos bytes.
`tests/security/api-body-limits.test.ts` impede leituras sem limite em `src/routes/api`.

**Website escolar — restos da hospedagem de autoria (`83ca75a`).** O modelo de
`painel/escolas` foi escrito numa hospedagem com login ChatGPT. Nas páginas que o SIGA serve
às escolas, o «Terminar sessão» das 9 páginas do portal de demonstração ia para
`/signout-with-chatgpt` (404) e a privacidade dizia que «o login com ChatGPT é tratado pela
hospedagem Sites». O `check.mjs` deixava passar essas ligações sem verificar o destino.
Corrigido no gerador. As chaves do editor não mudam; a versão anterior do modelo entra na
lista de versões compatíveis, para as edições e publicações das escolas se manterem.

**Verificado neste lote:** suite completa (6045 testes, 850 ficheiros), `tsc`, lint (0
erros), `check:style`, build do SIGA e do DOC (sem ligações mortas).

## Continuação — 11/11/2026, terceiro lote

**Publicação da #441 (`9548301`).** «Deploy produção» run 43025337038: verificação, as 5
apps (13:07–13:09 UTC), DNS e serviços; «Publicar website escolar ISPAB» verde (o Pages
`siga-ispab` já tem o «Terminar sessão» e a privacidade corrigidos).

**CSP — dois achados medidos em Chromium com a política real (`eed1189`, `6e5ed7b`).**

- **hCaptcha fora da política.** A entrada por senha carrega `js.hcaptcha.com` (o Supabase
  exige o captcha), e a CSP não o tinha em directiva nenhuma. Em modo de relatório gerava um
  relatório por visita à entrada; com a CSP obrigatória, o captcha não carregava e ninguém
  entrava por senha. Acrescentado a `script-src`, `style-src`, `frame-src` e `connect-src`,
  como a documentação do hCaptcha pede. `tests/security/csp-external-scripts.test.ts` obriga
  cada script externo que o código injecta a passar no `script-src`.
- **Website escolar: 9 relatórios por página vista.** O modelo carrega DM Sans e Manrope do
  Google Fonts, e as páginas levavam a política do SIGA: 63 relatórios em 7 visitas, cada um
  um pedido ao Worker. O website tem agora política própria (a do SIGA mais
  `fonts.googleapis.com` e `fonts.gstatic.com`): 0 relatórios. A política do SIGA não muda.

Alternativa a ponderar pelo proprietário: servir as duas letras a partir do próprio site, como
o SIGA faz com a Inter. Tira os pedidos ao Google (privacidade dos visitantes, menos duas
ligações) e muda o texto da privacidade («O site carrega fontes do Google Fonts»).

## Limites desta análise

- **Sem rede para produção:** nenhum pedido a `portal-siga.com` ou `*.pages.dev`. Os
  cabeçalhos foram verificados nas saídas de build e no Worker compilado do PayFlow, não nas
  respostas reais da Cloudflare.
- **A regra aal2 do Supabase** está confirmada pela PR #1766 do `supabase/auth` e por relatos
  da comunidade, não por um ensaio contra o projecto SGA. Os testes usam o cliente simulado.
- **Nenhum fluxo autenticado no browser:** sem staging nem conta de teste. A conferência
  visual foi feita em builds locais sem sessão.
- **Sem acesso ao Supabase nem à Cloudflare:** nada sobre RLS, Advisor, DNS ou WAF foi
  reverificado; os números dessas áreas são os do handoff de 02/11.
