# Ano e calendário lectivo

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Ano e calendário lectivo; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Administrador activa/cria ano; Administrador e Secretaria gerem períodos. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Indicar datas institucionais → criar/activar ano → criar períodos → consultar agenda → subscrever ICS.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `academic_years.status`: `active`, `archived`, `closed`, `draft`
- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `class_subjects.status`: `active`, `archived`, `inactive`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
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
| `title` | `z.string().trim().min(2).max(160),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `description` | `optionalText,` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `eventDate` | `z.string().trim().min(10).max(10),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `endsOn` | `z.string().trim().min(10).max(10),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `academicYearId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `sequence` | `z.number().int().min(1).max(20).optional(),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `category` | `z.enum(calendarCategoryOptions).default("academic"),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `limit` | `z.number().int().min(1).max(80).default(50),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `fromDate` | `optionalText,` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `academicYearId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `includePast` | `z.boolean().optional(),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `date` | `z` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `limit` | `z.number().int().min(1).max(40).default(24),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `title` | `z.string().trim().min(2).max(160),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `eventDate` | `z.string().trim().min(10).max(10),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `endsOn` | `z.string().trim().min(10).max(10),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |
| `yearId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/calendar/schemas.ts) |

## Regras de negócio e fonte

Um ano activo por escola; terms são os períodos reais. Activação não certifica encerramento académico/financeiro.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

Especificação complementar: [SGA_ACADEMIC_TIME_SHIFTS_BREAKS_GATE_SPEC.md](../SGA_ACADEMIC_TIME_SHIFTS_BREAKS_GATE_SPEC.md).

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `academic_years` | `id`, `school_id`, `name`, `starts_on`, `ends_on`, `status`, `created_at`, `created_by`, `updated_by` |
| `calendar_feed_tokens` | `id`, `school_id`, `user_id`, `token`, `created_at` |
| `class_groups` | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `class_subjects` | `id`, `school_id`, `class_group_id`, `subject_id`, `teacher_id`, `weekly_periods`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at` |
| `enrollments` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average` |
| `people` | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address` |
| `schools` | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `subjects` | `id`, `school_id`, `code`, `name`, `short_name`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `subject_type_id`, `curriculum_area_id`, `description`, `department`, `is_mandatory`, `is_practical`, `has_assessment`, `has_exam`, `has_attendance`, `has_pauta`, `annual_hours`, `default_lesson_duration`, `color`, `icon`, `display_order`, `deleted_at`, `version` |
| `teachers` | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id` |
| `terms` | `id`, `school_id`, `academic_year_id`, `name`, `sequence`, `starts_on`, `ends_on`, `created_at`, `created_by`, `updated_by` |
| `timetable_slots` | `id`, `school_id`, `class_subject_id`, `weekday`, `starts_at`, `ends_at`, `room`, `status`, `created_by`, `created_at`, `updated_by`, `schedule_id`, `room_id`, `shift_id`, `day_period_number`, `notes` |

Relações confirmadas:

- `academic_years` → `schools` (`academic_years_school_id_fkey`)
- `calendar_feed_tokens` → `schools` (`calendar_feed_tokens_school_id_fkey`)
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
- `people` → `schools` (`people_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `subjects` → `curriculum_areas` (`subjects_curriculum_area_id_fkey`)
- `subjects` → `schools` (`subjects_school_id_fkey`)
- `subjects` → `subject_types` (`subjects_subject_type_id_fkey`)
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
| `getOrCreateCalendarFeedToken` | POST | `Sem schema de entrada explícito neste bloco` | [feed.ts](../../../src/features/calendar/feed.ts) |
| `getPublicCalendarFeed` | GET | `getPublicCalendarFeedInputSchema` | [feed.ts](../../../src/features/calendar/feed.ts) |
| `listCalendarEvents` | GET | `listCalendarEventsInputSchema` | [server.ts](../../../src/features/calendar/server.ts) |
| `listDayAgendaLessons` | GET | `listDayAgendaLessonsInputSchema` | [server.ts](../../../src/features/calendar/server.ts) |
| `getActiveAcademicYear` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/calendar/server.ts) |
| `listActiveAcademicYears` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/calendar/server.ts) |
| `setActiveAcademicYear` | POST | `setActiveAcademicYearInputSchema` | [server.ts](../../../src/features/calendar/server.ts) |
| `createAcademicYear` | POST | `createAcademicYearInputSchema` | [server.ts](../../../src/features/calendar/server.ts) |
| `createCalendarEvent` | POST | `createCalendarEventInputSchema` | [server.ts](../../../src/features/calendar/server.ts) |
| `updateCalendarEvent` | POST | `updateCalendarEventInputSchema` | [server.ts](../../../src/features/calendar/server.ts) |
| `deleteCalendarEvent` | POST | `deleteCalendarEventInputSchema` | [server.ts](../../../src/features/calendar/server.ts) |

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

- [academic-year-integrity.test.ts](../../../tests/calendar/academic-year-integrity.test.ts)
- [dates.test.ts](../../../tests/calendar/dates.test.ts)
- [day-lessons-contract.test.ts](../../../tests/calendar/day-lessons-contract.test.ts)
- [ics-timed.test.ts](../../../tests/calendar/ics-timed.test.ts)
- [schemas.test.ts](../../../tests/calendar/schemas.test.ts)
- [upcoming.test.ts](../../../tests/calendar/upcoming.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [alumni.$alumniId.portfolio.tsx](../../../src/routes/alumni.$alumniId.portfolio.tsx)
- [alumni.$alumniId.tsx](../../../src/routes/alumni.$alumniId.tsx)
- [alumni.calendar.tsx](../../../src/routes/alumni.calendar.tsx)
- [alumni.communications.tsx](../../../src/routes/alumni.communications.tsx)
- [alumni.documents.tsx](../../../src/routes/alumni.documents.tsx)
- [alumni.insights.tsx](../../../src/routes/alumni.insights.tsx)
- [alumni.matching.tsx](../../../src/routes/alumni.matching.tsx)
- [alumni.operations.tsx](../../../src/routes/alumni.operations.tsx)
- [alumni.pipeline.tsx](../../../src/routes/alumni.pipeline.tsx)
- [alumni.portal.portfolio.print.tsx](../../../src/routes/alumni.portal.portfolio.print.tsx)
- [alumni.portal.portfolio.showcase.tsx](../../../src/routes/alumni.portal.portfolio.showcase.tsx)
- [alumni.portal.portfolio.tsx](../../../src/routes/alumni.portal.portfolio.tsx)
- [alumni.portal.tsx](../../../src/routes/alumni.portal.tsx)
- [alumni.tsx](../../../src/routes/alumni.tsx)
- [calendario.ics.tsx](../../../src/routes/calendario.ics.tsx)
- [calendario.tsx](../../../src/routes/calendario.tsx)
- [schemas.ts](../../../src/features/calendar/schemas.ts)
- [server.ts](../../../src/features/calendar/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
