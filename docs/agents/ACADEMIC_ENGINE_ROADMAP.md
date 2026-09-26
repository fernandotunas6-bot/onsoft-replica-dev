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

## Próximas fatias (por ordem)

1. **Pauta com estados** — ecrã da coordenação: pré-pauta com verificações
   (notas em falta, fora da escala, alterações pendentes, alunos sem
   matrícula) numa função pura testada; botões de transição que chamam
   `transition_grade_sheet`; pauta publicada bloqueada; histórico de estados.
2. **Pedidos de alteração de nota** — professor pede (valor, motivo) numa
   nota fechada; coordenação aprova/recusa via `review_grade_change`; aviso
   aos dois; tudo na auditoria.
3. **Modelos académicos** — ecrã sobre `assessment_rule_sets` (pesos, escala,
   arredondamento, aprovação, versões); o motor passa a ler a regra activa
   da turma, com o Decreto 424/25 como modelo por omissão.
4. **Recuperação, exames e resultado final** — precisam de tabelas novas
   (migração só do servidor): inscrição, prova, júri, classificação, e a
   situação final calculada pela regra do modelo.
5. **Competências** — tabela de competências ligada a `curriculum_subjects` e
   às avaliações; percentagem de competências dominadas por aluno.
6. **Analytics** — comparativo trimestral, turma/disciplina, alunos em risco
   (reaproveitar `student_risk_cases`).
