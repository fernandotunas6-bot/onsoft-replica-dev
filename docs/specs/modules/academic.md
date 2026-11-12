# Avaliações, presenças, notas e pautas

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Avaliações, presenças, notas e pautas; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Professor, Secretaria e Administrador, com âmbito por turma/disciplina. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Configurar instrumentos → registar presença/avaliação → lançar notas → rever → fechar → emitir pauta → decidir transição.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `academic_schedules.status`: `approved`, `archived`, `draft`, `published`, `review`
- `academic_years.status`: `active`, `archived`, `closed`, `draft`
- `assessment_rule_sets.rounding_method`: `down`, `nearest`, `none`, `up`
- `assessment_rule_sets.status`: `active`, `retired`
- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `curricula.status`: `active`, `draft`, `inactive`
- `curriculum_areas.status`: `active`, `inactive`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `grade_items.kind`: `assignment`, `continuous`, `exam`, `informative`, `recovery`, `resit`, `term_exam`, `test`
- `grade_score_history.kind`: `change`, `launch`, `request_approved`, `request_rejected`
- `grade_scores.status`: `draft`, `locked`, `submitted`
- `grade_sheet_rows.result`: `fail`, `incomplete`, `pass`, `pending`
- `grade_sheets.kind`: `annual`, `term`
- `grade_sheets.status`: `closed`, `contested`, `draft`, `homologated`, `in_review`, `published`, `rectified`, `submitted`
- `gradebooks.status`: `closed`, `draft`, `open`, `submitted`
- `notifications.channel`: `email`, `in_app`, `sms`, `whatsapp`
- `notifications.status`: `delivered`, `failed`, `pending`, `read`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `program_subjects.status`: `active`, `inactive`
- `programs.grading_profile`: `20_ects`, `components`, `components`, `frequencia_exame`, `gpa4`, `scale`, `scale`, `so_exame`
- `programs.kind`: `general`, `postgraduate`, `professional`, `technical`, `undergraduate`
- `rooms.status`: `active`, `inactive`
- `school_shifts.status`: `active`, `inactive`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `siga_assessment_items.purpose`: `diagnostic`, `formative`, `summative`
- `siga_attendance_records.status`: `absent`, `early_exit`, `excused`, `late`, `not_registered`, `present`
- `siga_attendance_sessions.status`: `cancelled`, `completed`, `pending`
- `siga_class_tasks.kind`: `leitura`, `outra`, `pesquisa`, `projecto`, `tpc`, `trabalho`
- `siga_class_tasks.status`: `archived`, `published`
- `siga_competencies.status`: `active`, `archived`
- `siga_exam_registrations.status`: `absent`, `cancelled`, `graded`, `registered`
- `siga_exam_sessions.kind`: `exame_especial`, `exame_final`, `melhoria`, `recurso`
- `siga_exam_sessions.result_method`: `average`, `max`, `replace`
- `siga_exam_sessions.status`: `closed`, `draft`, `open`
- `siga_lesson_reminder_log.channel`: `email`, `in_app`, `sms`
- `siga_lesson_reminder_log.status`: `failed`, `sent`, `skipped`
- `siga_timetable_slot_details.delivery_mode`: `hibrido`, `online`, `presencial`, `zoom`
- `siga_timetable_slot_details.lesson_type`: `avaliacao`, `laboratorio`, `outra`, `pratica`, `revisao`, `teorica`
- `student_guardians.relationship`: `father`, `grandparent`, `guardian`, `mother`, `other`, `sibling`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`
- `subject_types.status`: `active`, `inactive`
- `subjects.status`: `active`, `archived`, `inactive`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`
- `timetable_slots.status`: `active`, `archived`, `cancelled`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo | Declaração observada | Schema de origem |
| --- | --- | --- |
| `academicYearId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `academicYearId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `gradeLevelId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `roomId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `code` | `classGroupCode,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `classGroupName,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `shift` | `z.enum(classShiftOptions),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `capacity` | `z.number().int().positive().max(200).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `whatsappInviteUrl` | `optionalHttpUrl,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `whatsappGroupName` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `code` | `classGroupCode,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `classGroupName,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `shift` | `z.enum(classShiftOptions),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `capacity` | `z.number().int().positive().max(200).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `roomId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `status` | `z.enum(["active", "inactive"]).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `whatsappInviteUrl` | `optionalHttpUrl,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `whatsappGroupName` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `yearCode` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `yearName` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `code` | `subjectCode,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `z.string().trim().min(2).max(120),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `teacherName` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `weeklyHours` | `z.number().int().min(1).max(20).default(4),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `gradeFrom` | `z.number().int().min(1).max(99).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `gradeTo` | `z.number().int().min(1).max(99).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectTypeId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `curriculumAreaId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `shortName` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `description` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `department` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `isMandatory` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `isPractical` | `z.boolean().default(false),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `hasAssessment` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `hasExam` | `z.boolean().default(false),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `hasAttendance` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `hasPauta` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `annualHours` | `z.number().int().positive().optional().nullable(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `defaultLessonDuration` | `z.number().int().min(15).max(180).default(45),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `color` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `icon` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `code` | `subjectCode,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `z.string().trim().min(2).max(120),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `weeklyHours` | `z.number().int().min(1).max(20).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `gradeFrom` | `z.number().int().min(1).max(99).optional().nullable(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `gradeTo` | `z.number().int().min(1).max(99).optional().nullable(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectTypeId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `curriculumAreaId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `shortName` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `description` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `department` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `isMandatory` | `z.boolean().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `isPractical` | `z.boolean().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `hasAssessment` | `z.boolean().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `hasExam` | `z.boolean().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `hasAttendance` | `z.boolean().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `hasPauta` | `z.boolean().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `annualHours` | `z.number().int().positive().optional().nullable(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `defaultLessonDuration` | `z.number().int().min(15).max(180).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `color` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `icon` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `enrollmentId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `term` | `z.union([z.literal(1), z.literal(2), z.literal(3)]),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `mac` | `z.number().min(0).max(20),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `npp` | `z.number().min(0).max(20),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `npt` | `z.number().min(0).max(20),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `term` | `z.union([z.literal(1), z.literal(2), z.literal(3)]),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `rows` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `classGroupId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `term` | `z.union([z.literal(1), z.literal(2), z.literal(3)]),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `z.string().trim().min(2).max(160),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `kind` | `assessmentKindSchema.default("teste"),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `component` | `assessmentComponentSchema.default("NPP"),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `assessedOn` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `startsAt` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `durationMinutes` | `z.number().int().min(5).max(600).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `purpose` | `z.enum(["diagnostic", "formative", "summative"]).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `maxScore` | `z.number().min(1).max(20).default(20),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `description` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `countsTowardPauta` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `allowRecovery` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `z.string().trim().min(2).max(160),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `kind` | `assessmentKindSchema,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `component` | `assessmentComponentSchema,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `assessedOn` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `startsAt` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `durationMinutes` | `z.number().int().min(5).max(600).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `purpose` | `z.enum(["diagnostic", "formative", "summative"]).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `maxScore` | `z.number().min(1).max(20).default(20),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `description` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `countsTowardPauta` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `allowRecovery` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `itemId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `force` | `z.boolean().optional().default(false),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `classGroupId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `term` | `z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `itemId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `rows` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `term` | `z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `limit` | `z.number().int().min(1).max(200).default(100),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `slotId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `teacherId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `academicYearId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `classGroupId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `teacherId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `classGroupId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `studentId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `programId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `programId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjectId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `semester` | `z.number().int().min(1).max(12),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `credits` | `z.number().positive().max(60).default(6),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `programId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `gradingProfile` | `gradingProfileSchema.nullable(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `classGroupId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `programId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `code` | `z.string().trim().min(1).max(40),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `z.string().trim().min(2).max(100),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `description` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `countsForGpa` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `appearsInPauta` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `hasExam` | `z.boolean().default(false),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `canFail` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `isMandatory` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `defaultWeight` | `z.number().min(0.1).max(10).default(1),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `requiresSpecialRoom` | `z.boolean().default(false),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `allowsSimultaneousClasses` | `z.boolean().default(false),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `requiresSpecializedTeacher` | `z.boolean().default(false),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `color` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `status` | `z.enum(["active", "inactive"]).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `code` | `z.string().trim().min(1).max(40),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `z.string().trim().min(2).max(100),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `description` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `color` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `displayOrder` | `z.number().int().default(0),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `status` | `z.enum(["active", "inactive"]).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `code` | `z.string().trim().min(1).max(40),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `z.string().trim().min(2).max(120),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `capacity` | `z.number().int().positive().max(500).default(35),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `roomType` | `roomTypeSchema.default("standard"),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `building` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `block` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `floor` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `resources` | `z.array(z.string()).default([]),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `accessibility` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `notes` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `building` | `clearableText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `block` | `clearableText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `floor` | `clearableText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `notes` | `clearableText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `status` | `z.enum(["active", "inactive"]).optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `code` | `z.string().trim().min(1).max(40),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `z.string().trim().min(2).max(100),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `startsAt` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `endsAt` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `defaultLessonDuration` | `z.number().int().min(15).max(180).default(45),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `defaultBreakDuration` | `z.number().int().min(0).max(120).default(15),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `activeDays` | `z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `color` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `academicYearId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `courseId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `gradeLevelId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `z.string().trim().min(2).max(120),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `description` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `subjects` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `teacherId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `academicYearId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `slots` | `z.array(` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `maxWeeklyHours` | `z.number().int().min(1).max(60).default(24),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `classGroupId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `academicYearId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `name` | `optionalText,` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `validFrom` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `validTo` | `z` | [schemas.ts](../../../src/features/academic/schemas.ts) |
| `syncToCalendar` | `z.boolean().default(true),` | [schemas.ts](../../../src/features/academic/schemas.ts) |

## Regras de negócio e fonte

As fórmulas e a decisão de promoção vêm do modelo vigente; ausência, zero e dispensa são distintos. Fecho de período impede alterações não autorizadas.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

Especificação complementar: [SGA_ANGOLA_LESSON_PLANS_ASSESSMENTS_2026.md](../SGA_ANGOLA_LESSON_PLANS_ASSESSMENTS_2026.md).

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `academic_levels` | `id`, `school_id`, `code`, `name`, `sequence`, `is_active`, `created_at` |
| `academic_schedules` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `version_number`, `name`, `status`, `valid_from`, `valid_to`, `published_at`, `published_by`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `academic_years` | `id`, `school_id`, `name`, `starts_on`, `ends_on`, `status`, `created_at`, `created_by`, `updated_by` |
| `assessment_key_subjects` | `id`, `school_id`, `rule_set_id`, `subject_id`, `created_at` |
| `assessment_rule_sets` | `id`, `school_id`, `grading_scale_id`, `code`, `name`, `version`, `status`, `continuous_weight`, `exam_weight`, `passing_value`, `maximum_absence_percentage`, `rounding_method`, `grade_change_requires_approval`, `lock_after_publication`, `formula`, `created_by`, `created_at` |
| `audit_logs` | `id`, `school_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `occurred_at` |
| `campuses` | `id`, `school_id`, `code`, `name`, `province`, `municipality`, `is_active`, `created_at`, `address` |
| `class_groups` | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `class_subjects` | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `curricula` | `id`, `school_id`, `academic_year_id`, `course_id`, `grade_level_id`, `name`, `description`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `curriculum_areas` | `id`, `school_id`, `code`, `name`, `description`, `color`, `display_order`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `curriculum_subjects` | `id`, `school_id`, `curriculum_id`, `subject_id`, `subject_type_id`, `weekly_periods`, `period_duration_minutes`, `is_mandatory`, `display_order`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `enrollments` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average` |
| `grade_items` | `id`, `school_id`, `gradebook_id`, `code`, `name`, `kind`, `weight`, `max_score`, `assessed_on`, `sequence`, `created_by`, `created_at` |
| `grade_levels` | `id`, `school_id`, `program_id`, `code`, `name`, `sequence`, `is_active`, `created_at` |
| `grade_score_history` | `id`, `school_id`, `grade_score_id`, `previous_score`, `new_score`, `reason`, `actor_user_id`, `approved_by`, `kind`, `created_at` |
| `grade_scores` | `id`, `school_id`, `grade_item_id`, `enrollment_id`, `score`, `status`, `note`, `recorded_by`, `updated_by`, `created_at`, `updated_at`, `pending_score`, `pending_reason`, `pending_requested_by`, `pending_requested_at` |
| `grade_sheet_rows` | `id`, `school_id`, `grade_sheet_id`, `enrollment_id`, `continuous_average`, `exam_average`, `term_average`, `absence_percentage`, `result`, `observation`, `subject_breakdown`, `created_at`, `updated_at` |
| `grade_sheet_versions` | `id`, `school_id`, `grade_sheet_id`, `version`, `status`, `reason`, `rule_set_id`, `built_at`, `snapshot`, `archived_by`, `archived_at` |
| `grade_sheets` | `id`, `school_id`, `academic_year_id`, `term_id`, `class_group_id`, `rule_set_id`, `kind`, `status`, `title`, `submitted_at`, `homologated_at`, `published_at`, `closed_at`, `reopen_reason`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `gradebooks` | `id`, `school_id`, `academic_year_id`, `term_id`, `class_subject_id`, `class_group_id`, `rule_set_id`, `status`, `opened_at`, `submitted_at`, `closed_at`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `grading_scales` | `id`, `school_id`, `code`, `name`, `version`, `minimum_value`, `maximum_value`, `passing_value`, `decimal_places`, `is_active`, `created_at` |
| `notifications` | `id`, `school_id`, `user_id`, `channel`, `event_type`, `title`, `body`, `payload`, `announcement_id`, `status`, `read_at`, `created_at` |
| `people` | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address` |
| `program_subjects` | `id`, `school_id`, `program_id`, `subject_id`, `semester`, `credits`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `programs` | `id`, `school_id`, `academic_level_id`, `code`, `name`, `kind`, `is_active`, `created_at`, `grading_profile` |
| `rooms` | `id`, `school_id`, `code`, `name`, `capacity`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `room_type`, `campus_id`, `building`, `block`, `floor`, `resources`, `accessibility`, `notes` |
| `school_settings` | `id`, `school_id`, `domain`, `version`, `value`, `changed_by`, `created_at` |
| `school_shifts` | `id`, `school_id`, `code`, `name`, `starts_at`, `ends_at`, `default_lesson_duration`, `default_break_duration`, `active_days`, `color`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `schools` | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `siga_assessment_item_competencies` | `id`, `school_id`, `item_id`, `competency_id`, `created_by`, `created_at` |
| `siga_assessment_items` | `id`, `school_id`, `class_group_id`, `subject_id`, `term`, `name`, `kind`, `component`, `assessed_on`, `max_score`, `counts_toward_pauta`, `allow_recovery`, `description`, `created_at`, `updated_at`, `created_by`, `updated_by`, `lesson_plan_component_id`, `starts_at`, `duration_minutes`, `purpose` |
| `siga_assessment_scores` | `id`, `school_id`, `item_id`, `enrollment_id`, `score`, `previous_score`, `status`, `recorded_by`, `updated_at` |
| `siga_attendance_records` | `id`, `school_id`, `session_id`, `student_id`, `status`, `notes`, `recorded_by`, `created_at`, `updated_at` |
| `siga_attendance_sessions` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `subject_id`, `teacher_id`, `timetable_slot_id`, `lesson_date`, `period_number`, `starts_at`, `ends_at`, `status`, `notes`, `created_at`, `created_by`, `updated_at`, `updated_by` |
| `siga_class_tasks` | `id`, `school_id`, `class_subject_id`, `timetable_slot_id`, `kind`, `title`, `description`, `due_on`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `siga_competencies` | `id`, `school_id`, `subject_id`, `grade_level_id`, `code`, `description`, `status`, `display_order`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `siga_exam_registrations` | `id`, `school_id`, `session_id`, `enrollment_id`, `subject_id`, `class_group_id`, `grade_sheet_id`, `original_average`, `exam_date`, `room`, `jury`, `score`, `final_average`, `status`, `notes`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `siga_exam_sessions` | `id`, `school_id`, `academic_year_id`, `kind`, `name`, `starts_on`, `ends_on`, `max_failed_subjects`, `result_method`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `siga_lesson_reminder_log` | `id`, `school_id`, `user_id`, `lesson_date`, `channel`, `lessons_count`, `status`, `error`, `created_at` |
| `siga_lesson_reminder_settings` | `school_id`, `enabled`, `send_hour`, `notify_teachers`, `notify_students`, `notify_guardians`, `channel_in_app`, `channel_email`, `channel_sms`, `notify_on_publish`, `updated_by`, `created_at`, `updated_at` |
| `siga_timetable_slot_details` | `id`, `school_id`, `timetable_slot_id`, `lesson_type`, `delivery_mode`, `online_url`, `topic`, `notes`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `student_academic_history` | `id`, `school_id`, `student_id`, `academic_year_label`, `grade_level`, `previous_school`, `final_average`, `outcome`, `notes`, `created_by`, `created_at`, `updated_at`, `enrollment_id`, `grade_sheet_id`, `subject_results`, `absence_percentage`, `updated_by` |
| `student_guardians` | `id`, `school_id`, `student_id`, `guardian_person_id`, `relationship`, `is_primary`, `is_financially_responsible`, `is_pickup_authorized`, `valid_from`, `valid_until`, `created_by`, `created_at` |
| `students` | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |
| `subject_types` | `id`, `school_id`, `code`, `name`, `description`, `counts_for_gpa`, `appears_in_pauta`, `has_exam`, `can_fail`, `is_mandatory`, `default_weight`, `requires_special_room`, `allows_simultaneous_classes`, `requires_specialized_teacher`, `color`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `subjects` | `id`, `school_id`, `code`, `name`, `short_name`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `subject_type_id`, `curriculum_area_id`, `description`, `department`, `is_mandatory`, `is_practical`, `has_assessment`, `has_exam`, `has_attendance`, `has_pauta`, `annual_hours`, `default_lesson_duration`, `color`, `icon`, `display_order`, `deleted_at`, `version` |
| `teacher_availability` | `id`, `school_id`, `teacher_id`, `academic_year_id`, `weekday`, `starts_at`, `ends_at`, `is_available`, `max_weekly_hours`, `notes`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version` |
| `teachers` | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id` |
| `terms` | `id`, `school_id`, `academic_year_id`, `name`, `sequence`, `starts_on`, `ends_on`, `created_at`, `created_by`, `updated_by` |
| `timetable_slots` | `id`, `school_id`, `class_subject_id`, `weekday`, `starts_at`, `ends_at`, `room`, `status`, `created_by`, `created_at`, `updated_by`, `schedule_id`, `room_id`, `shift_id`, `day_period_number`, `notes` |

Relações confirmadas:

- `academic_levels` → `schools` (`academic_levels_school_id_fkey`)
- `academic_schedules` → `academic_years` (`academic_schedules_academic_year_id_fkey`)
- `academic_schedules` → `class_groups` (`academic_schedules_class_group_id_fkey`)
- `academic_schedules` → `schools` (`academic_schedules_school_id_fkey`)
- `academic_years` → `schools` (`academic_years_school_id_fkey`)
- `assessment_key_subjects` → `assessment_rule_sets` (`assessment_key_subjects_rule_set_id_fkey`)
- `assessment_key_subjects` → `schools` (`assessment_key_subjects_school_id_fkey`)
- `assessment_key_subjects` → `subjects` (`assessment_key_subjects_subject_id_fkey`)
- `assessment_rule_sets` → `grading_scales` (`assessment_rule_sets_grading_scale_id_fkey`)
- `assessment_rule_sets` → `schools` (`assessment_rule_sets_school_id_fkey`)
- `audit_logs` → `schools` (`audit_logs_school_id_fkey`)
- `campuses` → `schools` (`campuses_school_id_fkey`)
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
- `curricula` → `academic_years` (`curricula_academic_year_id_fkey`)
- `curricula` → `grade_levels` (`curricula_grade_level_id_fkey`)
- `curricula` → `programs` (`curricula_course_id_fkey`)
- `curricula` → `schools` (`curricula_school_id_fkey`)
- `curriculum_areas` → `schools` (`curriculum_areas_school_id_fkey`)
- `curriculum_subjects` → `curricula` (`curriculum_subjects_curriculum_id_fkey`)
- `curriculum_subjects` → `schools` (`curriculum_subjects_school_id_fkey`)
- `curriculum_subjects` → `subject_types` (`curriculum_subjects_subject_type_id_fkey`)
- `curriculum_subjects` → `subjects` (`curriculum_subjects_subject_id_fkey`)
- `enrollments` → `academic_years` (`enrollments_school_id_academic_year_id_fkey`)
- `enrollments` → `class_groups` (`enrollments_school_id_class_group_id_fkey`)
- `enrollments` → `schools` (`enrollments_school_id_fkey`)
- `enrollments` → `students` (`enrollments_school_id_student_id_fkey`)
- `grade_items` → `gradebooks` (`grade_items_school_id_gradebook_id_fkey`)
- `grade_items` → `schools` (`grade_items_school_id_fkey`)
- `grade_levels` → `programs` (`grade_levels_school_id_program_id_fkey`)
- `grade_levels` → `schools` (`grade_levels_school_id_fkey`)
- `grade_score_history` → `grade_scores` (`grade_score_history_grade_score_id_fkey`)
- `grade_score_history` → `schools` (`grade_score_history_school_id_fkey`)
- `grade_scores` → `enrollments` (`grade_scores_school_id_enrollment_id_fkey`)
- `grade_scores` → `grade_items` (`grade_scores_school_id_grade_item_id_fkey`)
- `grade_scores` → `schools` (`grade_scores_school_id_fkey`)
- `grade_sheet_rows` → `enrollments` (`grade_sheet_rows_school_id_enrollment_id_fkey`)
- `grade_sheet_rows` → `grade_sheets` (`grade_sheet_rows_school_id_grade_sheet_id_fkey`)
- `grade_sheet_rows` → `schools` (`grade_sheet_rows_school_id_fkey`)
- `grade_sheet_versions` → `grade_sheets` (`grade_sheet_versions_grade_sheet_id_fkey`)
- `grade_sheet_versions` → `schools` (`grade_sheet_versions_school_id_fkey`)
- `grade_sheets` → `academic_years` (`grade_sheets_school_id_academic_year_id_fkey`)
- `grade_sheets` → `class_groups` (`grade_sheets_school_id_class_group_id_fkey`)
- `grade_sheets` → `schools` (`grade_sheets_school_id_fkey`)
- `grade_sheets` → `terms` (`grade_sheets_school_id_term_id_fkey`)
- `gradebooks` → `academic_years` (`gradebooks_school_id_academic_year_id_fkey`)
- `gradebooks` → `class_groups` (`gradebooks_school_id_class_group_id_fkey`)
- `gradebooks` → `class_subjects` (`gradebooks_school_id_class_subject_id_fkey`)
- `gradebooks` → `schools` (`gradebooks_school_id_fkey`)
- `gradebooks` → `terms` (`gradebooks_school_id_term_id_fkey`)
- `grading_scales` → `schools` (`grading_scales_school_id_fkey`)
- `notifications` → `announcements` (`notifications_announcement_fk`)
- `notifications` → `schools` (`notifications_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `program_subjects` → `programs` (`program_subjects_program_id_fkey`)
- `program_subjects` → `schools` (`program_subjects_school_id_fkey`)
- `program_subjects` → `subjects` (`program_subjects_subject_fkey`)
- `programs` → `academic_levels` (`programs_school_id_academic_level_id_fkey`)
- `programs` → `schools` (`programs_school_id_fkey`)
- `rooms` → `schools` (`rooms_school_id_fkey`)
- `school_settings` → `schools` (`school_settings_school_id_fkey`)
- `school_shifts` → `schools` (`school_shifts_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `siga_assessment_item_competencies` → `schools` (`siga_assessment_item_competencies_school_id_fkey`)
- `siga_assessment_item_competencies` → `siga_assessment_items` (`siga_assessment_item_competencies_item_id_fkey`)
- `siga_assessment_item_competencies` → `siga_competencies` (`siga_assessment_item_competencies_competency_id_fkey`)
- `siga_assessment_items` → `schools` (`siga_assessment_items_school_id_fkey`)
- `siga_assessment_items` → `siga_lesson_plan_components` (`siga_assessment_items_lesson_plan_component_id_fkey`)
- `siga_assessment_scores` → `schools` (`siga_assessment_scores_school_id_fkey`)
- `siga_assessment_scores` → `siga_assessment_items` (`siga_assessment_scores_item_id_fkey`)
- `siga_attendance_records` → `schools` (`siga_attendance_records_school_id_fkey`)
- `siga_attendance_records` → `siga_attendance_sessions` (`siga_attendance_records_session_id_fkey`)
- `siga_attendance_records` → `students` (`siga_attendance_records_student_id_fkey`)
- `siga_attendance_sessions` → `academic_years` (`siga_attendance_sessions_academic_year_id_fkey`)
- `siga_attendance_sessions` → `class_groups` (`siga_attendance_sessions_class_group_id_fkey`)
- `siga_attendance_sessions` → `schools` (`siga_attendance_sessions_school_id_fkey`)
- `siga_attendance_sessions` → `subjects` (`siga_attendance_sessions_subject_id_fkey`)
- `siga_attendance_sessions` → `teachers` (`siga_attendance_sessions_teacher_id_fkey`)
- `siga_attendance_sessions` → `timetable_slots` (`siga_attendance_sessions_timetable_slot_id_fkey`)
- `siga_class_tasks` → `class_subjects` (`siga_class_tasks_class_subject_id_fkey`)
- `siga_class_tasks` → `schools` (`siga_class_tasks_school_id_fkey`)
- `siga_class_tasks` → `timetable_slots` (`siga_class_tasks_timetable_slot_id_fkey`)
- `siga_competencies` → `grade_levels` (`siga_competencies_grade_level_id_fkey`)
- `siga_competencies` → `schools` (`siga_competencies_school_id_fkey`)
- `siga_competencies` → `subjects` (`siga_competencies_subject_id_fkey`)
- `siga_exam_registrations` → `class_groups` (`siga_exam_registrations_class_group_id_fkey`)
- `siga_exam_registrations` → `enrollments` (`siga_exam_registrations_enrollment_id_fkey`)
- `siga_exam_registrations` → `grade_sheets` (`siga_exam_registrations_grade_sheet_id_fkey`)
- `siga_exam_registrations` → `schools` (`siga_exam_registrations_school_id_fkey`)
- `siga_exam_registrations` → `siga_exam_sessions` (`siga_exam_registrations_session_id_fkey`)
- `siga_exam_registrations` → `subjects` (`siga_exam_registrations_subject_id_fkey`)
- `siga_exam_sessions` → `academic_years` (`siga_exam_sessions_academic_year_id_fkey`)
- `siga_exam_sessions` → `schools` (`siga_exam_sessions_school_id_fkey`)
- `siga_lesson_reminder_log` → `schools` (`siga_lesson_reminder_log_school_id_fkey`)
- `siga_lesson_reminder_settings` → `schools` (`siga_lesson_reminder_settings_school_id_fkey`)
- `siga_timetable_slot_details` → `schools` (`siga_timetable_slot_details_school_id_fkey`)
- `siga_timetable_slot_details` → `timetable_slots` (`siga_timetable_slot_details_timetable_slot_id_fkey`)
- `student_academic_history` → `enrollments` (`student_academic_history_enrollment_id_fkey`)
- `student_academic_history` → `grade_sheets` (`student_academic_history_grade_sheet_id_fkey`)
- `student_academic_history` → `schools` (`student_academic_history_school_id_fkey`)
- `student_academic_history` → `students` (`student_academic_history_student_fkey`)
- `student_guardians` → `people` (`student_guardians_school_id_guardian_person_id_fkey`)
- `student_guardians` → `schools` (`student_guardians_school_id_fkey`)
- `student_guardians` → `students` (`student_guardians_school_id_student_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)
- `subject_types` → `schools` (`subject_types_school_id_fkey`)
- `subjects` → `curriculum_areas` (`subjects_curriculum_area_id_fkey`)
- `subjects` → `schools` (`subjects_school_id_fkey`)
- `subjects` → `subject_types` (`subjects_subject_type_id_fkey`)
- `teacher_availability` → `academic_years` (`teacher_availability_academic_year_id_fkey`)
- `teacher_availability` → `schools` (`teacher_availability_school_id_fkey`)
- `teacher_availability` → `teachers` (`teacher_availability_teacher_id_fkey`)
- `teachers` → `people` (`teachers_school_id_person_id_fkey`)
- `teachers` → `schools` (`teachers_school_id_fkey`)
- `terms` → `academic_years` (`terms_school_id_academic_year_id_fkey`)
- `terms` → `schools` (`terms_school_id_fkey`)
- `timetable_slots` → `academic_schedules` (`timetable_slots_schedule_id_fkey`)
- `timetable_slots` → `class_subjects` (`timetable_slots_school_id_class_subject_id_fkey`)
- `timetable_slots` → `rooms` (`timetable_slots_room_id_fkey`)
- `timetable_slots` → `school_shifts` (`timetable_slots_shift_id_fkey`)
- `timetable_slots` → `schools` (`timetable_slots_school_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `listAcademicCalendar` | GET | `listAcademicCalendarInputSchema` | [academic-calendar.ts](../../../src/features/academic/academic-calendar.ts) |
| `saveAcademicCalendar` | POST | `saveAcademicCalendarInputSchema` | [academic-calendar.ts](../../../src/features/academic/academic-calendar.ts) |
| `getAcademicStructureStatus` | GET | `inputSchema` | [academic-structure.ts](../../../src/features/academic/academic-structure.ts) |
| `listSubjectTypes` | GET | `Sem schema de entrada explícito neste bloco` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `createSubjectType` | POST | `createSubjectTypeInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `updateSubjectType` | POST | `updateSubjectTypeInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `listCurriculumAreas` | GET | `Sem schema de entrada explícito neste bloco` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `createCurriculumArea` | POST | `createCurriculumAreaInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `listRooms` | GET | `Sem schema de entrada explícito neste bloco` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `createRoom` | POST | `createRoomInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `updateRoom` | POST | `updateRoomInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `listSchoolShifts` | GET | `Sem schema de entrada explícito neste bloco` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `saveSchoolShift` | POST | `createSchoolShiftInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `listCurricula` | GET | `Sem schema de entrada explícito neste bloco` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `saveCurriculumMatrix` | POST | `saveCurriculumMatrixInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `listTeacherAvailability` | GET | `Sem schema de entrada explícito neste bloco` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `saveTeacherAvailability` | POST | `saveTeacherAvailabilityInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `createAdvancedScheduleSlot` | POST | `createScheduleSlotInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `updateAdvancedScheduleSlot` | POST | `updateScheduleSlotInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `publishAcademicSchedule` | POST | `publishAcademicScheduleInputSchema` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `getSchoolNowOverview` | GET | `Sem schema de entrada explícito neste bloco` | [advanced-academic-server.ts](../../../src/features/academic/advanced-academic-server.ts) |
| `getAssessmentModels` | GET | `Sem schema de entrada explícito neste bloco` | [assessment-models.ts](../../../src/features/academic/assessment-models.ts) |
| `publishAssessmentModel` | POST | `Sem schema de entrada explícito neste bloco` | [assessment-models.ts](../../../src/features/academic/assessment-models.ts) |
| `getActivePassingValue` | GET | `Sem schema de entrada explícito neste bloco` | [assessment-models.ts](../../../src/features/academic/assessment-models.ts) |
| `getCompetencyBoard` | GET | `Sem schema de entrada explícito neste bloco` | [competencies.ts](../../../src/features/academic/competencies.ts) |
| `saveCompetency` | POST | `Sem schema de entrada explícito neste bloco` | [competencies.ts](../../../src/features/academic/competencies.ts) |
| `archiveCompetency` | POST | `Sem schema de entrada explícito neste bloco` | [competencies.ts](../../../src/features/academic/competencies.ts) |
| `setItemCompetencies` | POST | `Sem schema de entrada explícito neste bloco` | [competencies.ts](../../../src/features/academic/competencies.ts) |
| `applyCurriculumTemplate` | POST | `applyCurriculumTemplateInputSchema` | [curriculum-templates-server.ts](../../../src/features/academic/curriculum-templates-server.ts) |
| `getClassWarningContext` | GET | `Sem schema de entrada explícito neste bloco` | [early-warning-server.ts](../../../src/features/academic/early-warning-server.ts) |
| `getExamBoard` | GET | `Sem schema de entrada explícito neste bloco` | [exams.ts](../../../src/features/academic/exams.ts) |
| `createExamSession` | POST | `Sem schema de entrada explícito neste bloco` | [exams.ts](../../../src/features/academic/exams.ts) |
| `setExamSessionStatus` | POST | `Sem schema de entrada explícito neste bloco` | [exams.ts](../../../src/features/academic/exams.ts) |
| `getExamClassDetail` | GET | `Sem schema de entrada explícito neste bloco` | [exams.ts](../../../src/features/academic/exams.ts) |
| `registerEligibleStudents` | POST | `Sem schema de entrada explícito neste bloco` | [exams.ts](../../../src/features/academic/exams.ts) |
| `saveExamScores` | POST | `Sem schema de entrada explícito neste bloco` | [exams.ts](../../../src/features/academic/exams.ts) |
| `cancelExamRegistration` | POST | `Sem schema de entrada explícito neste bloco` | [exams.ts](../../../src/features/academic/exams.ts) |
| `getClassFinalResults` | GET | `Sem schema de entrada explícito neste bloco` | [final-results.ts](../../../src/features/academic/final-results.ts) |
| `recordClassFinalResults` | POST | `Sem schema de entrada explícito neste bloco` | [final-results.ts](../../../src/features/academic/final-results.ts) |
| `requestGradeChange` | POST | `Sem schema de entrada explícito neste bloco` | [grade-change-requests.ts](../../../src/features/academic/grade-change-requests.ts) |
| `listGradeChangeRequests` | GET | `Sem schema de entrada explícito neste bloco` | [grade-change-requests.ts](../../../src/features/academic/grade-change-requests.ts) |
| `decideGradeChange` | POST | `Sem schema de entrada explícito neste bloco` | [grade-change-requests.ts](../../../src/features/academic/grade-change-requests.ts) |
| `getGradeSheetBoard` | GET | `Sem schema de entrada explícito neste bloco` | [grade-sheets.ts](../../../src/features/academic/grade-sheets.ts) |
| `getGradeSheetDetail` | GET | `Sem schema de entrada explícito neste bloco` | [grade-sheets.ts](../../../src/features/academic/grade-sheets.ts) |
| `buildGradeSheet` | POST | `Sem schema de entrada explícito neste bloco` | [grade-sheets.ts](../../../src/features/academic/grade-sheets.ts) |
| `transitionGradeSheet` | POST | `Sem schema de entrada explícito neste bloco` | [grade-sheets.ts](../../../src/features/academic/grade-sheets.ts) |
| `listPedagogicalWorkspace` | GET | `listPedagogicalWorkspaceInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `createClassGroup` | POST | `createClassGroupInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `updateClassGroup` | POST | `updateClassGroupInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `deleteClassGroup` | POST | `deleteClassGroupInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `createSubject` | POST | `createSubjectInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `updateSubject` | POST | `updateSubjectInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `deactivateSubject` | POST | `deactivateSubjectInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `listTermGrades` | GET | `listTermGradesInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `upsertTermGrade` | POST | `upsertTermGradeInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `upsertTermGradesBatch` | POST | `upsertTermGradesBatchInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `assignClassSubjectTeacher` | POST | `assignClassSubjectTeacherInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `unassignClassSubjectTeacher` | POST | `unassignClassSubjectTeacherInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `ensureAcademicDefaults` | POST | `ensureAcademicDefaultsInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `getTeacherWorkspace` | GET | `getTeacherWorkspaceInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `listAssessments` | GET | `listAssessmentsInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `createAssessment` | POST | `createAssessmentInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `upsertAssessmentScores` | POST | `upsertAssessmentScoresInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `updateAssessmentItem` | POST | `updateAssessmentInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `deleteAssessmentItem` | POST | `deleteAssessmentInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `getStudentAcademicHistory` | GET | `getStudentAcademicHistoryInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `listProgramCurriculum` | GET | `listProgramCurriculumInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `addProgramSubject` | POST | `addProgramSubjectInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `removeProgramSubject` | POST | `removeProgramSubjectInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `applyCurriculumToClassGroup` | POST | `applyCurriculumToClassGroupInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `updateProgramGradingProfile` | POST | `updateProgramGradingProfileInputSchema` | [server-legacy.ts](../../../src/features/academic/server-legacy.ts) |
| `getTeacherWorkspace` | GET | `getTeacherWorkspaceInputSchema` | [server-secure-legacy.ts](../../../src/features/academic/server-secure-legacy.ts) |
| `listTermGrades` | GET | `listTermGradesInputSchema` | [server-secure-legacy.ts](../../../src/features/academic/server-secure-legacy.ts) |
| `listAssessments` | GET | `listAssessmentsInputSchema` | [server-secure-legacy.ts](../../../src/features/academic/server-secure-legacy.ts) |
| `updateAssessmentItem` | POST | `updateAssessmentInputSchema` | [server-secure-legacy.ts](../../../src/features/academic/server-secure-legacy.ts) |
| `deleteAssessmentItem` | POST | `deleteAssessmentInputSchema` | [server-secure-legacy.ts](../../../src/features/academic/server-secure-legacy.ts) |
| `getStudentAcademicHistory` | GET | `getStudentAcademicHistoryInputSchema` | [server-secure-legacy.ts](../../../src/features/academic/server-secure-legacy.ts) |
| `listPedagogicalWorkspace` | GET | `listPedagogicalWorkspaceInputSchema` | [server-secure-legacy.ts](../../../src/features/academic/server-secure-legacy.ts) |
| `deleteScheduleSlot` | POST | `deleteScheduleSlotInputSchema` | [server.ts](../../../src/features/academic/server.ts) |
| `getMyStudentGrades` | GET | `inputSchema` | [student-grades.ts](../../../src/features/academic/student-grades.ts) |
| `getMyTeacherAssessmentBoard` | GET | `Sem schema de entrada explícito neste bloco` | [teacher-assessments.ts](../../../src/features/academic/teacher-assessments.ts) |
| `getLessonDetail` | GET | `Sem schema de entrada explícito neste bloco` | [timetable-lessons.ts](../../../src/features/academic/timetable-lessons.ts) |
| `saveLessonDetail` | POST | `Sem schema de entrada explícito neste bloco` | [timetable-lessons.ts](../../../src/features/academic/timetable-lessons.ts) |
| `createClassTask` | POST | `Sem schema de entrada explícito neste bloco` | [timetable-lessons.ts](../../../src/features/academic/timetable-lessons.ts) |
| `archiveClassTask` | POST | `Sem schema de entrada explícito neste bloco` | [timetable-lessons.ts](../../../src/features/academic/timetable-lessons.ts) |
| `getMyTeacherTimetable` | GET | `Sem schema de entrada explícito neste bloco` | [timetable-lessons.ts](../../../src/features/academic/timetable-lessons.ts) |
| `getLessonReminderSettings` | GET | `Sem schema de entrada explícito neste bloco` | [timetable-lessons.ts](../../../src/features/academic/timetable-lessons.ts) |
| `saveLessonReminderSettings` | POST | `Sem schema de entrada explícito neste bloco` | [timetable-lessons.ts](../../../src/features/academic/timetable-lessons.ts) |
| `getYearComparison` | GET | `Sem schema de entrada explícito neste bloco` | [year-comparison.ts](../../../src/features/academic/year-comparison.ts) |

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

- [academic-analytics.test.ts](../../../tests/academic/academic-analytics.test.ts)
- [academic-architecture.test.ts](../../../tests/academic/academic-architecture.test.ts)
- [academic-bootstrap.test.ts](../../../tests/academic/academic-bootstrap.test.ts)
- [academic-calendar-context.test.ts](../../../tests/academic/academic-calendar-context.test.ts)
- [academic-calendar.test.ts](../../../tests/academic/academic-calendar.test.ts)
- [academic-nav.test.ts](../../../tests/academic/academic-nav.test.ts)
- [advanced-academic-core.test.ts](../../../tests/academic/advanced-academic-core.test.ts)
- [analytics-export.test.ts](../../../tests/academic/analytics-export.test.ts)
- [angola-academic.test.ts](../../../tests/academic/angola-academic.test.ts)
- [annual-sheet-terms-sql.test.ts](../../../tests/academic/annual-sheet-terms-sql.test.ts)
- [assessment-center.test.tsx](../../../tests/academic/assessment-center.test.tsx)
- [assessment-crud.test.ts](../../../tests/academic/assessment-crud.test.ts)
- [assessment-documents.test.ts](../../../tests/academic/assessment-documents.test.ts)
- [assessment-engine.test.ts](../../../tests/academic/assessment-engine.test.ts)
- [assessment-lock.test.ts](../../../tests/academic/assessment-lock.test.ts)
- [assessment-model.test.ts](../../../tests/academic/assessment-model.test.ts)
- [assessment-schedule.test.ts](../../../tests/academic/assessment-schedule.test.ts)
- [assessment-views.test.ts](../../../tests/academic/assessment-views.test.ts)
- [calendar-status.test.ts](../../../tests/academic/calendar-status.test.ts)
- [calendar-terms.test.ts](../../../tests/academic/calendar-terms.test.ts)
- [class-group-code.test.ts](../../../tests/academic/class-group-code.test.ts)
- [competency-mastery.test.ts](../../../tests/academic/competency-mastery.test.ts)
- [consistency-check.test.ts](../../../tests/academic/consistency-check.test.ts)
- [curriculum-templates.test.ts](../../../tests/academic/curriculum-templates.test.ts)
- [decreto-424-25.test.ts](../../../tests/academic/decreto-424-25.test.ts)
- [early-warning.test.ts](../../../tests/academic/early-warning.test.ts)
- [exam-engine.test.ts](../../../tests/academic/exam-engine.test.ts)
- [global-term-sync-contract.test.ts](../../../tests/academic/global-term-sync-contract.test.ts)
- [grade-change-integrity.test.ts](../../../tests/academic/grade-change-integrity.test.ts)
- [grade-lock.test.ts](../../../tests/academic/grade-lock.test.ts)
- [grade-sheet-workflow.test.ts](../../../tests/academic/grade-sheet-workflow.test.ts)
- [grading-profiles.test.ts](../../../tests/academic/grading-profiles.test.ts)
- [lesson-messages.test.ts](../../../tests/academic/lesson-messages.test.ts)
- [med-calendar.test.ts](../../../tests/academic/med-calendar.test.ts)
- [pauta-engine-parity.test.ts](../../../tests/academic/pauta-engine-parity.test.ts)
- [pauta-media-e-estado-coerentes.test.ts](../../../tests/academic/pauta-media-e-estado-coerentes.test.ts)
- [period-model.test.ts](../../../tests/academic/period-model.test.ts)
- [promotion-rules.test.ts](../../../tests/academic/promotion-rules.test.ts)
- [schedule-conflicts.test.ts](../../../tests/academic/schedule-conflicts.test.ts)
- [conflicts.test.ts](../../../tests/academic/schedule/conflicts.test.ts)
- [workload.test.ts](../../../tests/academic/schedule/workload.test.ts)
- [schemas.test.ts](../../../tests/academic/schemas.test.ts)
- [school-structure-plan.test.ts](../../../tests/academic/school-structure-plan.test.ts)
- [student-grade-report.test.ts](../../../tests/academic/student-grade-report.test.ts)
- [teacher-assessment-board.test.ts](../../../tests/academic/teacher-assessment-board.test.ts)
- [timetable-engine.test.ts](../../../tests/academic/timetable-engine.test.ts)
- [use-passing-value.test.tsx](../../../tests/academic/use-passing-value.test.tsx)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [index.tsx](../../../src/routes/index.tsx)
- [pedagogica.tsx](../../../src/routes/pedagogica.tsx)
- [relatorios.academicos.tsx](../../../src/routes/relatorios.academicos.tsx)
- [schemas.ts](../../../src/features/academic/schemas.ts)
- [server.ts](../../../src/features/academic/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
