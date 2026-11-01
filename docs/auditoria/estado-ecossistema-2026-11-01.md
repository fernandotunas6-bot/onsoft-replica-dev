# Estado do ecossistema — 01/11/2026

Auditoria só de leitura (sem escritas na produção, sem deploy manual), feita a partir do
GitHub Actions, do Cloudflare (lista de Workers) e do Supabase `Sga`
(`xodgfmxiaunpamctfeea`). A rede desta sessão não alcança `portal-siga.com`, por isso os
estados HTTP abaixo vêm dos workflows de 31/10, não de pedidos directos.

## 1. Os cinco destinos Cloudflare

Fonte: «Deploy produção», execução `41195644449` (31/10, 11:14–11:18 UTC) e «Auditoria
pós-publicação» `41196336856`. A vigilância de 01/11 06:49 UTC confirma `x-siga-release`
igual à `main` (`b38509db`, sem `-dirty`).

| App     | Destino                                                            | Versão publicada                | Verificação                                                                 |
| ------- | ------------------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------- |
| SIGA    | Worker `fernandotunas6-bot-onsoft-replica-dev` → `portal-siga.com` | `b38509db` (versão `637ffaa1…`) | HTTP 200; sessão, métricas, domínios e subscrições anónimas recusadas (401) |
| PAYFLOW | Worker `siga-plus-payflow` → `payflow.portal-siga.com`             | `b38509db` + migrações D1       | `/api/v1/health` `ok`, base de dados 139 ms                                 |
| WEB     | Pages `siga-web` → `siga-web.pages.dev`                            | `b38509db`                      | entrada 200; `/start` 200                                                   |
| ADMIN   | Pages `siga-admin` → `siga-admin.pages.dev`                        | `b38509db`                      | entrada 302 (portão de sessão)                                              |
| DOC     | Pages `siga-docs` → `siga-docs.pages.dev`                          | `b38509db`                      | 200                                                                         |

DNS: raiz, `app` e `*.portal-siga.com` resolvem (Cloudflare).

### Achados

1. **WEB, ADMIN e DOC publicam-se só em `*.pages.dev`.** O SIGA aponta para eles por
   `VITE_WEB_URL`, `VITE_ADMIN_URL` e `VITE_DOCS_URL`, enquanto o padrão de
   `platform-domain.ts` e do ADMIN é `www.`, `admin.` e `docs.portal-siga.com`. Para
   padronizar: ligar esses domínios personalizados aos projectos Pages (Cloudflare →
   Pages → Custom domains) e só depois trocar as três variáveis no deploy. Decisão e
   acção do proprietário.
2. **PayFlow em produção sem integração:** o health diz `provider: unconfigured`,
   `ssoConfigured: false`, `sigaSettlementConfigured: false`, `sigaUrl: null`. O
   PayFlow responde, mas ainda não cobra nem liquida no SIGA. Esperado enquanto não
   houver fornecedor homologado (fecha de forma segura), mas convém estar escrito na
   página de estado.
3. **Workers fora dos cinco destinos:** `tanstack-start-ts` (parado desde 16/08),
   `medusadev-preview` (criado 31/10), `siga-yft` (app móvel do estudo) e
   `siga-plus-mobile-v4-domain` (`m.portal-siga.com`). Confirmar com o proprietário se
   `tanstack-start-ts` e `medusadev-preview` podem ser retirados; não apagar sem
   confirmação.
4. **CI da `main`:** só o Lighthouse falha (desempenho 0,71–0,83 abaixo de 0,9; FCP > 2 s
   em 6 de 7 páginas). O deploy não depende desse job.

## 2. Função e dever de gestão de cada aplicação

| App         | Função                | Dever de gestão                                                                                                                                                 | Quem entra                        |
| ----------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **WEB**     | Vende                 | Apresentar, preços, demo e **criar a escola** (wizard `/start`). Termina a mostrar o próximo passo.                                                             | Visitantes                        |
| **ADMIN**   | Controla a plataforma | Tenants, planos, cobrança SaaS, domínios, registos e acesso do administrador de cada escola. Não gere alunos nem propinas.                                      | Só `platform_admins`              |
| **SIGA**    | Trabalha              | Operação da escola. O Administrador da escola configura-a em `/configuracoes/inicio` e gere plano e endereços em `/configuracoes/assinatura` (área do cliente). | Equipa, alunos, encarregados      |
| **PAYFLOW** | Cobra                 | Pagamentos, recibos e reconciliação; liquida no SIGA sem duplicar a verdade escolar.                                                                            | Pagadores; equipa via SSO do SIGA |
| **DOC**     | Explica               | Manuais e referência técnica, ligados a partir das outras apps.                                                                                                 | Público                           |

O Administrador **da escola** (cargo no SIGA) nunca entra no ADMIN da plataforma: o seu
«painel administrativo» é o SIGA da escola (ver §6 da
[arquitectura](../agents/ARCHITECTURE_HARMONIZATION.md)).

## 3. Jornada de uma escola nova e ligações

```text
WEB /start ──criar──▶ 1.º SIGA /configuracoes/inicio   (painel administrativo: configurar)
                       │   «A escola na internet»: website + portal + «Entrar na escola»
                       ▼
                   2.º SIGA /portal                     (entrar na escola)

Área do cliente: SIGA /configuracoes/assinatura → «Endereço da escola»: website, portal, domínios
Plataforma:      ADMIN /tenants e /tenants/escola → «Website da escola» e «Portal SIGA Plus»
```

| Ligação           | Endereço (subdomínio)                                 | Regra                                                                |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| Website da escola | `https://<slug>.portal-siga.com/`                     | O Worker serve o website na raiz do subdomínio (`schoolSiteRequest`) |
| Portal SIGA Plus  | `https://<slug>.portal-siga.com/portal?escola=<slug>` | `/portal` não é website: vai para o SIGA da escola                   |
| Domínio próprio   | domínio verificado da escola                          | `schoolSiteLinks` prefere-o ao subdomínio na área do cliente         |

Correcção incluída: no ADMIN, «Abrir no SIGA» apontava para a raiz do subdomínio, que é o
website público, não o SIGA. Passa a haver duas ligações explícitas: «Website da escola» e
«Portal SIGA Plus».

## 3a. E-inscrição: website → formulário oficial (trabalho do Codex, 20–22/10)

O que o Codex deixou (#196 e commits de 20–22/10) está correcto na segurança: a API
`/api/public/school-website/$slug` valida a origem (`SIGA_SCHOOL_WEBSITE_ORIGINS`), o
tamanho do pedido (16 KB) e o ritmo (10 por hora e IP), recusa `school_id`/`tenant_id`
vindos do cliente, reutiliza a validação e a numeração oficial (`CAND-…`) e não expõe
erros. O formulário do modelo (`/candidatura/`) é de demonstração: guarda no navegador e
nunca envia — por desenho, não se liga o POST real a um formulário de simulação.

**Defeito encontrado (produção, só leitura, 01/11):** o site só levava ao formulário
oficial quando o Administrador escolhia a campanha no editor. Nenhuma escola o tinha feito:

| Escola                        | Campanha                                | Aberta               | Website                       | Campanha no site | Efeito antes                                              |
| ----------------------------- | --------------------------------------- | -------------------- | ----------------------------- | ---------------- | --------------------------------------------------------- |
| ISPAB (`minha-escola`)        | `escola-de-demonstracao-siga-matricula` | sim (7 candidaturas) | publicado, modelo completo    | vazia            | `/candidatura/` mostrava o formulário **de demonstração** |
| ISPAB (Demonstração, `ispab`) | `ispab`                                 | não                  | publicado                     | vazia            | idem                                                      |
| Epatulokko, Portal, Ekovongo  | uma cada                                | sim                  | não publicado (só identidade) | —                | sem caminho do site para a inscrição                      |

**Correcção (este ramo):** `resolveSchoolAdmissions` é a regra única para o site e para a
API de conteúdos — a campanha escolhida, ou, sem escolha, a única aberta da escola
(nunca apagada; escola que pode receber candidaturas, a mesma condição do formulário).
`/candidatura/` responde com 302 para `/matricula/<campanha>` no servidor, também nas
escolas só com identidade; sem campanha aberta, «Candidaturas encerradas» (ou 404 fora do
âmbito). O painel da escola (assistente e Assinatura) mostra «Inscrições online» ao lado do
website e do portal. Nenhum dado da produção foi alterado.

**Fica de fora:** o website estático `siga-ispab` (Pages, `painel/escolas`) tem
`contentUrl` vazio e aponta para a escola de demonstração; continua demonstrativo até o
proprietário decidir ligá-lo à escola real (`school.config.json`) e validar.

## 4. Base de dados

Migrações e diferenças de registo: ver a issue #420 (actualizada a 01/11). Avisos do
Supabase: 90 tabelas só de servidor (RLS sem políticas, sem permissões para
`anon`/`authenticated` nas duas novas verificadas), 18 funções `SECURITY DEFINER`
auxiliares do RLS e **protecção contra palavras-passe vazadas desligada** (Auth → definições;
acção do proprietário).

## 4a. APIs públicas e da plataforma (build compilado, sem sessão)

Ensaio no build `node-server` local, sem sessão nem escritas, com a URL e a chave
publicável do Supabase:

- **Móveis (`/api/mobile/*`, 9 rotas):** todas recusam sem sessão (401). A classe de
  defeito de 27/10 («Server function info not found») não se repete.
- **Plataforma (`/api/saas/*`, 39 rotas):** leituras e escritas de administração
  respondem 401 sem sessão. As rotas públicas por desenho (planos, catálogo, verificação de
  subdomínio, signup, site WEB) não expõem dados privados.
- **Dinheiro e acessos:** confirmação do gateway (HMAC), liquidação PayFlow (chave
  comparada em tempo constante), AppyPay, catracas (chave do dispositivo e limites) e
  calendário ICS (token) protegidos.

Menores (sem dados expostos):

1. Várias rotas validam o corpo antes da sessão: sem sessão, um POST malformado recebe
   400/422 com os nomes dos campos em vez de 401.
2. Método não suportado numa rota `/api` (ex.: `POST /api/mobile/agenda`) devolve a página
   HTML com 200 em vez de 405.
3. `/api/finance/payflow/settlement` limita tentativas só em memória (por instância do
   Worker); as catracas e o website usam o limitador partilhado.

## 4b. Dependências dos painéis (o CI audita só a raiz)

`npm audit --omit=dev` a 01/11 (a raiz está limpa com `bun audit`):

| Painel  | Alta/crítica                                                    | Relevância                                                                                                                                                                    |
| ------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PAYFLOW | `next` 16.3.6 (crítica), `zod` 3.25.76, `source-map-js`         | **zod** é real: 13 endpoints lêem JSON sem limite de tamanho e o aviso é esgotamento de memória com colecções grandes. `next` é usado via Vinext, sem `use cache`/Draft Mode. |
| ADMIN   | `next` 16.3.6 (crítica), `zod` <4.6.6, `source-map-js`          | Exportação estática: o defeito do Next é do servidor e não corre em produção.                                                                                                 |
| WEB     | `vite` 7.3 (launch-editor, Windows/dev), `zod`, `source-map-js` | Só cliente/compilação.                                                                                                                                                        |
| DOC     | `source-map-js`                                                 | Só compilação.                                                                                                                                                                |

Recomendação: limite de corpo nos endpoints PayFlow e `zod` 4.6.7 (mudança major no
PayFlow, com testes); `next` 16.4.3 e `zod` 4.6.7 no ADMIN/WEB; acrescentar os painéis
ao job «Auditoria de dependências».

## 4c. Issues que parecem resolvidas

#181 e #195 (token Cloudflare): o deploy passa desde 30/10. #202 (avisos altos de MCP e
`launch-editor`): overrides na raiz e `bun audit` limpo. #204 (publicar `siga-ispab`): o
workflow publicou a 31/10; o HTTPS do domínio fica por confirmar. Fechar só com a
decisão do proprietário.

## 4d. Storage e desempenho da base

- **Storage (6 buckets):** `school-logos` é público para leitura; escrever exige
  `school_logo_folder_ok` (secretaria/direcção da escola activa, pasta da própria escola ou
  tenant). `avatars`: lê o próprio ou colegas da mesma escola; escreve só o próprio.
  `siga-files`, `school-private` e `school-exports`: privados, por escola. `billing-proofs`:
  sem políticas (só servidor). Sem achados.
- **Alertas de desempenho (lidos na íntegra):** só informativos: 227 chaves estrangeiras sem
  índice e 212 índices nunca usados. Avaliar por tabela com volume; não criar nem apagar
  índices em massa.

## 4e. PRs abertas (34) contra a `main` actual

Fusão de ensaio local (`git merge-tree`, sem alterar nada) contra `d3c3f154`:

| Grupo                        | PRs                                                                                     | Estado                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Fundem limpo                 | #325 (1 commit), #342 (docs), #403 (CI, 3 ficheiros), #405, #408                        | #403, #405 e #408 são rascunhos à espera de QA/staging                                   |
| Conflito leve, recentes      | #421 (1), #423 (2), #424 (1), #404 (1), #392 (3, base noutro ramo)                      | Merge da `main` e CI; #421/#423 são de acessibilidade                                    |
| Conflito médio               | #275, #277, #291, #338, #339, #375, #345 (18)                                           | Rever uma a uma; #345 integra trabalho da #338                                           |
| Antigas, > 900 commits atrás | #35, #116, #119, #128, #130, #132, #133, #136, #154, #200, #205, #206, #210, #211, #212 | 4–116 ficheiros em conflito; recriar a partir da `main` só o que ainda faltar, ou fechar |

O `git cherry` só reconhece como já integrados 2 commits da #392 e 3 da #136: as fusões por
squash escondem duplicações, por isso «em conflito» não prova que o trabalho falta na `main`.

## 4f. Segredos, Edge Functions e privilégios da base

- **Segredos no repositório:** sem chaves Supabase (`sb_secret_`, `service_role`),
  Cloudflare, GitHub, Slack, AWS, Resend, Stripe ou chaves privadas nos ficheiros
  versionados; os quatro `.env*` são exemplos com marcadores; sem `.pem`, keystores ou JSON
  de credenciais. O histórico antigo não foi varrido (clone parcial).
- **Edge Functions:** só `bbb-classroom`, igual no repositório e na produção;
  `verify_jwt` ligado, origens permitidas, membership activa da escola pedida e papel lido
  no servidor.
- **Tabelas sem RLS acessíveis à API:** nenhuma (`public`, `private`,
  `academic_evidence`, incluindo vistas).
- **`SECURITY DEFINER`:** 140 funções (40 `public`, 100 `private`), todas com
  `search_path` fixo; nenhuma executável por `anon`.
- **Esquema `private`:** `authenticated` executa 60 funções auxiliares usadas pelas
  políticas RLS, mas não lê nenhuma tabela; `anon` sem acesso.

## 4g. Isolamento entre escolas nos dados

- As ligações entre tabelas escolares são, na maioria, compostas com `school_id`
  (`(school_id, x_id)`), e a própria base impede apontar para outra escola.
- Nas ligações simples (só pelo `id`) entre tabelas que têm `school_id` — lista de espera,
  RH, presenças, chat, ficheiros, tarefas, exames, entre outras — contou-se, na produção a
  01/11, quantas linhas apontam para um pai de outra escola: **nenhuma**.
- A contagem correu num bloco `DO` com uma tabela temporária de sessão para devolver o
  resultado; não alterou dados nem estrutura.

## 4h. Uso real e qualidade dos dados (produção, 01/11)

| Escola (tenant)                            | Estado                | Alunos | Professores | Turmas | Notas | Facturas | Contas |
| ------------------------------------------ | --------------------- | ------ | ----------- | ------ | ----- | -------- | ------ |
| ISPAB (`minha-escola`)                     | activa, paga          | 72     | 12          | 235    | 189   | 6        | 9      |
| ISPAB Demonstração (`ispab`)               | trial                 | 0      | 0           | 0      | 0     | 0        | 2      |
| Epatulokko, Colégio Ekovongo, Portal       | trial                 | 0      | 0           | 0      | 0     | 0        | 1–2    |
| `siga-plus-web-production-falhou-986ba240` | `provisioning_failed` | 0      | 0           | 0      | 0     | 0        | 0      |

- **Uma escola em uso real.** As 48 escolas de 21/10 foram limpas; ficam 6.
- **Financeiro:** 6 facturas (3 pagas, 2 em aberto, 1 anulada) e 3 recibos, todos coerentes
  (pagas cobertas por recibos, nenhuma recebida a mais). Sem cobranças no gateway, sem
  sessões de caixa e sem despesas: o módulo ainda não está em uso diário.
- **Turmas do ISPAB:** 235 turmas para 72 alunos, só 4 com alunos. A 22/10, às 16:31 e
  16:33, foram aplicados dois modelos de estrutura académica; o segundo era de todos os
  níveis (5 níveis, 73 classes, do infantil ao médio) e criou 192 turmas, como
  «5º Ano EINF A — Tarde», num instituto superior. Há ainda 12 turmas «DEMO —» de 08/10. O
  modelo é idempotente (a terceira aplicação, a 29/10, não criou nada); não é defeito, é
  um modelo inadequado ao tipo de escola. **Decisão do proprietário:** arquivar as turmas
  vazias e as «DEMO», e se o assistente deve propor só os níveis do tipo de instituição.
- **Tenant órfão:** `siga-plus-web-production-falhou-986ba240` em `provisioning_failed`,
  sem dados nem contas. Pode ser removido pelo ADMIN.

## 5. Pendências do proprietário

- Domínios personalizados `www.`, `admin.` e `docs.portal-siga.com` nos projectos Pages.
- Ligar a protecção contra palavras-passe vazadas no Supabase Auth.
- Trocar a chave `sb_secret_…` exposta a 26/10 (ver `CONTINUE.md`).
- Decidir sobre os Workers `tanstack-start-ts` e `medusadev-preview`.
- Staging isolado (issues #249 e #420).
