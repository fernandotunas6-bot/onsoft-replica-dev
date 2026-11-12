# Estrutura académica, turmas e horários

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Estrutura académica, turmas e horários; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Administrador/Secretaria configuram; Professor consulta atribuições. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Configurar níveis/cursos/disciplinas → classes/salas → turma/ano/capacidade → atribuir docentes → preparar/publicar horário.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `siga_attendance_justifications.status`: `approved`, `pending`, `rejected`
- `siga_attendance_records.status`: `absent`, `early_exit`, `excused`, `late`, `not_registered`, `present`
- `siga_attendance_sessions.status`: `cancelled`, `completed`, `pending`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`
- `subjects.status`: `active`, `archived`, `inactive`
- `timetable_slots.status`: `active`, `archived`, `cancelled`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

Sem declaração de campos Zod local inventariada; consultar o contrato de origem/importado nas fontes, antes de qualquer alteração.

## Regras de negócio e fonte

Escola/ano coerentes em todas as relações; capacidade e conflito de turma/sala/professor são verificados no servidor.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

Especificação complementar: [SGA_TIMETABLE_PUBLICATION_UX_SPEC.md](../SGA_TIMETABLE_PUBLICATION_UX_SPEC.md).

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `class_groups` | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `class_subjects` | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `enrollments` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average` |
| `siga_attendance_audits` | `id`, `school_id`, `session_id`, `attendance_record_id`, `student_id`, `old_status`, `new_status`, `reason`, `changed_by`, `device_info`, `created_at` |
| `siga_attendance_justifications` | `id`, `school_id`, `student_id`, `attendance_record_id`, `session_id`, `reason`, `file_id`, `file_name`, `status`, `submitted_by`, `reviewed_by`, `review_notes`, `created_at`, `updated_at` |
| `siga_attendance_records` | `id`, `school_id`, `session_id`, `student_id`, `status`, `notes`, `recorded_by`, `created_at`, `updated_at` |
| `siga_attendance_sessions` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `subject_id`, `teacher_id`, `timetable_slot_id`, `lesson_date`, `period_number`, `starts_at`, `ends_at`, `status`, `notes`, `created_at`, `created_by`, `updated_at`, `updated_by` |
| `students` | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |
| `subjects` | `id`, `school_id`, `code`, `name`, `short_name`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `subject_type_id`, `curriculum_area_id`, `description`, `department`, `is_mandatory`, `is_practical`, `has_assessment`, `has_exam`, `has_attendance`, `has_pauta`, `annual_hours`, `default_lesson_duration`, `color`, `icon`, `display_order`, `deleted_at`, `version` |
| `timetable_slots` | `id`, `school_id`, `class_subject_id`, `weekday`, `starts_at`, `ends_at`, `room`, `status`, `created_by`, `created_at`, `updated_by`, `schedule_id`, `room_id`, `shift_id`, `day_period_number`, `notes` |

Relações confirmadas:

- `class_groups` → `academic_years` (`class_groups_school_id_academic_year_id_fkey`)
- `class_groups` → `campuses` (`class_groups_school_id_campus_id_fkey`)
- `class_groups` → `grade_levels` (`class_groups_school_id_grade_level_id_fkey`)
- `class_groups` → `rooms` (`class_groups_school_id_room_id_fkey`)
- `class_groups` → `schools` (`class_groups_school_id_fkey`)
- `class_groups` → `students` (`class_groups_delegate_student_fk`)
- `class_groups` → `teachers` (`class_groups_school_id_homeroom_teacher_id_fkey`)
- `class_subjects` → `class_groups` (`class_subjects_school_id_class_group_id_fkey`)
- `class_subjects` → `schools` (`class_subjects_school_id_fkey`)
- `class_subjects` → `subjects` (`class_subjects_school_id_subject_id_fkey`)
- `class_subjects` → `teachers` (`class_subjects_school_id_teacher_id_fkey`)
- `enrollments` → `academic_years` (`enrollments_school_id_academic_year_id_fkey`)
- `enrollments` → `class_groups` (`enrollments_school_id_class_group_id_fkey`)
- `enrollments` → `schools` (`enrollments_school_id_fkey`)
- `enrollments` → `students` (`enrollments_school_id_student_id_fkey`)
- `siga_attendance_audits` → `schools` (`siga_attendance_audits_school_id_fkey`)
- `siga_attendance_audits` → `siga_attendance_records` (`siga_attendance_audits_attendance_record_id_fkey`)
- `siga_attendance_audits` → `siga_attendance_sessions` (`siga_attendance_audits_session_id_fkey`)
- `siga_attendance_audits` → `students` (`siga_attendance_audits_student_id_fkey`)
- `siga_attendance_justifications` → `schools` (`siga_attendance_justifications_school_id_fkey`)
- `siga_attendance_justifications` → `siga_attendance_records` (`siga_attendance_justifications_attendance_record_id_fkey`)
- `siga_attendance_justifications` → `siga_attendance_sessions` (`siga_attendance_justifications_session_id_fkey`)
- `siga_attendance_justifications` → `siga_files` (`siga_attendance_justifications_file_id_fkey`)
- `siga_attendance_justifications` → `students` (`siga_attendance_justifications_student_id_fkey`)
- `siga_attendance_records` → `schools` (`siga_attendance_records_school_id_fkey`)
- `siga_attendance_records` → `siga_attendance_sessions` (`siga_attendance_records_session_id_fkey`)
- `siga_attendance_records` → `students` (`siga_attendance_records_student_id_fkey`)
- `siga_attendance_sessions` → `academic_years` (`siga_attendance_sessions_academic_year_id_fkey`)
- `siga_attendance_sessions` → `class_groups` (`siga_attendance_sessions_class_group_id_fkey`)
- `siga_attendance_sessions` → `schools` (`siga_attendance_sessions_school_id_fkey`)
- `siga_attendance_sessions` → `subjects` (`siga_attendance_sessions_subject_id_fkey`)
- `siga_attendance_sessions` → `teachers` (`siga_attendance_sessions_teacher_id_fkey`)
- `siga_attendance_sessions` → `timetable_slots` (`siga_attendance_sessions_timetable_slot_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)
- `subjects` → `curriculum_areas` (`subjects_curriculum_area_id_fkey`)
- `subjects` → `schools` (`subjects_school_id_fkey`)
- `subjects` → `subject_types` (`subjects_subject_type_id_fkey`)
- `timetable_slots` → `academic_schedules` (`timetable_slots_schedule_id_fkey`)
- `timetable_slots` → `class_subjects` (`timetable_slots_school_id_class_subject_id_fkey`)
- `timetable_slots` → `rooms` (`timetable_slots_room_id_fkey`)
- `timetable_slots` → `school_shifts` (`timetable_slots_shift_id_fkey`)
- `timetable_slots` → `schools` (`timetable_slots_school_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `listTeacherAttendanceSessions` | GET | `listTeacherAttendanceSessionsInputSchema` | [attendance-server.ts](../../../src/features/pedagogica/attendance-server.ts) |
| `getAttendanceCallSheet` | GET | `getAttendanceCallSheetInputSchema` | [attendance-server.ts](../../../src/features/pedagogica/attendance-server.ts) |
| `submitAttendanceCallBatch` | POST | `submitAttendanceCallBatchInputSchema` | [attendance-server.ts](../../../src/features/pedagogica/attendance-server.ts) |
| `editFinalizedAttendanceCall` | POST | `editFinalizedAttendanceCallInputSchema` | [attendance-server.ts](../../../src/features/pedagogica/attendance-server.ts) |
| `submitAttendanceJustification` | POST | `submitAttendanceJustificationInputSchema` | [attendance-server.ts](../../../src/features/pedagogica/attendance-server.ts) |
| `reviewAttendanceJustification` | POST | `reviewAttendanceJustificationInputSchema` | [attendance-server.ts](../../../src/features/pedagogica/attendance-server.ts) |
| `getStudentAttendanceHistory` | GET | `getStudentAttendanceHistoryInputSchema` | [attendance-server.ts](../../../src/features/pedagogica/attendance-server.ts) |

Erros esperados: sessão expirada, vínculo/grant insuficiente, AAL1 em escrita sensível, entrada inválida, recurso inexistente/fora do âmbito, conflito/duplicado, dependência indisponível e falha de persistência. Não expor SQL, tokens nem detalhes pessoais em mensagens/logs. A existência do endpoint não é prova de aceitação por perfil.

## Isolamento entre escolas

Verificar A/B em UI, ID enviado, servidor, RLS quando exposta, exportação, anexos, cache e realtime. `is_school_member` inclui alunos/encarregados: não serve sozinho para dados sensíveis/escrita. Cliente administrativo exige guardas e filtros de âmbito; troca de escola invalida o contexto anterior.

## Interface desktop e mobile

Preservar design system e terminologia; controlar largura de tabelas e altura de modais; campos com label e foco visível. Acção principal ligada ao estado real do pedido, sem duplo envio; confirmação de destruição; retorno com filtros/contexto. Viewport emulado não comprova toque, rotação, teclado virtual ou WebView nativo.

## Carregamento, vazio, sucesso, falha e acesso negado

Carregamento acompanha o pedido; vazio tem próxima acção adequada ao perfil. Sucesso exige resultado persistido/confirmado. Falha conserva dados e permite recuperação. Acesso negado não apresenta registos de outro âmbito nem aparenta lista vazia por erro silenciado.

## Auditoria e notificações

Actor/escola/acção/motivo/versão quando relevantes. Notificação é efeito do evento confirmado, com destinatário autorizado e repetição controlada. Destinos reais não são usados em ensaios. Logs não contêm senhas, códigos ou segredos.

## Critérios de aceitação

1. Perfil permitido conclui o fluxo principal; UI, pedido e banco concordam após refresh/login.
2. Entrada inválida e recurso de B enviado por A não produzem escrita nem exposição.
3. Pedido repetido e falha intermédia deixam resultado consistente; histórico e efeitos dependentes reconciliam.
4. Perfil sem grant e AAL1 em escrita sensível são recusados pelo servidor.
5. Documento/indicador/notificação corresponde a dados reais e ao filtro/contexto activo.
6. Desktop e mobile aplicáveis são utilizáveis por teclado; limitações reais ficam explicitadas.

## Testes, riscos e decisões pendentes

Testes existentes inventariados (a presença do ficheiro não afirma execução nesta evolução):

- [attendance-integrity.test.ts](../../../tests/pedagogica/attendance-integrity.test.ts)
- [attendance.test.ts](../../../tests/pedagogica/attendance.test.ts)
- [pautas.test.ts](../../../tests/pedagogica/pautas.test.ts)
- [teacher-assignment.test.ts](../../../tests/pedagogica/teacher-assignment.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação


[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
