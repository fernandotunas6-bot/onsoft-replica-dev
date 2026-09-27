# Motor académico — estado e próximas fatias (2026-09-26)

Especificação de referência: pedido da direcção (motor académico orientado por
modelos: ano lectivo → períodos → avaliações → notas → médias → pauta →
recuperação/exames → resultado final → histórico, com auditoria).

Regra: **nenhum limiar normativo inventado no código.** A fórmula por omissão é
a do Decreto Executivo n.º 424/25 (`src/lib/angola-academic.ts`): MT = (MAC +
NPT) ÷ 2, com a NPP dentro da MAC; MFD = média das MT; aprovação pela
`passing_value` da regra de avaliação da escola (10 só quando não há regra).

## Já feito (sessão de 2026-09-26)

| Área | O quê | Onde |
|---|---|---|
| Notas do aluno | Por trimestre e por ano lectivo, provisórias assinaladas, média necessária para aprovar | `academic/student-grades.ts`, `student-grade-report.ts`, `StudentGradesCard` |
| Horários | Aula clicável (tipo, modo presencial/Zoom/online, ligação, tema, professor, contacto se permitido, tarefas) | `academic/timetable-lessons.ts`, `LessonDetailDialog` |
| Tarefas | Professor cria/arquiva tarefas por aula; alunos avisados | `siga_class_tasks` |
| Publicação | Avisa professores, alunos (e encarregados) da turma | `notifySchedulePublished` |
| Lembretes | Véspera (hora, destinatários, portal/e-mail/SMS configuráveis) e prazo de lançamento (7/3/1 dias) | `lesson-reminders.ts`, `/api/cron/lesson-reminders` |
| Professor | "O meu horário" e cartão "Avaliações" (MAC/NPP/NPT por turma, provas, prazo) | `teacher-assessments.ts` |
| Notificações | Painel do sino mostra `notifications` do utilizador | `features/notifications` |
| Estrutura académica | Separador em Pedagógica: Escola → Ano lectivo → 16 módulos, estado real de cada um e, por módulo, onde nasce, quem altera, entidade, uso, validação e destino | `academic-architecture.ts` (fonte única), `AcademicStructureTab` |

**Para activar em produção:** aplicar `docs/agents/SIGA_aplicar_migracoes.sql`
(inclui `20260926140000`) e configurar `SIGA_CRON_SECRET` (≥ 24 caracteres) +
um Cron Trigger de hora a hora para `POST /api/cron/lesson-reminders` com
`Authorization: Bearer <segredo>`. E-mail: `RESEND_API_KEY`. SMS:
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.

## O que a base já tem e a aplicação ainda não usa

A produção tem o fluxo premium quase todo — falta ligá-lo aos ecrãs:

- **Diário por disciplina/período** (`gradebooks`: draft → open → submitted →
  closed): `open_gradebook`, `submit_gradebook`, `close_gradebook`,
  `reopen_gradebook`.
- **Pauta** (`grade_sheets` + `grade_sheet_rows`): `build_grade_sheet` e
  `transition_grade_sheet` com a máquina de estados
  draft → submitted → in_review → homologated → published → closed, mais
  contested → rectified. Permissões: `assessment.grades.submit`,
  `assessment.grades.homologate`, `assessment.complaints.manage`.
- **Alteração de nota com aprovação**: `grade_scores.pending_score`,
  `pending_reason`, `pending_requested_by` + `review_grade_change`.
- **Reclamações**: `create_grade_complaint`, `respond_grade_complaint`.
- **Modelos/regras de avaliação versionados**: `assessment_rule_sets`
  (`continuous_weight`, `exam_weight`, `passing_value`, `rounding_method`,
  `grade_change_requires_approval`, `lock_after_publication`, `formula`) +
  `configure_assessment_rules`, `publish_assessment_rule_version`, `round_grade`.
- **Auditoria**: triggers `audit_row_change` em `grade_scores` e avaliações.
- **Currículo**: `curricula`, `curriculum_areas`, `curriculum_subjects`.

## Feito depois (2026-09-26, tarde)

- **Pautas oficiais** (separador Pautas): quadro por período, gerar,
  pré-pauta, transições (`transition_grade_sheet`), bloqueio, reabrir com
  motivo, aviso na publicação. O servidor recusa recalcular pautas
  homologadas/publicadas (a função da base apagaria as linhas).
- **Histórico e pedidos de alteração**: migração `grade_score_history`
  (faltava na produção e partia `upsert_grade_score`/`review_grade_change`);
  lançamento bloqueado com pauta oficial; pedido → fila da coordenação →
  aprovar só com a pauta em rectificação.

**Observações sobre a base (por verificar com a direcção técnica):**
- `build_grade_sheet` calcula as faltas em `attendance_records` /
  `attendance_sessions`, mas a chamada do SIGA grava em
  `siga_attendance_records`: a percentagem gravada na pauta sai 0 e o
  resultado da base nunca reprova por faltas. **Contornado na aplicação**
  (2026-09-27): detalhe da pauta, exames e resultado final calculam as faltas
  a partir de `siga_attendance_*` (`exam-data.ts: absenceByEnrollment`). A
  própria função é corrigida por `20260927110000` (troca só o bloco das faltas
  na definição que estiver na base; se não o reconhecer, não mexe).
- `build_grade_sheet` exige uma regra activa com `code = 'DEFAULT'`.

## Próximas fatias (por ordem)

1. ~~Pauta com estados~~ (feito).
2. ~~Pedidos de alteração de nota~~ (feito).
3. ~~Modelos académicos~~ (feito): separador "Modelos de avaliação" em
   Pedagógica — regra em vigor, versões anteriores e, para o Administrador com
   2FA, publicar nova versão (pesos MAC/NPT, aprovação, limite de faltas,
   arredondamento, disciplinas-chave, bloqueio). Publica por
   `siga_publish_assessment_rule` (migração `20260926200000`, só service_role:
   a função original não é SECURITY DEFINER e a tabela só tem leitura por RLS).
4. ~~Recuperação, exames e resultado final~~ (feito): separador "Exames" em
   Pedagógica. Épocas por ano (recurso, especial, final, melhoria) com datas,
   máximo de negativas e método (substitui / média / a maior) decididos pela
   escola; inscrição dos elegíveis a partir da pauta anual homologada (avisa
   aluno e encarregados); notas e faltas ao exame; situação antes → depois com
   a mesma regra de `build_grade_sheet`. Migração `20260926220000` (só servidor).
   Resultado final (painel no mesmo separador): pauta anual + exames (a época
   mais recente com nota conta), "Registar no histórico" grava em
   `student_academic_history` e `enrollments.final_average`; recusa com época
   aberta. O aluno e o encarregado vêem o "Resultado oficial" no cartão de
   notas. Migração `20260927090000`: histórico do aluno só do servidor (antes,
   qualquer membro — alunos incluídos — lia o de toda a escola).
   Documentos (ficha do aluno): o certificado só se emite com o resultado do
   ano registado no histórico e usa essa média e resultado; o histórico mostra
   o resultado oficial ou "(provisório)"; a declaração de notas leva as notas
   reais. A emissão real deixou de herdar dados de exemplo (antes, uma
   declaração sem overlay imprimia notas inventadas) e os modelos de notas
   recusam emitir sem notas.
5. ~~Regras de transição por ciclo no modelo~~ (feito, 2026-09-27): máximo
   de negativas, média de admissão a exame e PAP por ciclo (primário, I e II
   ciclo, técnico) passam a ser publicados pela escola no modelo
   (`formula.promotion`, migração `20260927130000`). Por omissão, as regras que
   o SIGA já aplicava. Pauta Final, histórico da ficha e resultado final (que vai
   para o histórico oficial) usam todos a mesma regra e a mesma nota de
   aprovação. Limite: a pauta da base (`build_grade_sheet`) continua a decidir só
   por média, disciplinas-chave e faltas; o resultado final corrige isso.
6. ~~Competências~~ (feito, 2026-09-27): separador "Competências" em
   Pedagógica. A coordenação define competências por disciplina (todas as
   classes ou só uma); o professor da disciplina liga cada avaliação às
   competências que avalia; domínio = média das avaliações ligadas, na escala
   da escola, ≥ nota de aprovação do modelo. Percentagem por aluno e por
   competência na turma. Migração `20260927150000` (só servidor).
   Portal do aluno e do encarregado: cartão "Competências" por disciplina
   (dominada / a consolidar / por avaliar), só com as notas do próprio aluno.
7. **Analytics** — em curso. Feito: aprovação pela nota do modelo em todos os
   relatórios; sinais automáticos de risco em `/pedagogica/risco` (sem IA, pelas
   regras do modelo: não transitaria, passou a negativa, faltas acima/perto do
   limite — `early-warning.ts`). O comparativo por trimestre, turma e disciplina
   já existia nos relatórios académicos. "Guardar no acompanhamento" grava os
   sinais em `student_risk_cases` (matrículas e nomes validados no servidor;
   casos existentes mantêm as intervenções) com registo no histórico do caso.
