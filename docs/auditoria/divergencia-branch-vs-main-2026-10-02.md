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
"à frente"**: divergiram do mesmo commit (`84bf1d1e`, 28/09 — o `merge-base` real;
`d83689b8` é só o `main` *local*, desactualizado) e cada lado andou sozinho sem o outro.

| | Commits únicos | Ficheiros tocados | Autores principais | Janela de datas |
|---|---:|---:|---|---|
| Só nesta branch | **459** | 372 (diff contra a base) | Valentino (351), Fernando (104) | 23/09 → 28/09 |
| Só no `origin/main` | **121** | 279 (diff contra a base) | **Claude (81)**, Valentino (29), gpt-engineer-app\[bot\] (11) | 29/09 → 30/09 |

Net entre as duas pontas: **367 ficheiros, +30440/-4844 linhas**.

O facto mais importante não é o volume — é a **janela de datas**: esta branch
parou de receber trabalho a 28/09. O `main` continuou sozinho mais dois dias
(29–30/09), com **81 dos 121 commits assinados "Claude"** — outra sessão de
agente a escrever directamente em `main` via PRs (#36 a #61), incluindo
merges automáticos. Isto é o mesmo padrão já registado em memória
("Lovable repõe o directório em main", "outro agente no mesmo directório"):
enquanto este trabalho ficava parado nesta branch, produção seguiu caminho
próprio.

Um merge directo hoje encontra **23 ficheiros com conflito textual real**
(verificado com um `git merge --no-commit` de teste, abortado a seguir). Uma
primeira versão deste relatório dizia 93: usou o `main` local como base e não
o `merge-base` real, o que inflacionou tudo o que tinha mudado entre os dois
pontos. O número certo é 23 — ver §4.

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

> **Correcção (02/10):** a versão inicial usou `d83689b8` (o `main` local) como
> base do `merge-tree` e deu 93 conflitos. A base real é
> `git merge-base HEAD origin/main` = `84bf1d1e`. Com ela, `merge-tree` dá 52
> ficheiros "changed/added in both" e **22 com marcador de conflito**; um
> `git merge --no-commit origin/main` de teste (abortado) deu **23** (22 + o
> `package-lock.json`).

Os 23 ficheiros em conflito num merge directo:

| Área | Ficheiros |
|---|---|
| Finance | `finance/server.ts`, `gateway-webhook-handler.ts`, `payflow-settlement.ts`, `tests/finance/cash-reversal.test.ts` |
| Academic / pedagógica | `academic/server-secure-legacy.ts`, `academic/TeacherWorkspacePanel.tsx`, `pedagogica/attendance-server.ts`, `routes/pedagogica.tsx`, `tests/pedagogica/pautas.test.ts`, `hr/teacher-lessons.ts` |
| Pessoas / auth | `people/server.ts`, `auth/use-sign-out.ts`, `routes/faturas.tsx` |
| Integrações | `InstalledModuleTools.tsx`, `tests/integrations/actions.test.ts`, `tests/integrations/install.test.ts` |
| ADMIN | `eslint.config.mjs`, `package.json`, `login-form-1.tsx`, `saas-api.ts` |
| Outros | `src/styles.css`, `docs/agents/DATABASE_RULES.md`, `package-lock.json` (regenerar, não resolver à mão) |

**Detalhe estrutural:** o `main` renomeou `painel/admin/src/proxy.ts` →
`painel/admin/src/middleware.ts` (mesma função, nome diferente). Um merge por
caminho não vê isto como "o mesmo ficheiro".

**Leitura:** 23 é um merge trabalhoso mas viável de uma vez, em vez da
operação módulo a módulo que a versão anterior sugeria. `finance/` (4
ficheiros) e `academic`/`pedagogica` são onde a decisão é de conteúdo, não de
formatação — `login-form-1.tsx`/`saas-api.ts` eram só reformatação
(ponto e vírgula) mais as alterações reais.

---

## 5. Migrações Supabase — o que a produção já tem e o que falta (corrigido a 2026-10-02)

> **Correcção.** A versão anterior desta secção dizia "44 só no `main` / 47 só nesta
> branch, ordem por decidir" e tratava as 17 migrações `hr_salary_*` como por aplicar.
> Estava errada: comparou nomes de ficheiro contra nomes de ficheiro. A produção regista
> as migrações com timestamp próprio e muitas com sufixo `_YYYYMMDD`, e muito do que está
> no repositório foi aplicado por outras vias (editor SQL, scripts) sem entrar no
> histórico. **"Não está no histórico" não quer dizer "não está aplicado".**

**Método.** `list_migrations` da produção (projecto `xodgfmxiaunpamctfeea`) comparado por
nome sem o prefixo de data e sem o sufixo `_YYYYMMDD`; depois, para cada ficheiro sem
correspondência, uma consulta de **só leitura** ao efeito (`pg_policies`, `pg_proc`,
`pg_constraint`, `has_table_privilege`). Nada foi aplicado.

**Números.** Dos 122 ficheiros datados desde 24/09, **52 não têm correspondência por nome**
(51 sem a migração `20261002093000_chat_conversations`, que é trabalho em curso de outra
sessão e ainda não está no git). Das 17 migrações que o `origin/main` mexeu desde a base,
**só 2** não estão no histórico de produção. As 26 de Agosto continuam **não aplicáveis**
(`[[nao-aplicar-migracoes-agosto]]`).

### A. Falta mesmo — a aplicar, com revisão (confiança: verificado ao vivo)

| Migração | Porquê | Notas |
|---|---|---|
| `20260926203852_harden_teacher_qr_attendance` | `src/features/hr/teacher-lessons.ts:695` chama `hr_redeem_teacher_qr_secure`; a produção só tem `hr_redeem_teacher_qr(p_token_hash)` | **O código novo falha com "função inexistente" enquanto isto não for aplicado.** O ficheiro tem uma decisão aberta sobre o rasto de auditoria — decidir antes. |
| `20260929230000_attendance_sessions_unique_slot_day` (main) | índice único por turno/dia | 0 duplicados ao vivo → aplica-se limpo. |
| `20260930090000_one_active_academic_year` (main) | um ano lectivo activo por escola | 0 escolas com mais de um activo ao vivo → aplica-se limpo. |
| `20260927120000_reclose_physical_access_secrets`, `20260924230000_close_access_card_and_device_secrets`, `20260927090000_student_history_server_only` | só retiram políticas mortas | Os privilégios de tabela **já** estão revogados (`authenticated`/`anon` sem `SELECT` em `siga_access_cards`; `siga_lesson_plans` idem), por isso não há exposição hoje — é higiene. `20260927120000_reclose_physical_access_secrets` foi **aplicada em produção a 2026-10-02** (migração `reclose_physical_access_secrets_20261002`): `siga_access_cards` ficou só com a RESTRICTIVE `School staff only`, `siga_turnstile_devices` sem políticas, `anon`/`authenticated` sem `SELECT`. As outras duas continuam por aplicar. |

> **Actualização 2026-10-04 (verificado ao vivo, só leitura).** As três primeiras linhas do §A
> já estão aplicadas em produção a 2026-10-02 (`harden_teacher_qr_attendance`,
> `attendance_sessions_unique_slot_day`, `one_active_academic_year`): existem
> `hr_redeem_teacher_qr_secure`, `siga_attendance_sessions_school_slot_day_key` e
> `academic_years_one_active_per_school`. `close_access_card_and_device_secrets` também já
> não tem efeito por aplicar (nenhuma política PERMISSIVE em `siga_access_cards` /
> `siga_turnstile_devices`). Do §A resta só `student_history_server_only`: as 2 políticas
> antigas continuam, mas `authenticated` não tem `SELECT` e o RLS está forçado nas duas
> tabelas — higiene, sem exposição. O `SIGA_confirmar_migracoes.sql` dizia «EM FALTA» em
> `assessment_rule_promotion_rules` por procurar a assinatura de 13 argumentos, que a de 14
> (`calculation_options`, 20260929110000) substituiu; a sonda passou a aceitar as duas.

### B. O efeito já está na produção — não reaplicar (confiança: verificado ao vivo, salvo nota)

| Migração(ões) | Evidência |
|---|---|
| `register_payment_respects_discount_and_penalty`, `…applies_late_fee`, `…net_of_discount` | O corpo de `private.register_payment` em produção é **idêntico** ao de `20260927190000_register_payment_net_of_discount` (a última da série). As duas anteriores ficaram superadas — a de multa por atraso não está no corpo final. |
| `next_document_number_service_variant` | `private.next_document_number(uuid,text,text)` existe. |
| `person_documents_close_member_write`, `…close_read_to_admin_secretaria` | `person_documents` só tem `INSERT/SELECT/UPDATE` com `is_school_member AND is_school_office`. |
| `close_school_member_write_policies`, `close_school_invitations_write`, `close_last_member_wide_writes`, `harden_member_wide_policies`, `hr_structure_admin_only_writes`, `school_integrations_secrets_off_the_client`, `drop_dead_installation_wizard` | Políticas de escrita largas ausentes (verificado no retrato de 30/09 e por amostra ao vivo). |
| `direct_messages_server_only_insert` | `siga_direct_messages` só tem política de `SELECT`; o `INSERT` é só servidor. |
| `payroll_history_read_by_school_role` | `hr_payroll_items`, `hr_payroll_runs`, `hr_contracts`, `hr_employments` lêem por `is_school_finance(school_id)`; `finance_invoice_events` por finanças/escritório; `student_status_events` por `is_school_office`; `is_school_office` existe com o corpo do ficheiro. |
| `school_announcements_whatsapp_channel` | `school_announcements_channel_check` já inclui `whatsapp`. |
| `close_access_log_and_lesson_component_writes`, `close_payment_plans_and_lesson_plans` | `siga_access_logs` só tem `SELECT` permissiva; `finance_payment_plans` só `SELECT` de finanças; `siga_lesson_plans`/`siga_lesson_plan_components` sem privilégios para `authenticated` e sem políticas. |
| `finance_receipt_idempotency`, `timetable_slot_overlap_trigger`, `person_documents_close_*` | Objectos presentes (trigger, índice, função). |
| Série `hr_salary_*` de 24/09 (17) + `20260928190000_capture_google_workspace_and_hr_salary_tables` | **Aplicadas, com nome sufixado** (`…_20260924`). A de 28/09 só documenta tabelas que já existiam. |
| `school_access_requests`, `reconcile_school_access_requests`, `assessment_rule_*`, `exam_sessions_registrations`, `competencies`, `shared_rate_limit`, `grade_score_history`, `consolidate_communication_preferences`, `tenant_mailboxes_server_only`, `timetable_*` (guardas) | **Confiança menor:** os objectos existem em produção; **não comparei corpo a corpo**. Antes de as dar por fechadas, comparar `pg_get_functiondef` com o ficheiro. |

### C. Obsoleta

- `20260924160000_close_legacy_grade_write_policies` — apaga políticas que já não existem.

### D. Por aplicar mas sem uso no código

- `20260925170000_timetable_builder_shifts_versions` — as tabelas/funções não existem em produção e nada no código as chama. Decidir se o recurso vai avante antes de aplicar.

### E. Risco operacional que não é de conteúdo

Cinco pares de ficheiros partilham o mesmo prefixo de versão:
`20260924160000`, `20260924180000`, `20260925090000`, `20260929230000`, `20260930090000`.
`supabase db push` identifica a migração pela versão, por isso rejeitaria o segundo de cada
par. Em produção entraram com versões distintas (por MCP/editor SQL), o que explica o
desencontro de nomes. Se alguma vez se passar a usar o CLI, estes pares têm de ser
renumerados primeiro.

### Ordem proposta (não executada — para o dono escolher)

1. Decidir o rasto de auditoria do QR → aplicar `harden_teacher_qr_attendance` (§A, 1.ª linha).
2. Reconfirmar 0 duplicados e aplicar as duas do `main` (§A, linhas 2–3).
3. Aplicar as três de higiene de políticas mortas (§A, última linha).
4. Recapturar o retrato (`npm run siga:db-snapshot`) e voltar a correr `tests/security`
   — `segredos-de-acesso-fisico` deve passar.
5. Fazer o §B de menor confiança (comparar corpos) e só então decidir se o histórico se
   regulariza (`migration repair`) ou se fica documentado.
6. Não aplicar: Agosto (§5 acima), §C, e §D sem decisão.

Nenhum SQL foi posto em `supabase/migrations/` nem executado em produção para este relatório.

### Sobre "School staff only"

A política `School staff only` aparece em 27 tabelas como **ALL, RESTRICTIVE**
(`private.is_school_staff`: owner/admin/administrador/secretary/secretaria/treasury/
tesouraria/finance/teacher/professor). Políticas restritivas combinam-se com **AND** e só
estreitam o acesso; não abrem nada. Uma leitura anterior, de que seriam um buraco por
terem `ALL`, estava errada — e fez falhar dois testes por má leitura, não por falha de
segurança (ver §9).

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
2. *(a rever depois da correcção do §4: com 23 conflitos, um merge único pode ser
   mais simples do que cherry-picks isolados — cada cherry-pick de §2.1 conflitou
   em `CONTINUE.md`/`PRODUCTION_SNAPSHOT.json`, que um merge resolve uma só vez.)*
   **Trazer §2.1 (segurança)** desta branch isoladamente — MFA, 2FA, CSP —
   antes de continuar a desenvolver aqui, para não construir contra um
   modelo de segurança mais antigo que o de produção.
3. **Decidir a ordem das migrações do §5** manualmente (as 47 daqui + as 18
   reais do `main`, ignorando as 26 de Agosto) antes de as aplicar em
   qualquer base — nenhum dos dois lados testou a combinação.
4. Só depois disso, atacar os 23 ficheiros do §4 (merge de teste mostrado lá);
   `finance/` e `academic/` exigem decisão de conteúdo, o resto é mecânico.
5. O SIGA Mobile (§3.1) e a auditoria (§3.2) são a parte mais isolada e mais
   segura de trazer primeiro, já que quase não aparecem na lista de conflito
   real do §4.

---

## 9. Actualização pós-merge (2026-10-02, depois de §1–§8)

Os §1–§4, §7 e §8 descrevem o estado **antes** do merge e ficam como registo. Entretanto:

- A branch de trabalho foi avançada (fast-forward) para o merge `c37079c5`: **464 à frente,
  0 atrás** de `origin/main`. O trabalho de ChatGPT/Claude dos últimos 5 dias está nela
  (verificado). Nada foi enviado para o remoto; a PR #28 deve ficar sem conflitos quando se fizer push.
- O estado não comitado do §7 foi tratado: 3 ficheiros comitados, `pwa.ts` ligado ao aviso de
  actualização, `chat/` no `.gitignore`.
- **Testes de segurança que falhavam por leitura errada, corrigidos** (nenhum código de
  produção mudou; todos são sondas contra o retrato/produção):
  - `escrita-de-notas-exige-mfa` — ignorava a `School staff only`, que é RESTRICTIVE.
  - `escrita-por-pertenca-vs-producao` — não reconhecia `is_school_finance`/`is_school_office`
    e listava 4 lacunas "por aplicar" que a produção já fechou.
  - `rls-live-probe` — as 4 tabelas de RH deixaram de ser alcançáveis pelo `anon`
    (confirmado com a sonda e com `has_table_privilege`); `ANON_REACHABLE_TODAY` ficou vazia.
  - `person-documents-read-scope` — aceita `is_school_office(school_id)`. Nota de produto: este
    guarda **não** inclui "diretor geral" nem "coordenação pedagógica", que o antigo
    `can_manage_students()` incluía; hoje esses papéis deixam de ler documentos de identidade.
  - `create-table-vs-producao` — o parser não lia o estilo compacto das migrações de 24/09 e
    reportava falsos conflitos; passou a partir nas vírgulas de topo.
- **`segredos-de-acesso-fisico`:** esteve vermelho de propósito até 2026-10-02, quando `20260927120000_reclose_physical_access_secrets` foi aplicada em produção (autorizado pelo utilizador); agora passa. O retrato foi corrigido à mão (política removida, contagens 333→332) porque o CLI do Supabase não correu — disco cheio (ENOSPC). `funcoes_private` está desactualizado no retrato (103 vs 106 ao vivo): recapturar com `npm run siga:db-snapshot` quando houver espaço.
- **Falham por trabalho em curso de outra sessão** neste directório (ficheiros que apareceram
  durante a sessão: `src/features/messages/chat-*.ts`, `supabase/migrations/20261002093000_chat_conversations.sql`,
  `src/features/messages/server.ts` modificado): `membership-only-reads`, `messaging-scope`,
  `production-snapshot`, `rls-client-migration` (73 ficheiros com o cliente privilegiado, tecto 72),
  `selects-vs-producao-live`. Não são desta tarefa e não foram tocados; voltam a correr
  quando essa sessão acabar. A nova migração de chat **não** está aplicada e não deve sê-lo
  sem passar por estas sondas.

---

**Comandos usados** (reprodutíveis): `git merge-base main HEAD`,
`git log origin/main..HEAD` / `HEAD..origin/main`, `git diff origin/main...HEAD
--stat`, `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main`, `git ls-tree -r
--name-only` comparado entre `HEAD` e `origin/main` para estrutura e migrações.
