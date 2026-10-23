# Estado do ecossistema SIGA — 21/10/2026

Varredura completa: repositório, portões de CI, publicação, domínios, base de dados.
Commit verificado: `300ff2f0`. Tudo abaixo foi medido, não inferido.

## O bloqueio central: nada é publicado desde 12/10

O token da Cloudflare continua inválido. Erro exacto nos registos de hoje:

```
A request to the Cloudflare API (/accounts) failed.
  Invalid access token [code: 9109]
  Authentication error [code: 10000]
```

Isto derruba **toda** a publicação, não só uma app. O passo
«Publicar (DOC, WEB, ADMIN, PAYFLOW + D1, SIGA)» morre no primeiro alvo
(`siga-docs`) e o workflow do website do ISPAB falha no mesmo ponto.

Confirmação do lado da Cloudflare (via API, com um token válido):

| Worker | Última modificação |
|---|---|
| `fernandotunas6-bot-onsoft-replica-dev` (portal) | 2026-10-12 17:39 |
| `siga-plus-payflow` | 2026-10-12 17:38 |
| `siga-yft` | 2026-10-14 15:48 |

**A produção corre código de 12 de Outubro.** São 9 dias e cerca de 20 PRs
fundidos que nunca chegaram aos utilizadores.

O PR #207 («a publicação do ISPAB não encontrava o bun») corrigiu um problema
real mas a montante do verdadeiro: o bun já é encontrado, o token é que é
recusado logo a seguir.

### Correcção (precisa das credenciais do dono da conta)
1. Criar um token novo na Cloudflare com `Account > Cloudflare Pages > Edit`,
   `Account > Workers Scripts > Edit` e `Account > D1 > Edit`.
2. Actualizar o segredo `CLOUDFLARE_API_TOKEN` do repositório.
3. Reexecutar «Deploy produção» e «Publicar website escolar ISPAB».

## Os websites escolares não estão vivos — e o 200 engana

Todos os domínios respondem, o que dá a impressão de estarem servidos:

| Domínio | Código |
|---|---|
| `portal-siga.com` | 200 |
| `www.portal-siga.com` | 200 |
| `admin.portal-siga.com` | 302 (redirecção de sessão, normal) |
| `m.portal-siga.com` | 200 |
| `payflow.portal-siga.com` | 200 |
| `ispab.portal-siga.com` | 200 |
| `escolas.portal-siga.com` | 200 |
| `siga-ispab.pages.dev` | 522 |

Mas o conteúdo desmente o código. `ispab.` e `escolas.` devolvem
`<title>Dashboard · SIGA — Gestão Escolar</title>` — exactamente a mesma página
do portal. O wildcard de `portal-siga.com` apanha qualquer subdomínio, por isso
um website escolar inexistente responde 200 em vez de falhar. O 522 em
`siga-ispab.pages.dev` é o sinal verdadeiro: o projecto Pages não tem
publicação.

Duas camadas por cima disto, ambas vazias:
- `painel/escolas` compila bem (66 páginas, 18 cursos) — só não é publicado.
- As tabelas de conteúdo em produção estão a zero: `web_school_showcase` 0
  linhas, `web_blog_posts` 0 linhas. Mesmo com o token corrigido, o website
  configurável não tem nada para servir.

## Portões de qualidade: verdes

| Portão | Resultado |
|---|---|
| CI em `300ff2f0` | sucesso |
| `tsc --noEmit` | limpo |
| `eslint .` | 0 erros, 47 avisos (`react-refresh`, `no-explicit-any`) |
| Build app principal (vite + nitro) | sucesso |
| Build `painel/escolas` | sucesso |
| Build `painel/web` | sucesso |
| Build `painel/admin` (next) | sucesso |

`prettier --check` acusa 11 ficheiros, mas o prettier só corre no workflow
`academic-import-check` e este passa — não é portão da fusão. Dos 11, a maioria
é gerada (`types.ts`, `PRODUCTION_SNAPSHOT.json`, `site-pages.generated.json`),
pelo que formatá-los à força é ruído.

A suite de testes **não** foi corrida localmente: um teste lê o `.env` do disco
e escreve na produção. Os testes verificados são os do CI.

## Base de dados: saudável e à frente do código

Projecto `Sga` (`xodgfmxiaunpamctfeea`), Postgres 17.6, `ACTIVE_HEALTHY`.
Última migração aplicada: `20261021053926 school_website_content_server_only`
— hoje. A base está à frente do que a produção executa.

Nota: essa migração não cria `public.school_website_content`; a tabela não
existe. Endurece as tabelas `web_*` já existentes. O nome induz em erro.

### Avisos de segurança
- **77 tabelas com RLS activo e nenhuma política** (INFO). Fecha-as por
  omissão para clientes de API, o que é seguro, mas significa que nenhuma é
  acessível pela API. Entre elas todo o `academic_evidence`, os 15 `alumni_*`,
  os `hr_salary_*` e os `web_*`.
- **18 funções `SECURITY DEFINER` executáveis pelo papel `authenticated`**
  (WARN): `is_platform_admin()`, `merge_school_subjects()`,
  `hr_redeem_teacher_qr_secure()`, `current_school_id()`, entre outras.
  Vale decidir caso a caso quais devem perder o `EXECUTE`.
- **Protecção contra palavras-passe vazadas desligada** (WARN). Ligar no painel
  do Supabase (Auth > Passwords), um clique.

### Volume
| Medida | Valor |
|---|---|
| Escolas | 48 (**43** são restos de E2E) |
| Alunos | 85 |
| Matrículas | 76 |
| Professores | 9 |
| Utilizadores `auth` | 66 |
| `school_settings` | 55 linhas |
| Tabelas em `public` | 207 (**101** vazias) |

O uso real continua a ser uma fracção mínima. 101 das 207 tabelas nunca
receberam uma linha — metade do esquema é promessa, não produto.

## Repositório

Local alinhado com `origin/main` em `300ff2f0`. 30 PRs abertos, 13 em rascunho,
alguns com mais de três semanas (#35, #87, #108). Há 7 worktrees activas.

Dois ficheiros a notar na raiz:
- `pnpm-lock.yaml` sem rastreio, num repositório que usa `bun.lock` — resíduo.
- `client_secret_*.apps.googleusercontent.com.json` está presente no disco mas
  **não** rastreado (`.gitignore:79`). O `firebase-applet-config.json` esse é
  rastreado, mas só contém configuração pública de cliente Firebase.

## App desktop: continua sem actualização automática

Quatro releases publicadas, a última **v1.2.2 a 10/10** (11 dias). Os ficheiros
da v1.2.2 incluem o `SIGA.Desktop_universal.app.tar.gz`, que é o artefacto que
o updater do Tauri consome — mas **não há um único ficheiro `.sig`**. Sem
assinatura o updater recusa o pacote, pelo que cada versão continua a ser uma
reinstalação à mão para quem já tem a app.

## PayFlow: esquema completo, base vazia

O D1 `siga-payflow` tem **16 tabelas** e 6 migrações aplicadas. O campo
`num_tables` da API da Cloudflare diz `0` — mente, como já tinha mentido antes;
só a consulta directa ao `sqlite_master` serve.

Mas todas as contagens são zero: 0 escolas, 0 alunos, 0 pagamentos, 0 eventos,
0 facturas, 0 transacções EMIS, 0 comprovativos de transferência. A camada de
pagamentos está publicada e nunca processou nada.

O `siga-yft-db` tem igualmente 16 tabelas (`Students`, `Enrollments`,
`Transactions`, `Notices`, …), do sistema de estudo YFT.

## Trabalho recente sem PR: cerca de 267 ficheiros invisíveis

São 70 ramos remotos; **8 não têm PR nenhum**. Três deles têm trabalho de
funcionalidade recente e substancial.

Medido por conteúdo contra a main, não pelo ponto de divergência — a main funde
por squash, pelo que o diff de três pontos sozinho sobre-estima:

| Ramo | Difere da main | Último commit | Assunto |
|---|---|---|---|
| `ccr-b4b58ce3-7k7ae1` | 128 ficheiros | 18/10 | Estudo YFT (94), `mobile-flutter` e CI do Flutter |
| `ccr-680ee371-6vebkz` | 95 ficheiros | 18/10 | Nº de aluno em arquivos, listas e impressão; cobranças AppyPay; reconciliação da portaria (61 em `src/features`) |
| `claude/ecstatic-shannon-wek2yt` | 44 ficheiros | 19/10 | Cobrança configurável, assinaturas no ADMIN, configuração inicial da escola nova (`painel/admin` e `painel/web`) |
| `ccr-1cb32a3f-afnzyp` | 24 ficheiros | 07/10 | — |
| `claude/sharp-volta-npr0aj` | 13 de 14 | 30/09 | parcialmente fundido |
| `ccr-06c00242-8oyfbz` | 68 de 78 | 30/09 | parcialmente fundido |
| `audit/timetable-enrollment-2026-10-10` | 3 ficheiros | 10/10 | — |
| `report` | 1 ficheiro | 10/08 | — |

Os dois casos em que o número desce (78→68, 14→13) são a prova de que a medição
por conteúdo funciona: parte já entrou na main por squash. Nos três ramos
grandes não desce nada — o trabalho nunca foi fundido e ninguém o está a rever.

Ressalva honesta: «difere da main» não garante que os 128 ficheiros sejam todos
trabalho novo e aproveitável. Um ramo velho difere também por a main ter
avançado. O que está estabelecido é que não foi fundido; se vale a pena
recuperar decide-se ramo a ramo.

## Por onde pegar

1. **Rotação do token da Cloudflare.** Nada mais importa até isto: 9 dias de
   trabalho fundido estão parados à porta. Precisa do dono da conta.
2. **Abrir PR para os três ramos grandes** (`ccr-b4b58ce3-7k7ae1`,
   `ccr-680ee371-6vebkz`, `claude/ecstatic-shannon-wek2yt`) ou arquivá-los por
   decisão explícita. Enquanto ficam sem PR, não são revistos nem fundidos, e
   envelhecem contra uma main que avança.
3. **Semear o conteúdo dos websites escolares** (`web_school_showcase`,
   `web_blog_posts`) e dar um CNAME próprio a `ispab.` — ou o 200 do wildcard
   continua a esconder que o site não existe.
4. **Limpar as 43 escolas de E2E** (precisa de `SIGA_CLEANUP_ALLOW_PRODUCTION=1`;
   o dry-run salta o guarda).
5. **Assinar as releases desktop** (`.sig`), ou a actualização automática
   continua a não existir.
6. Fechar os avisos baratos: protecção de palavras-passe vazadas, e a revisão
   dos 18 `SECURITY DEFINER`.
