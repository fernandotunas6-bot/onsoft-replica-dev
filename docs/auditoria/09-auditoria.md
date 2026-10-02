# Auditoria SIGA Plus — 9. Módulos complementares

**Data:** 2026-09-25 · **Âmbito:** apenas a área 9.
A correcção de `siga_access_cards`/`siga_turnstile_devices` (`3c27139`) saiu desta
auditoria e está descrita em 9.5.

Retrato: `supabase/PRODUCTION_SNAPSHOT.json`. Contagens e políticas verificadas na base.

---

## Nota de leitura: metade desta área não existe

Esta é a primeira área em que o principal achado não é um defeito, mas uma ausência. Três
das seis verificações não têm tabela nem código:

| Verificação | Estado |
|---|---|
| 9.1 Biblioteca, empréstimos, devoluções, multas | **não existe** |
| 9.2 Capelania e modo adventista | **não existe** |
| 9.3 Visitas pastorais, igrejas, estatísticas | **não existe** |

Não é interpretação: `grep` por `emprestimo`, `capelania`, `chaplain`, `pastoral`,
`igreja`, `church` em todo o `src/` devolve **zero ficheiros**, e não há tabela
correspondente nas 162 do retrato.

**A palavra "biblioteca" no código induz em erro.** Aparece em 30 ficheiros, e em todos
significa **biblioteca de ficheiros** (`/arquivos`, `siga_files`) — o arquivo documental da
escola. Não há livros, exemplares, empréstimos, devoluções nem multas. Quem ler a ementa do
produto e depois o código pode concluir que o módulo existe; não existe.

Isto importa para a decisão de produção: uma verificação que falta não aparece nos testes,
não aparece nos erros, e só aparece quando alguém a procura. Convém que a lista do que se
promete e a lista do que existe sejam a mesma.

## 9.4 Vídeo-aulas, recursos pedagógicos e conteúdos por disciplina

**Parcialmente implementado.** O que existe:

- **Aulas por vídeo:** integração Zoom real (`integrations/zoom.ts`, `ZoomIntegrationCard`,
  `ZoomMeetingButton`), ligada a `siga_attendance_sessions`.
- **Recursos por disciplina:** `siga_lesson_plans` e `siga_lesson_plan_components`, com
  `ClassMaterialsPanel` do lado dos arquivos.

Não há repositório de vídeo-aulas gravadas nem catálogo de conteúdos — o Zoom cobre a aula
síncrona, não o acervo.

## 9.5 Cartões e integração biométrica

**Cartões e catracas: implementados.** `siga_access_cards` (número, código de barras,
`qr_secret`, `rfid_tag`, validade), `siga_turnstile_devices` (tipo, direcção, IP, MAC,
`api_key`, `last_ping_at`), `siga_access_logs`, o ecrã `/catracas` e uma ponte de hardware
em Tauri. A validação vive em `catracas/gate-pass-validation.ts`.

**Achado (P1, corrigido durante esta auditoria): as duas tabelas são um cofre, e estavam
abertas a qualquer membro da escola.**

`siga_turnstile_devices.api_key` **é** a autenticação do leitor físico —
`gate-pass-validation.ts:64` identifica o dispositivo por `.eq("api_key", apiKey)`, e é só
isso que separa uma catraca legítima de um pedido HTTP qualquer.
`siga_access_cards.qr_secret` e `rfid_tag` **são** o passe: `:85` aceita um token que case
com `card_number`, `barcode`, `qr_secret` **ou** `rfid_tag`.

Ambas tinham `FOR ALL TO authenticated USING is_school_member(school_id)`. Um aluno podia
ler o segredo de um colega e passar a catraca como ele, ler o `api_key` de um leitor e
forjar entradas e saídas, emitir um cartão a si próprio, ou trocar o `api_key` de um
dispositivo e deixá-lo de fora.

**Latente, não explorado:** as duas tabelas estão vazias (0 dispositivos, 0 cartões) — o
módulo ainda não entrou em serviço. Fechado por `20260924230000`, e **sem política de
leitura**, ao contrário das outras tabelas fechadas nesta auditoria: uma política de linha
não esconde uma coluna, e qualquer `SELECT` que deixasse listar cartões entregaria o
`qr_secret` junto. Verificado que as 18 ocorrências na aplicação correm todas por
service_role, logo nenhum ecrã perde nada.

**Biometria: não implementada.** A única ocorrência de `biometr` em todo o `src/` é um
comentário em `native-stronghold.ts` sobre a política de desbloqueio do cofre nativo — nada
a ver com identificação de pessoas. A verificação admite a ausência ("quando implementados").

## 9.6 Calendário, actividades extracurriculares e funcionalidades por plano

**Calendário:** implementado (módulo `calendar`, `calendar_feed_tokens`, rota `/calendario`
e `/calendario.ics`).

**Actividades extracurriculares:** `grep` por `extracurricular` devolve zero. Não existe.

**Funcionalidades por plano — implementado, mas só do lado do cliente.**

`plans` tem `features` (jsonb), `max_students`, `max_staff`, `max_storage_gb`, preços
mensal e anual; há 4 planos em produção. `plan-features.ts` traduz um caminho de rota num
módulo e pergunta se o plano o inclui, e é usado em `AppShell.tsx`, `CommandPalette.tsx` e
`access-policy.ts`. Os limites de dimensão são lidos em `tenant-limits.ts`.

**Achado (P2): a verificação de plano é de interface, não de servidor.** Os quatro
consumidores de `planIncludesPath`/`planIncludesModule` são todos de UI — nenhum é uma
server function. Esconder o menu não impede o pedido: um utilizador de um plano básico que
chame directamente a server function de um módulo que não contratou é servido na mesma.
Não é uma falha de segurança de dados (o RBAC continua a valer), mas é a fronteira
comercial do produto, e está desenhada numa camada que o cliente controla.

**Achado agravante (P3): falha em aberto.** `planIncludesModule` devolve `true` quando não
há plano carregado (`if (!plan?.features) return true`). Num sítio onde a decisão é
"pagou ou não pagou", a omissão devia ser recusar, não conceder — ou, pelo menos, ser uma
decisão explícita e não o efeito de um `?.`.

**Achado (P2): `school_modules` e `module_catalog` não são lidos por ninguém.** Há 8 módulos
no catálogo e 8 instalados na escola, em produção — e `grep` em `src/` devolve **zero**
ocorrências das duas tabelas. O modelo de instalação de módulos por escola existe na base,
com `installed_version`, `status` e `settings`, e nada na aplicação o consulta. O controlo
que existe de facto é o de `plans.features`, que é outro mecanismo.

São, portanto, **dois modelos para a mesma pergunta** — "esta escola tem este módulo?" — e
o que está povoado não é o que é lido. É o mesmo padrão já encontrado nas áreas 5, 6 e 7.

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P1** | Cartões e catracas guardavam credenciais legíveis por qualquer membro — **corrigido e verificado** | `3c27139`; prova revertida contra a produção |
| **P2** | Verificação de plano só na interface: o servidor não a aplica | 4 consumidores, todos de UI |
| **P2** | `school_modules`/`module_catalog` povoados (8 e 8) e sem um único leitor | `grep` em `src/` |
| **P2** | Biblioteca com empréstimos, capelania e registos pastorais não existem — 3 das 6 verificações | `grep` + retrato |
| **P3** | `planIncludesModule` falha em aberto sem plano carregado | `plan-features.ts:29` |
| **P3** | Actividades extracurriculares não existem | `grep` |
| **P3** | Biometria não implementada (admissível pela verificação) | `grep` |

### O que está bem

A integração Zoom é real e está ligada às sessões de presença, não é um botão solto. O
modelo de cartões e catracas está bem desenhado — `direction_capability`, `last_ping_at`,
`denial_reason` nos registos — e a validação aceita quatro formatos de passe, o que é o
necessário para hardware heterogéneo. Os limites de dimensão do plano (`max_students`) são
lidos onde interessa.

### A ordem que proponho

1. **Decidir o que é promessa e o que é produto.** Três verificações desta área não têm
   código. Se a biblioteca com empréstimos e a capelania fazem parte do que se vende, são
   projectos, não correcções — e devem sair da lista de verificação de produção até
   existirem. Se não fazem, a lista é que deve mudar.
2. **Levar a verificação de plano para o servidor**, nem que seja num único ponto de
   entrada, e fazê-la falhar fechada.
3. **Escolher entre `school_modules` e `plans.features`** e apagar o que não for usado. Ter
   os dois garante que um deles está errado e ninguém dá por isso.

Nenhum destes é urgente no sentido em que o cofre das catracas era — esse já está fechado,
e fechou-se antes de existir um único cartão emitido, que era o momento certo.
