# Auditoria SIGA Plus — 4. Turmas, disciplinas e horários

**Data:** 2026-09-23 · **Âmbito:** apenas a área 4 · **Código não alterado.**

Testes da área: `tests/academic/schedule-conflicts.test.ts`, `tests/pedagogica/` (3),
`tests/routes/pedagogica.test.tsx`, `tests/import/pedagogical-importers.test.ts`,
`tests/intelligence/classes/` (2).

---

## 4.1 Criação de turmas por escola, curso, classe, ano lectivo e turno

**Implementado.** `class_groups` liga-se a `school_id`, `academic_year_id`,
`grade_level_id` (classe), `campus_id` e tem `shift` (turno), `code`, `name` e `status`.
O curso entra por `grade_levels.program_id`, cuja chave natural é
`(school_id, program_id, code)` — corrigida há dias no importador `classes`, que escrevia
`sort_order`/`status`, colunas que a produção não tem, e omitia `program_id`.

## 4.2 Associação de docentes e disciplinas, cargas horárias e substituições

**Implementado.** `class_subjects` (`class_group_id`, `subject_id`, `teacher_id`,
`weekly_periods`, `status`) é a associação; `weekly_periods` é a carga horária semanal,
com `CHECK` entre 1 e 30. Criação por `configure_class_subject` (RPC), e
`current_teacher_can_manage_class_subject` decide o âmbito do docente.

Substituições: `hr_assign_teacher_substitute`, com `hr_teacher_lesson_occurrences`,
`hr_detect_missed_teacher_lessons` e `hr_confirm_teacher_lesson` à volta.

Disponibilidade do docente: `replace_teacher_availability` e `teacher_availability`.

## 4.3 Prevenção de conflitos entre horários de docentes, alunos e salas

**Implementado, e bem desenhado — mas a regra não é revisível.**

Há dois mecanismos, e a divisão entre eles é deliberada:

1. **Avisos**, em `src/features/academic/advanced-academic-server.ts:514`
   (`assertScheduleSlotConflictsDetailed`), que verifica sala, docente e turma e devolve
   detalhes. O resultado é **filtrado a `severity === "warning"`** (`:695`) — não bloqueia.
2. **Imposição**, delegada à base: `create_timetable_slot_guarded` e
   `update_timetable_slot_guarded` (`:696`, `:762`).

O comentário no próprio código explica a razão da divisão (`:678-682`): a verificação em
JS seguida de `insert` tinha uma condição de corrida — duas chamadas concorrentes passavam
ambas, porque nenhum dos dois slots existia ainda, e ambas inseriam. É uma correcção
madura.

**Achado (P1): o corpo das duas funções `*_guarded` não está no repositório.** Confirmado:
zero ocorrências em `supabase/migrations/20260908210000_capture_all_db_functions.sql`. São
duas das 65 funções de produção sem corpo capturado (ver auditoria da área 3).

**Achado agravante (P1): não há rede declarativa por baixo.** As únicas restrições de
unicidade de `timetable_slots` são `(school_id, id)` e `(school_id, id, class_subject_id)`
— ambas incluem a chave primária, logo **são triviais e não impedem nada**. Não existe
`EXCLUDE` nem índice único sobre `(docente, dia, hora)`, `(turma, dia, hora)` ou
`(sala, dia, hora)`. Toda a prevenção de duplo agendamento assenta numa função que ninguém
pode rever e nenhum teste pode verificar a partir do repositório. Se ela regredir, nada na
base o apanha.

Os testes que existem (`tests/academic/schedule-conflicts.test.ts`) exercitam a **detecção
do cliente** (`src/features/academic/schedule/utils/conflicts.ts`, consumida em
`ScheduleWorkspace.tsx:156` por `useMemo`), que é apresentação — não a imposição.

## 4.4 Delegado, coordenador, capacidade e composição

**Implementado.** `class_groups` tem `delegate_student_id` (delegado),
`homeroom_teacher_id` (director de turma), `capacity` e `status`. A capacidade é
confrontada com a da sala em `assertScheduleSlotConflictsDetailed:539-543`.

**Não verificado:** papel de "coordenador" distinto do director de turma — só encontrei
`homeroom_teacher_id`.

## 4.5 Calendários, aulas, avaliações, feriados, eventos e alterações

**Parcialmente verificado.** Existem `academic_schedules` (com `version_number`, `status`,
`valid_from`/`valid_to`, `published_at` — versionamento de horários), `terms`,
`academic_years`, `siga_lesson_plans`, `siga_lesson_meetings` e `siga_assessment_items`.
Aulas materializadas por `hr_materialize_teacher_lessons`; agendamento por `schedule_lesson`.
Feed de calendário por `calendar_feed_tokens`.

**Não encontrei tabela de feriados** nem de eventos escolares gerais (os `*_events`
existentes são de auditoria, alumni ou RH). **P2** — ou está por implementar, ou os
feriados vivem em `academic_schedules`/`terms` de forma que não localizei.

`save_academic_calendar` existe como RPC, mas **também sem corpo capturado**.

## 4.6 Mapas de turma, presenças, desempenho e comunicação com encarregados

**Implementado.** Presenças em `siga_attendance_sessions`/`siga_attendance_records`, com
justificações (`siga_attendance_justifications`) e auditoria (`siga_attendance_audits`).
Desempenho por `enrollments.attendance_rate` e `final_average`. Comunicação por turma com
`class_groups.whatsapp_group_name`/`whatsapp_invite_url` e a camada
`communication_dispatches`/`communication_events`.

Corrigido há dias: o importador de horários escrevia para `class_schedule_slots`, tabela do
modelo antigo, e o de presenças filtrava `siga_attendance_records.date`, coluna que não
existe (a data está na sessão).

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P1** | Prevenção de conflitos de horário assenta em `create/update_timetable_slot_guarded`, sem corpo no repositório | 0 ocorrências na captura |
| **P1** | `timetable_slots` não tem restrição que impeça duplo agendamento — as duas `UNIQUE` incluem o `id` e são triviais | DDL capturado |
| **P2** | Sem tabela de feriados/eventos escolares localizada | retrato do esquema |
| **P3** | Papel de coordenador distinto do director de turma não localizado | `class_groups` |

**P0: nenhum.** O desenho é correcto — imposição na base, avisos no servidor, detecção no
cliente; o problema é que a peça que impõe não é auditável nem tem rede declarativa.
