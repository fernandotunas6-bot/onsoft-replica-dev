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

## 5. Pendências do proprietário

- Domínios personalizados `www.`, `admin.` e `docs.portal-siga.com` nos projectos Pages.
- Ligar a protecção contra palavras-passe vazadas no Supabase Auth.
- Trocar a chave `sb_secret_…` exposta a 26/10 (ver `CONTINUE.md`).
- Decidir sobre os Workers `tanstack-start-ts` e `medusadev-preview`.
- Staging isolado (issues #249 e #420).
