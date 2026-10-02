# Divergência: `chore/lovable-backend-integration` vs `origin/main` — 2026-10-02

**Âmbito:** levantamento de git/arquitectura, sem alterar código. Compara a branch
de trabalho actual com `origin/main`, a partir do ponto comum de ambas.

Toda a contagem abaixo vem de comandos `git` correndo agora sobre o repositório
(`merge-base`, `log`, `diff`, `merge-tree`) — não de memória de sessões anteriores.
Onde cruza com achados já registados (migrações de Agosto, migrações de 25/09),
isso é dito explicitamente.

---

## 1. Resumo executivo

A branch actual e o `origin/main` **não têm uma relação simples de "atrás" ou
"à frente"**: divergiram do mesmo commit (`d83689b8`, 23/09) e cada lado andou
sozinho sem o outro.

| | Commits únicos | Ficheiros tocados | Autores principais | Janela de datas |
|---|---:|---:|---|---|
| Só nesta branch | **459** | 1592 | Valentino (351), Fernando (104) | 23/09 → 28/09 |
| Só no `origin/main` | **121** | 1437 | **Claude (81)**, Valentino (29), gpt-engineer-app\[bot\] (11) | 29/09 → 30/09 |

Net entre as duas pontas: **367 ficheiros, +30440/-4844 linhas**.

O facto mais importante não é o volume — é a **janela de datas**: esta branch
parou de receber trabalho a 28/09. O `main` continuou sozinho mais dois dias
(29–30/09), com **81 dos 121 commits assinados "Claude"** — outra sessão de
agente a escrever directamente em `main` via PRs (#36 a #61), incluindo
merges automáticos. Isto é o mesmo padrão já registado em memória
("Lovable repõe o directório em main", "outro agente no mesmo directório"):
enquanto este trabalho ficava parado nesta branch, produção seguiu caminho
próprio.

Um merge directo hoje encontraria **93 ficheiros com conflito textual real**
(verificado com `git merge-tree`, não estimado) — a maior parte são os
`server.ts` de quase todos os módulos do SIGA, porque os dois lados
reescreveram segurança/validação nos mesmos ficheiros de lados diferentes.

---

## 2. O que o `main` tem e esta branch não (121 commits)

Agrupado por tema; hashes são de `origin/main`.

### 2.1 Segurança — a parte que mais pesa para trazer

- **MFA obrigatório para administradores da plataforma** (`5d6bf256`, aal2)
- **2FA em dinheiro e em escrita directa pela API** (`a34020e1`, `1626fefc`, `35b6200c` — folha, contratos, pagamentos, pauta oficial)
- **CSP em modo de relatório** com receptor nos logs do Worker (`9838ac7f`)
- **Permissões do `anon` revistas** + cabeçalhos HTTP + Next 16.3.6 (`4b7491a1`)
- Correcções de dependências com CVE: gRPC do Firebase (`79fc0ce4`), vitest `GHSA-82fw-gwwq-j7x9` (`fd109ec8`), brace-expansion DoS (`3dbf6426`, `3efed4a9`)
- `96f4cc59` retira 5 políticas de leitura duplicadas; `70adc1ea` recaptura o retrato da produção com DDL/tipos das tabelas não declaradas

### 2.2 Motor académico

- **Ano lectivo activo único por escola**, com consulta determinística (data de início → mais antigo) — `2ca73536`, `3ac64591`
- **Trimestres gravados de uma vez** e aviso quando a escola não tem os três — `9e7bac35`, `8b842582`, `e53d3a8f`
- **Centro de Avaliação** dividido em ficheiros próprios (vistas, recursos, exames, fecho, filtros, histórico, documentos) — `6e0a3cc1`, `52afb8eb`, `36af6eac`, `5342a02e`, `c4915065`, `0f06db99`
- **Salas ligadas a turmas** (`class_groups.room_id`), coluna Turmas na lista de salas — `2d326566`, `eddfd242`
- QR de presença válido só com desafio activo (`9e7bac35`); planos de aula não apagam avaliações com notas nem duplicam (`38573025`)

### 2.3 PayFlow

- **Base D1 em produção**, publicação a partir do GitHub, health check real — `f7df1f4b`, `c07f5584`
- 12 erros de tipos → 0 (`5b63bb3e`); `school_id` do login confirmado, limite de comprovativos antes de gravar (`e9af7fa6`)

### 2.4 Infra / CI / domínios

- **CORS e domínios próprios seguem `PLATFORM_DOMAIN`** (`442a8745`) — ADMIN abre o SIGA da escola no subdomínio certo (`6bec3cfa`)
- Ecrã de entrada desenhado em SSR, LCP 2,0s → 1,3s/1,2s (`066c0b63`, `37cd36e5`, `cf71b02e`)
- Lighthouse a correr no CI com resumo no log (`ac9cc20c`, `cf71b02e`); CI gasta menos minutos (`0d55cb11`)
- `middleware.ts` do ADMIN (ver §4 — esta branch tem `proxy.ts` no mesmo lugar)

### 2.5 Pessoas e acessos

- Pessoas só no âmbito da conta (`9a8f1166`); notas de avaliação só para alunos da própria turma, inclusive Administração/Secretaria (`fa1aacad`)
- Registo de escolas corrigido (contagem por id voltava atrás) e `onConflict` de pedidos de acesso corrigido (`73f3bd02`)

**Risco de não trazer isto:** o mais crítico é §2.1 — produção já exige MFA/2FA
e CSP que esta branch não tem; continuar a trabalhar aqui sem essas guardas
é desenvolver contra um modelo de segurança mais antigo que o que está no ar.

---

## 3. O que esta branch tem e o `main` não (459 commits)

Agrupado por tema; não é lista exaustiva (ver `git log origin/main..HEAD` para a íntegra).

### 3.1 SIGA Mobile (os 5 commits mais recentes da branch)

Tokens/primitives e shell própria do telemóvel → listas/home → horário/pauta →
documentos/catracas/currículo → alvos de toque/teclados/a11y. É a ponta mais
recente e mais isolada: trabalho de UI, baixo risco de conflito com o `main`.

### 3.2 Auditoria SIGA (área 1–10, este directório)

13 commits de auditoria, incluindo o retrato da produção recapturado e o
registo do que está por aplicar — ver `[[auditoria-siga-por-areas]]`.

### 3.3 Segurança — RLS e isolamento (32 commits com "seguran/RLS/MFA/2FA/segredo")

Fechar escritas por pertença em tabelas centrais (`2675bfcc`, `29e531dd`),
salários e históricos só para quem trata deles (`982637ce`), matrículas
públicas só para a secretaria (`59f3276b`), limite partilhado no OTP e
registo de escolas (`734b3c6b`), 2FA na mudança de destino dos salários
(`b9687349`), QR docente (`8306ef28`, `83d3f5b9`).

### 3.4 Financeiro / PayFlow (9 commits)

Planos de pagamento sem EMIS de exemplo (`413f38be`), pagamentos contra total
com desconto (`c3da95d9`), estorno com 2FA e fatura reposta (`de0696f2`),
SAF-T sem certificado inventado (`18c8972d`), referências/carteiras de exemplo
removidas (`a944d7f6`), webhook sem recibos acima do saldo (`9dd702b9`).

### 3.5 Pedagógica / pautas / avaliação (11 commits)

Nota de aprovação pela do modelo em vigor (`9ac2a2c1`), pauta oficial com
versões guardadas antes de rectificar (`cc5c70ce`), modelo de avaliação com
opções NPP/recurso para o director (`445c3c10`), notas calculadas e validadas
no ecrã e no servidor (`4c0d17c4`), MAC/NPP/NPT com tipo certo — a média saía
pela metade (`499d74ca`).

### 3.6 Área do cliente / comercial (WEB)

Assinatura e plano completos — uso, pagamento, mudar de plano, domínio
(`3f0ab302`); pedidos de mudança de plano com cartão no ADMIN (`84bf1d1e`);
assistente "Criar escola" em duas colunas com pré-visualização (`0bce5132`,
`069a6f4b`).

### 3.7 Login / Google / senhas expostas

Captcha no regresso do Google (`f2be8b02`), HaveIBeenPwned no navegador no
plano gratuito (`af2c813e`, `54e9c618`), cliente Google Workspace morto
removido (`92766167`), vídeo de fundo do login servido em produção (`a50a642e`).

### 3.8 Ruído de agente (sinal, não defeito)

Dentro dos 459 há uma cauda de commits genéricos — `"Changes"`, `"Work in
progress"`, `"Added follow-up message"` — concentrados num trecho específico
do histórico (commits `536c9531`…`e297881f`). É assinatura de sessão
Lovable/gpt-engineer a comitar incrementalmente; não há perda de informação
(o conteúdo final está nos commits seguintes), mas um `git log --oneline`
rápido nesse trecho não é legível sem agrupar.

---

## 4. Risco real de merge/rebase (medido, não estimado)

`git merge-tree d83689b8 HEAD origin/main` (merge de 3 vias em memória, sem
tocar a árvore de trabalho) devolve **128 ficheiros "changed in both"**, dos
quais **93 têm marcador de conflito real** (`<<<<<<<`) — os outros 35 resolvem-se
sozinhos.

Os 93 agrupam-se assim:

| Área | Ficheiros | Nota |
|---|---:|---|
| `src/features/*/server.ts` | ~20 | academic, finance, saas, people, students, school, documents, import, calendar, enrollment, catracas, access, arquivos, pedagogica, lesson-plans — isto é "quase todos os módulos" |
| `src/routes/*` | 11 | alunos, calendario, comunicacoes, documentos, faturas, financeiro, pedagogica, pessoas, `__root.tsx`, `routeTree.gen.ts` (gerado — refazer, não resolver à mão) |
| Config/infra | 9 | `package.json`, `bun.lock`, `.github/workflows/ci.yml`, `.github/workflows/native-ci.yml`, eslint configs (admin/web), `public/sw.js`, `scripts/deploy-cf.mjs` |
| Testes | 7 | `bi-login`, `commercial-wizard` (e2e), `sga-live-admin` (helper), `install`, `zoom-integration`, `actions`, `pautas` |
| Componentes de UI partilhados | ~15 | `AppShell`, `AuthGate`, `RouteErrorScreen`, `QuickFormModal`, painéis de catracas/integrações, `AssessmentCenter`, `TeacherWorkspacePanel` |
| Supabase SQL aplicável à mão | 2 | `APPLY_ENROLLMENT_AND_PREMIUM.sql`, `APPLY_MISSING_FROM_VERIFY.sql` |
| ADMIN | 4 | `eslint.config.mjs`, `package.json`, `login-form-1.tsx`, `saas-api.ts` |

**Um detalhe estrutural, não de conteúdo:** o `main` renomeou
`painel/admin/src/proxy.ts` → `painel/admin/src/middleware.ts` (mesma função,
nome diferente). Um merge ingénuo por caminho de ficheiro não vê isto como
"o mesmo ficheiro" — qualquer resolução manual tem de reparar que é uma
renomeação, não duas versões concorrentes.

**Leitura:** o conflito não está disperso — está concentrado onde os dois
lados fizeram a mesma coisa (endurecer `server.ts`) de formas diferentes e
independentes. Resolver isto ficheiro a ficheiro vai exigir decidir, por
módulo, qual das duas validações/guardas prevalece — não é um merge
automatizável.

---

## 5. Migrações Supabase: dois lados hardening em paralelo

- **44 migrações só em `origin/main`**, divididas em dois grupos:
  - 26 datadas **09/08–11/08** — estas são as "migrações de Agosto" já
    registadas como **não aplicáveis** (`[[nao-aplicar-migracoes-agosto]]`):
    descrevem um modelo de dados substituído. O `main` trouxe-as de volta;
    aplicá-las cegamente criaria o modelo paralelo vazio já avisado.
  - 18 datadas **29/09–30/09** — estas são reais e novas: MFA/2FA, ano
    lectivo activo único, políticas duplicadas, QR com garantia, tabelas
    sensíveis só para pessoal da escola.
- **47 migrações só nesta branch**, datadas 23/09–27/09 — toda a
  versão/aprovação de escalões salariais do RH (17 migrações
  `hr_salary_*`/`hr_payroll_*`), idempotência de recibos financeiros, fecho
  de políticas de escrita por pertença, RLS de `siga-arquivos`, triggers de
  sobreposição de horário.

Nenhum dos dois ficheiros de migração se repete por nome — não há conflito de
*merge* aqui, mas há um problema de **ordem e dependência**: aplicar as 47
desta branch sem as 18 reais do `main` (ou vice-versa) deixa a base num
estado que nenhum dos dois lados testou. Juntar as duas listas exige revisão
humana da ordem de aplicação, não só `cat` dos ficheiros.

---

## 6. Inventário de arquitectura (estado actual, via `docs/agents/ARCHITECTURE_HARMONIZATION.md`)

Cinco aplicações, um Postgres Supabase partilhado (`xodgfmxiaunpamctfeea`):

| App | Pasta | Framework | Porta | Papel |
|---|---|---|---|---|
| WEB | `painel/web` | Vite 7 + React 19 + React Router 7 | 5174 | Portal público, vende |
| ADMIN | `painel/admin` | Next.js 16 App Router | 3005 | Controla (plataforma, publicado estático no Cloudflare Pages) |
| SIGA PLUS | raiz `/` (`src/features/*`) | TanStack Start + React Query + Zod | 3006 | Trabalha — o sistema escolar em si |
| PAYFLOW | `painel/payflow` | Vinext + Cloudflare D1 | 3007 | Cobra |
| DOC | `painel/docs` | VitePress + Vue 3 | 5173 | Explica (público) |

A estrutura de pastas entre esta branch e o `main` é **quase idêntica** — a
única diferença de ficheiros (fora do conteúdo) é a renomeação `proxy.ts` →
`middleware.ts` já referida, mais `painel/payflow/lib/health.ts` e
`painel/payflow/tests/health.test.mjs`, que só existem no `main`.

`src/features/` (SIGA, 28 módulos): academic, access, ai-assist, alumni,
arquivos, audit, auth, calendar, catracas, communications, contacts,
dashboard, documents, enrollment, finance, hr, import, integrations,
intelligence, lesson-plans, messages, notifications, otp, pedagogica,
people, saas, school, spotlight, students.

---

## 7. Estado local não comitado (nesta máquina, agora)

Não faz parte da comparação de branches, mas é risco imediato de perda:

- **4 ficheiros modificados, não comitados:** `docs/agents/SECURITY_AUDIT_2026-09-25.md`,
  `scripts/siga/capture-db-snapshot.mjs`, `src/features/arquivos/FileBrowser.tsx`,
  `src/lib/pwa.ts` (+157/-9 linhas no total).
- **`chat/` (não rastreado):** protótipo de chat escolar — `ChatEscolar.jsx`,
  `supabaseChatAdapter.js`, `schema.sql`, mais 3 ficheiros Lottie e um `files.zip`.
  Não está no `.gitignore`; se não for intenção manter fora do git, falta
  decidir — hoje está invisível a qualquer `git status` de outra sessão.
- **4 stashes antigos**, incluindo um marcado "suspected accidental revert to
  old Ciclo~64 snapshot" (10/09) — por resolver.

Isto confirma o padrão já em memória (`[[outro-agente-no-mesmo-directorio]]`):
há trabalho vivo fora do histórico git que um `reset --hard` do Lovable, ou
de outra sessão, apagaria sem aviso.

---

## 8. Ordem sugerida (não é decisão tomada — é para o dono escolher)

Isto não corrige nada; só ordena pelo que mais pesa:

1. **Comitar ou descartar deliberadamente** o estado não comitado do §7 antes
   de qualquer operação que toque o working tree (merge, rebase, checkout).
2. **Trazer §2.1 (segurança)** desta branch isoladamente — MFA, 2FA, CSP —
   antes de continuar a desenvolver aqui, para não construir contra um
   modelo de segurança mais antigo que o de produção.
3. **Decidir a ordem das migrações do §5** manualmente (as 47 daqui + as 18
   reais do `main`, ignorando as 26 de Agosto) antes de as aplicar em
   qualquer base — nenhum dos dois lados testou a combinação.
4. Só depois disso, atacar os 93 ficheiros do §4 — e fazê-lo módulo a
   módulo (ex.: `finance/server.ts` de um lado contra o outro), não com um
   `git merge` de uma vez só.
5. O SIGA Mobile (§3.1) e a auditoria (§3.2) são a parte mais isolada e mais
   segura de trazer primeiro, já que quase não aparecem na lista de conflito
   real do §4.

---

**Comandos usados** (reprodutíveis): `git merge-base main HEAD`,
`git log origin/main..HEAD` / `HEAD..origin/main`, `git diff origin/main...HEAD
--stat`, `git merge-tree <merge-base> HEAD origin/main`, `git ls-tree -r
--name-only` comparado entre `HEAD` e `origin/main` para estrutura e migrações.
