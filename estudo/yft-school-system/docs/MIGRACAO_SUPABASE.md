# Passar a app para o Supabase do SIGA

**Objectivo:** a app Flutter passa a ser a app móvel do SIGA. Contas do SIGA
(Supabase Auth do projecto `xodgfmxiaunpamctfeea`) e os dados que a escola já
gere no SIGA, em vez do Firebase e da base D1 própria.

## Regras

- **Não se cria nem altera nada no esquema de produção.** A app usa as tabelas
  que o SIGA já tem (`students`, `student_guardians`, `enrollments`,
  `class_groups`, `school_announcements`, …). Ver
  `docs/agents/DATABASE_RULES.md`.
- As tabelas sensíveis têm RLS forçado: a app **não** as lê directamente. Lê
  pela API `/api/sga/*` deste Worker, que valida a sessão Supabase, decide o
  que a conta pode ver e só depois consulta, com a chave de servidor.
- A chave de servidor (`SGA_SUPABASE_SECRET_KEY`) é segredo do Worker. A URL e
  a chave publicável são públicas (`wrangler.siga.jsonc`).
- A API Mobile V4 (`m.portal-siga.com`) continua a ser a do aluno e do
  professor; o seu código não está neste repositório. `/api/sga` cobre o que
  ela não tem, a começar pelo encarregado.

## Fases

| Fase | O quê | Estado |
| ---- | ----- | ------ |
| 1 | API de leitura do encarregado: `GET /api/sga/me`, `/wards`, `/notices` | feito (testes em `school-worker/test/sga.spec.ts`) |
| 2 | Entrada na app com a conta do SIGA (Supabase Auth) e ecrãs do encarregado a ler `/api/sga` | feito (web e Android/iOS) |
| 3 | Leituras do encarregado: horário, faltas, recibos, boletim, saldo, disciplinas, turmas e calendário | feito |
| 4 | Escritas e mensagens no próprio SIGA: chamada, notas e chat (`/api/mobile/attendance`, `/grades`, `/chat`) | feito |
| 5 | Desligar o Firebase e a base D1 | por fazer |

## Modo SIGA na app

Liga-se na compilação; sem estes valores a app fica no modo Firebase:

```sh
flutter build web --release \
  --dart-define=SGA_SUPABASE_URL=https://xodgfmxiaunpamctfeea.supabase.co \
  --dart-define=SGA_SUPABASE_PUBLISHABLE_KEY=sb_publishable_NSqtGz5zxP_EngLuNj00Og_y3V4D4td \
  --dart-define=HCAPTCHA_SITE_KEY=<a mesma VITE_HCAPTCHA_SITE_KEY do SIGA>
```

- Entrada: `lib/core/sga/sga_auth.dart` fala com o Supabase Auth por REST
  (`/auth/v1/token`), guarda o par de tokens no armazenamento seguro e renova
  o de acesso antes de expirar (uma renovação de cada vez). O Firebase não
  arranca.
- Captcha: o Supabase do SIGA exige hCaptcha. Na web, o ecrã de entrada mostra
  o widget oficial (`captcha_box_web.dart`); o domínio da app
  (`m.portal-siga.com`) tem de estar na lista de domínios da chave no painel do
  hCaptcha. No Android e iOS, o mesmo widget num WebView
  (`captcha_box_mobile.dart`), carregado como página do portal
  (`SGA_PORTAL_URL`): esse domínio também tem de estar na lista da chave.
- Sessão: `GET /api/sga/me` dá o papel e a escola; o pedido leva a escola em
  `X-School-Id`. Encarregado completo nesta fase só em Educandos e
  Comunicados (sem contagem de "não lidos": o SIGA não a guarda). Os outros
  ecrãs ainda chamam a API antiga e falham até à fase 3; professor e direcção
  entram, mas os seus ecrãs são da fase 4.
- Recuperar e mudar a palavra-passe: no portal do SIGA (a app diz isso).

## Regras de acesso de `/api/sga` (iguais às do SIGA)

- Escola: sem `X-School-Id`, a primeira escola activa por antiguidade — o
  mesmo critério do SIGA sem o cookie da escola activa, para as leituras aqui
  e as escritas em `/api/mobile/*` irem à mesma escola. Pedida e indisponível:
  409 `ACTIVE_SCHOOL_UNAVAILABLE`, como o SIGA. A app ainda não escolhe escola.
- Escola suspensa ou arquivada: as leituras continuam, como no SIGA ("os
  dados podem ser consultados, mas não alterados"); as escritas são recusadas
  pelo próprio SIGA.

Rotas: `GET /api/sga/me`, `/wards`, `/notices`, `/timetable?class_id=`,
`/attendance/student/:id`, `/finance/receipts`, `/grades?student_id=&term=Term N[&academic_year=]`,
`/grades/years?student_id=`, `/subjects`, `/classes`, `/academic-calendar`. Todas no formato das rotas
antigas, para os ecrãs não mudarem.

- Horário: `class_subjects` da turma → `timetable_slots` com `status = active`
  (dias 1–7, segunda = 1, como o app). A turma tem de ser de um educando.
- Faltas: `siga_attendance_records` (as que o SIGA usa) e a data da aula em
  `siga_attendance_sessions`. O SIGA marca por aula, o app mostra dias: um dia
  com alguma `absent` é falta; atraso e falta justificada contam como presença;
  `not_registered` não conta.
- Boletim: como `getMyStudentGrades` do SIGA — matrícula do ano (sem as
  canceladas) → `terms` (sequência N) → `gradebooks` da turma e do trimestre →
  `grade_items` MAC/NPP/NPT → `grade_scores` da matrícula. MT = (MAC + NPT)/2
  à décima (só uma das duas: vale essa; a NPP não entra), escala 0–20, aprova
  com 10. Diário não fechado (`closed`/`homologated`/`published`/`locked`) =
  nota provisória. Todas as disciplinas da turma aparecem, com ou sem notas.
  As fórmulas estão em `school-worker/src/sga/grades.ts` e têm de seguir
  `src/lib/angola-academic.ts`.
- Saldo do educando (em `/wards`, `balance`): negativo = em dívida, o que
  falta das facturas `open`/`partially_paid` depois dos recibos não anulados.
- Calendário: o ano lectivo `active` da escola e os seus `terms` como
  "Term N"; o trimestre activo é o que contém hoje (Luanda).
- Dados pessoais: só leitura (alteram-se no portal do SIGA).
- Recibos: matrícula → `finance_contracts` → `finance_invoices` →
  `finance_receipts` sem `reversed_at`. O SIGA não guarda saldos no recibo: o
  "saldo depois" é o que falta dessa factura (valor − desconto + multa) depois
  desse recibo e dos anteriores; a descrição diz a factura.

- Vínculo: `school_memberships` activos da conta; papéis por `member_roles` →
  `roles.code` (mesmo mapa de `src/integrations/supabase/sga.ts`). A escola
  pedida em `X-School-Id` só vale se for um desses vínculos.
- Ficha da conta: `people.user_id`; se não houver, `people.email` igual ao
  e-mail **confirmado** da conta e só se houver uma única ficha com ele.
- Educandos: `student_guardians` dessa ficha, nesta escola, com ligação em
  vigor (`valid_until` vazio ou hoje/depois, hora de Luanda).
- Comunicados: `status = sent`, não apagados, público `all_guardians` e, se
  algum educando tiver factura vencida por pagar, `guardians_with_debt`.
- Uma leitura falhada responde 503, nunca uma lista vazia.

## Escritas: no próprio SIGA

As escritas não passam pelo `school-worker`: vão para rotas `/api/mobile/*`
da **raiz do SIGA**, que chamam as mesmas funções de servidor dos ecrãs do
SIGA. Assim a sessão e o MFA, o papel e as permissões do módulo, a escola
suspensa/arquivada, a pauta oficial e a auditoria são exactamente os do SIGA,
sem cópia de regras.

- `GET /api/mobile/attendance?date=` — aulas do dia do professor (cria as
  sessões que faltam, como o ecrã Chamada).
- `GET /api/mobile/attendance?session_id=` — folha de chamada.
- `POST /api/mobile/attendance` `{session_id, records:[{student_id,status}], reason?}`
  — sem `reason` grava e fecha; com `reason` (≥ 5 caracteres) corrige uma
  chamada fechada, com registo em `siga_attendance_audits`.
- Erros: 401 sessão, 403 MFA, 422 entrada, 400 com a mensagem do SIGA, 500
  sem detalhe. Testes: `tests/api/mobile-attendance.test.ts` (raiz).
- A app chama o portal em `SGA_PORTAL_URL` (`--dart-define`). Escola com mais
  de um vínculo: o SIGA usa a escola activa do cookie do portal; sem cookie,
  a primeira. Ecrã: Marcar presenças (`sga_attendance_screen.dart`), P / A /
  F por aluno; por marcar conta como presente; justificadas e saídas
  antecipadas ficam como estão no SIGA.

### Notas

- Leitura no Worker, exacta: `GET /api/sga/teacher/classes` (disciplinas do
  professor) e `GET /api/sga/teacher/grades?class_group_id=&subject_id=&term=`
  (MAC/NPP/NPT de todos os matriculados activos/pendentes). Professor: só a
  sua disciplina (`class_subjects.teacher_id` = a sua ficha de docente);
  direcção/secretaria: qualquer uma. Não se usa `listTermGrades` do SIGA, que
  corta a 200 linhas: notas por mostrar seriam sobrescritas.
- Escrita no SIGA: `POST /api/mobile/grades`
  `{subject_id, term, rows:[{enrollment_id, mac, npp, npt}]}` →
  `upsertTermGradesBatch` (trimestre aberto, escala do modelo, disciplina da
  turma, matrícula activa, pauta não oficial; na base, os triggers de
  `20260903025000` limitam o professor à sua turma e disciplina).
- App (`sga_grades_screen.dart`): só envia os alunos alterados, com as três
  notas entre 0 e 20, em lotes de 80; pede confirmação antes de descartar.

### Mensagens

- `GET/POST /api/mobile/chat` no SIGA, sobre o chat do SIGA
  (`siga_chat_*`): conversas, contactos (`?contacts=1`), mensagens (60;
  `?before=` ISO para as anteriores), enviar, marcar como lida, começar
  conversa. Regras do SIGA: escola activa, só membros lêem, o encarregado só
  escreve ao pessoal da escola.
- App: `SgaConversationsRepository` com a mesma interface do antigo; abrir a
  conversa marca-a como lida; o papel mostrado é o texto do SIGA.

## Pôr no ar (dono)

```sh
cd estudo/yft-school-system/school-worker
npx wrangler secret put SGA_SUPABASE_SECRET_KEY --config wrangler.siga.jsonc
npx wrangler deploy --config wrangler.siga.jsonc
```

Ou, com o script, exportar `SGA_SUPABASE_SECRET_KEY` antes de
`scripts/publicar-siga.sh teste`.
