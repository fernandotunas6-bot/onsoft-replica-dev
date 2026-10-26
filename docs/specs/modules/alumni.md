# Antigos alunos e portefólios

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Antigos alunos e portefólios; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Pessoal autorizado; antigo aluno no próprio perfil. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Preparar perfil → consentimento → publicar âmbito permitido → consultar oportunidades → actualizar portefólio.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `alumni_contributions.contribution_type`: `donation`, `in_kind`, `other`, `scholarship`, `sponsorship`, `volunteer_hours`
- `alumni_education_stages.education_level`: `higher`, `middle`, `primary`
- `alumni_engagements.kind`: `career`, `communication`, `donation`, `event`, `mentoring`, `other`, `survey`, `volunteer`
- `alumni_event_registrations.status`: `attended`, `cancelled`, `registered`, `waitlist`
- `alumni_events.event_type`: `career`, `fundraising`, `mentoring`, `networking`, `other`, `reunion`, `volunteer`, `webinar`
- `alumni_events.status`: `cancelled`, `completed`, `draft`, `published`
- `alumni_experiences.kind`: `award`, `business`, `certification`, `education`, `employment`, `volunteering`
- `alumni_mentorships.status`: `active`, `cancelled`, `completed`, `requested`
- `alumni_opportunities.opportunity_type`: `business`, `event`, `internship`, `job`, `mentoring`, `other`, `scholarship`, `volunteer`
- `alumni_opportunities.status`: `archived`, `closed`, `draft`, `published`
- `alumni_opportunity_applications.status`: `accepted`, `applied`, `interested`, `rejected`, `shortlisted`, `withdrawn`
- `alumni_portfolio_items.education_level`: `higher`, `middle`, `primary`
- `alumni_portfolio_items.item_type`: `award`, `case_study`, `certificate`, `link`, `media`, `other`, `project`, `publication`
- `alumni_portfolio_items.visibility`: `alumni`, `private`, `school`
- `alumni_privacy_audit.action`: `claim`, `communication_targeted`, `consent_update`, `export_included`, `profile_update`, `visibility_update`
- `alumni_profiles.directory_visibility`: `alumni`, `private`, `school`
- `alumni_profiles.employment_status`: `employed`, `seeking`, `self_employed`, `student`, `unavailable`, `unknown`
- `alumni_surveys.purpose`: `employment`, `impact`, `other`, `satisfaction`, `skills`, `tracer_study`
- `alumni_surveys.status`: `archived`, `closed`, `draft`, `published`
- `document_requests.request_type`: `certificate`, `declaration`, `other`, `term`, `transfer`
- `document_requests.status`: `approved`, `cancelled`, `fulfilled`, `in_review`, `rejected`, `submitted`
- `document_templates.document_type`: `certificate`, `declaration`, `other`, `term`, `transfer`
- `document_templates.status`: `active`, `draft`, `retired`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo                   | Declaração observada                                                                    | Schema de origem                                                  |
| ----------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `query`                 | `z.string().trim().max(120).optional().default(""),`                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `graduationYear`        | `z.number().int().min(1950).max(2100).optional(),`                                      | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `employmentStatus`      | `z.enum(alumniEmploymentStatuses).optional(),`                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `mentoringOnly`         | `z.boolean().optional().default(false),`                                                | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `opportunitiesOnly`     | `z.boolean().optional().default(false),`                                                | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `verifiedOnly`          | `z.boolean().optional().default(false),`                                                | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `province`              | `z.string().trim().max(120).optional(),`                                                | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `offset`                | `z.number().int().min(0).optional().default(0),`                                        | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `limit`                 | `z.number().int().min(1).max(200).optional().default(50),`                              | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `studentId`             | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `graduationYear`        | `z.number().int().min(1950).max(2100).nullable().optional(),`                           | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `graduationGrade`       | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `graduationCourse`      | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `headline`              | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `biography`             | `nullableText(3000),`                                                                   | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `currentCompany`        | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `currentRole`           | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `employmentStatus`      | `z.enum(alumniEmploymentStatuses).optional(),`                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `industry`              | `nullableText(120),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `city`                  | `nullableText(120),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `province`              | `nullableText(120),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `country`               | `nullableText(120),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `linkedinUrl`           | `nullableUrl,`                                                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `websiteUrl`            | `nullableUrl,`                                                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `skills`                | `z.array(z.string().trim().min(1).max(80)).max(30).optional(),`                         | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `interests`             | `z.array(z.string().trim().min(1).max(80)).max(30).optional(),`                         | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `availableForMentoring` | `z.boolean().optional(),`                                                               | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `seekingMentor`         | `z.boolean().optional(),`                                                               | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `openToOpportunities`   | `z.boolean().optional(),`                                                               | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `directoryVisibility`   | `z.enum(alumniVisibilityLevels).optional(),`                                            | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `contactConsent`        | `z.boolean().optional(),`                                                               | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `alumniId`              | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `experienceId`          | `z.string().uuid().optional(),`                                                         | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `kind`                  | `z.enum(alumniExperienceKinds),`                                                        | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `organization`          | `z.string().trim().min(1).max(180),`                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `title`                 | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `field`                 | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `location`              | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `startedOn`             | `z.string().date().nullable().optional(),`                                              | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `endedOn`               | `z.string().date().nullable().optional(),`                                              | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `isCurrent`             | `z.boolean().optional().default(false),`                                                | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `description`           | `nullableText(2000),`                                                                   | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `alumniId`              | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `experienceId`          | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `status`                | `z.enum(alumniOpportunityStatuses).optional(),`                                         | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `type`                  | `z.enum(alumniOpportunityTypes).optional(),`                                            | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `query`                 | `z.string().trim().max(120).optional().default(""),`                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `limit`                 | `z.number().int().min(1).max(200).optional().default(100),`                             | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `opportunityId`         | `z.string().uuid().optional(),`                                                         | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `createdByAlumniId`     | `z.string().uuid().nullable().optional(),`                                              | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `title`                 | `z.string().trim().min(2).max(180),`                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `organization`          | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `opportunityType`       | `z.enum(alumniOpportunityTypes).default("job"),`                                        | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `description`           | `nullableText(5000),`                                                                   | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `location`              | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `remoteAllowed`         | `z.boolean().optional().default(false),`                                                | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `applicationUrl`        | `nullableUrl,`                                                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `startsAt`              | `z.string().datetime().nullable().optional(),`                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `expiresAt`             | `z.string().datetime().nullable().optional(),`                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `status`                | `z.enum(alumniOpportunityStatuses).default("draft"),`                                   | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `opportunityId`         | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `alumniId`              | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `status`                | `z`                                                                                     | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `notes`                 | `nullableText(2000),`                                                                   | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `mentorshipId`          | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `status`                | `z.enum(["requested", "active", "completed", "cancelled"]),`                            | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `alumniId`              | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `kind`                  | `z.enum(alumniEngagementKinds),`                                                        | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `title`                 | `z.string().trim().min(2).max(180),`                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `occurredAt`            | `z.string().datetime().optional(),`                                                     | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `valueNumeric`          | `z.number().finite().nullable().optional(),`                                            | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `notes`                 | `nullableText(2000),`                                                                   | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `eventId`               | `z.string().uuid().optional(),`                                                         | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `title`                 | `z.string().trim().min(2).max(180),`                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `description`           | `nullableText(5000),`                                                                   | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `eventType`             | `z`                                                                                     | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `location`              | `nullableText(180),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `onlineUrl`             | `nullableUrl,`                                                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `startsAt`              | `z.string().datetime(),`                                                                | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `endsAt`                | `z.string().datetime().nullable().optional(),`                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `capacity`              | `z.number().int().positive().nullable().optional(),`                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `status`                | `z.enum(["draft", "published", "completed", "cancelled"]).default("draft"),`            | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `eventId`               | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `alumniId`              | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `status`                | `z.enum(["registered", "attended", "cancelled", "waitlist"]).default("registered"),`    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `surveyId`              | `z.string().uuid().optional(),`                                                         | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `title`                 | `z.string().trim().min(2).max(180),`                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `description`           | `nullableText(3000),`                                                                   | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `purpose`               | `z`                                                                                     | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `schemaJson`            | `z`                                                                                     | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `status`                | `z.enum(["draft", "published", "closed", "archived"]).default("draft"),`                | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `opensAt`               | `z.string().datetime().nullable().optional(),`                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `closesAt`              | `z.string().datetime().nullable().optional(),`                                          | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `surveyId`              | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `alumniId`              | `z.string().uuid(),`                                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `responseJson`          | `z.record(z.string(), z.unknown()),`                                                    | [schemas.ts](../../../src/features/alumni/schemas.ts)             |
| `id`                    | `string;`                                                                               | [survey-schema.ts](../../../src/features/alumni/survey-schema.ts) |
| `label`                 | `string;`                                                                               | [survey-schema.ts](../../../src/features/alumni/survey-schema.ts) |
| `type`                  | `"text" \| "textarea" \| "select" \| "multiselect" \| "number" \| "date" \| "boolean";` | [survey-schema.ts](../../../src/features/alumni/survey-schema.ts) |

## Regras de negócio e fonte

Privacidade/consentimento antecedem directório e contactos; os dados privados não entram automaticamente no showcase.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                             | Colunas existentes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alumni_communication_preferences` | `id`, `school_id`, `alumni_id`, `email_enabled`, `sms_enabled`, `whatsapp_enabled`, `opportunities_enabled`, `events_enabled`, `mentoring_enabled`, `surveys_enabled`, `fundraising_enabled`, `updated_at`                                                                                                                                                                                                                                                                                                                                                                        |
| `alumni_contributions`             | `id`, `school_id`, `alumni_id`, `contribution_type`, `amount`, `currency`, `hours`, `designation`, `occurred_at`, `reference`, `notes`, `metadata`, `created_at`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `alumni_education_stages`          | `id`, `school_id`, `alumni_id`, `education_level`, `institution_name`, `course_name`, `degree_name`, `started_year`, `ended_year`, `city`, `province`, `country`, `is_current`, `is_verified`, `sort_order`, `metadata`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                                                                               |
| `alumni_engagements`               | `id`, `school_id`, `alumni_id`, `kind`, `title`, `occurred_at`, `value_numeric`, `notes`, `metadata`, `created_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `alumni_event_registrations`       | `id`, `school_id`, `event_id`, `alumni_id`, `status`, `registered_at`, `checked_in_at`, `metadata`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `alumni_events`                    | `id`, `school_id`, `title`, `description`, `event_type`, `location`, `online_url`, `starts_at`, `ends_at`, `capacity`, `status`, `metadata`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `alumni_experiences`               | `id`, `school_id`, `alumni_id`, `kind`, `organization`, `title`, `field`, `location`, `started_on`, `ended_on`, `is_current`, `description`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                                                                                                                                                           |
| `alumni_mentorships`               | `id`, `school_id`, `mentor_alumni_id`, `mentee_alumni_id`, `focus_area`, `status`, `requested_at`, `started_at`, `completed_at`, `notes`, `metadata`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                                                                                                                                                  |
| `alumni_opportunities`             | `id`, `school_id`, `created_by_alumni_id`, `title`, `organization`, `opportunity_type`, `description`, `location`, `remote_allowed`, `application_url`, `starts_at`, `expires_at`, `status`, `metadata`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                                                                                               |
| `alumni_opportunity_applications`  | `id`, `school_id`, `opportunity_id`, `alumni_id`, `status`, `applied_at`, `notes`, `metadata`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `alumni_portfolio_items`           | `id`, `school_id`, `alumni_id`, `item_type`, `title`, `summary`, `organization`, `role`, `started_on`, `ended_on`, `external_url`, `image_url`, `official_document_request_id`, `skills`, `tags`, `featured`, `visibility`, `sort_order`, `metadata`, `created_at`, `updated_at`, `education_level`, `education_stage_id`                                                                                                                                                                                                                                                         |
| `alumni_privacy_audit`             | `id`, `school_id`, `alumni_id`, `auth_user_id`, `action`, `previous_value`, `new_value`, `occurred_at`, `metadata`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `alumni_profiles`                  | `id`, `school_id`, `student_id`, `person_id`, `graduation_year`, `graduation_grade`, `graduation_course`, `headline`, `biography`, `current_company`, `current_role`, `employment_status`, `industry`, `city`, `province`, `country`, `linkedin_url`, `website_url`, `skills`, `interests`, `available_for_mentoring`, `seeking_mentor`, `open_to_opportunities`, `directory_visibility`, `contact_consent`, `verified_at`, `last_engagement_at`, `profile_completion`, `metadata`, `created_at`, `updated_at`, `auth_user_id`, `self_service_enabled`, `self_service_claimed_at` |
| `alumni_survey_responses`          | `id`, `school_id`, `survey_id`, `alumni_id`, `response_json`, `submitted_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `alumni_surveys`                   | `id`, `school_id`, `title`, `description`, `purpose`, `schema_json`, `status`, `opens_at`, `closes_at`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `document_requests`                | `id`, `school_id`, `student_id`, `template_id`, `request_type`, `status`, `purpose`, `requested_by`, `reviewed_by`, `reviewed_at`, `review_note`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                                                                                                                                                      |
| `document_templates`               | `id`, `school_id`, `code`, `name`, `document_type`, `version`, `status`, `body_template`, `allowed_fields`, `created_by`, `created_at`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `enrollments`                      | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average`                                                                                                                                                                                                                                                                                                                                         |
| `people`                           | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address`                                                                                                                                                                                                                                                                                                 |
| `students`                         | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`                                                                                                                                                                                                                                                                                                                                                                                                                                |

Relações confirmadas:

- `alumni_communication_preferences` → `alumni_profiles` (`alumni_communication_preferences_alumni_id_fkey`)
- `alumni_communication_preferences` → `schools` (`alumni_communication_preferences_school_id_fkey`)
- `alumni_contributions` → `alumni_profiles` (`alumni_contributions_alumni_id_fkey`)
- `alumni_contributions` → `schools` (`alumni_contributions_school_id_fkey`)
- `alumni_education_stages` → `alumni_profiles` (`alumni_education_stages_alumni_id_fkey`)
- `alumni_education_stages` → `schools` (`alumni_education_stages_school_id_fkey`)
- `alumni_engagements` → `alumni_profiles` (`alumni_engagements_alumni_id_fkey`)
- `alumni_engagements` → `schools` (`alumni_engagements_school_id_fkey`)
- `alumni_event_registrations` → `alumni_events` (`alumni_event_registrations_event_id_fkey`)
- `alumni_event_registrations` → `alumni_profiles` (`alumni_event_registrations_alumni_id_fkey`)
- `alumni_event_registrations` → `schools` (`alumni_event_registrations_school_id_fkey`)
- `alumni_events` → `schools` (`alumni_events_school_id_fkey`)
- `alumni_experiences` → `alumni_profiles` (`alumni_experiences_alumni_id_fkey`)
- `alumni_experiences` → `schools` (`alumni_experiences_school_id_fkey`)
- `alumni_mentorships` → `alumni_profiles` (`alumni_mentorships_mentee_alumni_id_fkey`)
- `alumni_mentorships` → `alumni_profiles` (`alumni_mentorships_mentor_alumni_id_fkey`)
- `alumni_mentorships` → `schools` (`alumni_mentorships_school_id_fkey`)
- `alumni_opportunities` → `alumni_profiles` (`alumni_opportunities_created_by_alumni_id_fkey`)
- `alumni_opportunities` → `schools` (`alumni_opportunities_school_id_fkey`)
- `alumni_opportunity_applications` → `alumni_opportunities` (`alumni_opportunity_applications_opportunity_id_fkey`)
- `alumni_opportunity_applications` → `alumni_profiles` (`alumni_opportunity_applications_alumni_id_fkey`)
- `alumni_opportunity_applications` → `schools` (`alumni_opportunity_applications_school_id_fkey`)
- `alumni_portfolio_items` → `alumni_education_stages` (`alumni_portfolio_items_education_stage_id_fkey`)
- `alumni_portfolio_items` → `alumni_profiles` (`alumni_portfolio_items_alumni_id_fkey`)
- `alumni_portfolio_items` → `document_requests` (`alumni_portfolio_items_official_document_request_id_fkey`)
- `alumni_portfolio_items` → `schools` (`alumni_portfolio_items_school_id_fkey`)
- `alumni_privacy_audit` → `alumni_profiles` (`alumni_privacy_audit_alumni_id_fkey`)
- `alumni_privacy_audit` → `schools` (`alumni_privacy_audit_school_id_fkey`)
- `alumni_profiles` → `people` (`alumni_profiles_person_id_fkey`)
- `alumni_profiles` → `schools` (`alumni_profiles_school_id_fkey`)
- `alumni_profiles` → `students` (`alumni_profiles_student_id_fkey`)
- `alumni_survey_responses` → `alumni_profiles` (`alumni_survey_responses_alumni_id_fkey`)
- `alumni_survey_responses` → `alumni_surveys` (`alumni_survey_responses_survey_id_fkey`)
- `alumni_survey_responses` → `schools` (`alumni_survey_responses_school_id_fkey`)
- `alumni_surveys` → `schools` (`alumni_surveys_school_id_fkey`)
- `document_requests` → `document_templates` (`document_requests_school_id_template_id_fkey`)
- `document_requests` → `schools` (`document_requests_school_id_fkey`)
- `document_requests` → `students` (`document_requests_school_id_student_id_fkey`)
- `document_templates` → `schools` (`document_templates_school_id_fkey`)
- `enrollments` → `academic_years` (`enrollments_school_id_academic_year_id_fkey`)
- `enrollments` → `class_groups` (`enrollments_school_id_class_group_id_fkey`)
- `enrollments` → `schools` (`enrollments_school_id_fkey`)
- `enrollments` → `students` (`enrollments_school_id_student_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)

## Contratos de API e erros

| Função                               | Método | Entrada                                       | Fonte                                                                     |
| ------------------------------------ | ------ | --------------------------------------------- | ------------------------------------------------------------------------- |
| `getAlumniGeoAnalytics`              | GET    | `Sem schema de entrada explícito neste bloco` | [admin-tools.ts](../../../src/features/alumni/admin-tools.ts)             |
| `buildAlumniCommunicationAudience`   | GET    | `audienceSchema`                              | [admin-tools.ts](../../../src/features/alumni/admin-tools.ts)             |
| `getAlumniExportDataset`             | GET    | `Sem schema de entrada explícito neste bloco` | [admin-tools.ts](../../../src/features/alumni/admin-tools.ts)             |
| `getAlumniDocumentWorkspace`         | GET    | `alumniDocumentsInputSchema`                  | [documents.ts](../../../src/features/alumni/documents.ts)                 |
| `getMyAlumniEducationHistory`        | GET    | `Sem schema de entrada explícito neste bloco` | [education-history.ts](../../../src/features/alumni/education-history.ts) |
| `saveMyAlumniEducationStage`         | POST   | `alumniEducationStageSchema`                  | [education-history.ts](../../../src/features/alumni/education-history.ts) |
| `deleteMyAlumniEducationStage`       | POST   | `deleteStageSchema`                           | [education-history.ts](../../../src/features/alumni/education-history.ts) |
| `applyToAlumniOpportunity`           | POST   | `alumniOpportunityApplicationInputSchema`     | [operations.ts](../../../src/features/alumni/operations.ts)               |
| `listAlumniSurveys`                  | GET    | `Sem schema de entrada explícito neste bloco` | [operations.ts](../../../src/features/alumni/operations.ts)               |
| `upsertAlumniSurvey`                 | POST   | `alumniSurveyInputSchema`                     | [operations.ts](../../../src/features/alumni/operations.ts)               |
| `submitAlumniSurveyResponse`         | POST   | `alumniSurveyResponseInputSchema`             | [operations.ts](../../../src/features/alumni/operations.ts)               |
| `recordAlumniContribution`           | POST   | `alumniContributionInputSchema`               | [operations.ts](../../../src/features/alumni/operations.ts)               |
| `getAlumniImpactAnalytics`           | GET    | `Sem schema de entrada explícito neste bloco` | [operations.ts](../../../src/features/alumni/operations.ts)               |
| `listOpportunityApplicationPipeline` | GET    | `pipelineListSchema`                          | [pipeline.ts](../../../src/features/alumni/pipeline.ts)                   |
| `updateOpportunityApplicationStatus` | POST   | `alumniOpportunityApplicationInputSchema`     | [pipeline.ts](../../../src/features/alumni/pipeline.ts)                   |
| `listEventRegistrationPipeline`      | GET    | `pipelineListSchema`                          | [pipeline.ts](../../../src/features/alumni/pipeline.ts)                   |
| `updateEventRegistrationStatus`      | POST   | `alumniEventRegistrationInputSchema`          | [pipeline.ts](../../../src/features/alumni/pipeline.ts)                   |
| `listMentorshipPipeline`             | GET    | `pipelineListSchema`                          | [pipeline.ts](../../../src/features/alumni/pipeline.ts)                   |
| `createMentorshipFromPipeline`       | POST   | `mentoringMatchInputSchema`                   | [pipeline.ts](../../../src/features/alumni/pipeline.ts)                   |
| `updateMentorshipPipelineStatus`     | POST   | `mentoringStatusInputSchema`                  | [pipeline.ts](../../../src/features/alumni/pipeline.ts)                   |
| `getMyAlumniPortfolio`               | GET    | `Sem schema de entrada explícito neste bloco` | [portfolio.ts](../../../src/features/alumni/portfolio.ts)                 |
| `getMyPortfolioDocumentOptions`      | GET    | `Sem schema de entrada explícito neste bloco` | [portfolio.ts](../../../src/features/alumni/portfolio.ts)                 |
| `saveMyAlumniPortfolioItem`          | POST   | `portfolioItemSchema`                         | [portfolio.ts](../../../src/features/alumni/portfolio.ts)                 |
| `deleteMyAlumniPortfolioItem`        | POST   | `portfolioDeleteSchema`                       | [portfolio.ts](../../../src/features/alumni/portfolio.ts)                 |
| `listAlumniPortfolioAdmin`           | GET    | `portfolioAdminListSchema`                    | [portfolio.ts](../../../src/features/alumni/portfolio.ts)                 |
| `setAlumniPortfolioFeatured`         | POST   | `portfolioFeaturedSchema`                     | [portfolio.ts](../../../src/features/alumni/portfolio.ts)                 |
| `getMyAlumniPrivacy`                 | GET    | `Sem schema de entrada explícito neste bloco` | [privacy.ts](../../../src/features/alumni/privacy.ts)                     |
| `updateMyAlumniPrivacy`              | POST   | `preferencesSchema`                           | [privacy.ts](../../../src/features/alumni/privacy.ts)                     |
| `listMyAlumniPrivacyAudit`           | GET    | `Sem schema de entrada explícito neste bloco` | [privacy.ts](../../../src/features/alumni/privacy.ts)                     |
| `getAlumniMentorRecommendations`     | GET    | `recommendationInputSchema`                   | [recommendations.ts](../../../src/features/alumni/recommendations.ts)     |
| `claimMyAlumniProfile`               | POST   | `Sem schema de entrada explícito neste bloco` | [self-service.ts](../../../src/features/alumni/self-service.ts)           |
| `getMyAlumniPortal`                  | GET    | `Sem schema de entrada explícito neste bloco` | [self-service.ts](../../../src/features/alumni/self-service.ts)           |
| `updateMyAlumniProfile`              | POST   | `updateSelfProfileSchema`                     | [self-service.ts](../../../src/features/alumni/self-service.ts)           |
| `saveMyOpportunityInterest`          | POST   | `opportunityActionSchema`                     | [self-service.ts](../../../src/features/alumni/self-service.ts)           |
| `registerMyAlumniEvent`              | POST   | `eventActionSchema`                           | [self-service.ts](../../../src/features/alumni/self-service.ts)           |
| `submitMyAlumniSurvey`               | POST   | `surveyActionSchema`                          | [self-service.ts](../../../src/features/alumni/self-service.ts)           |
| `listAlumni`                         | GET    | `listAlumniInputSchema`                       | [server.ts](../../../src/features/alumni/server.ts)                       |
| `getAlumniProfile`                   | GET    | `alumniIdInputSchema`                         | [server.ts](../../../src/features/alumni/server.ts)                       |
| `getAlumniOverview`                  | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/alumni/server.ts)                       |
| `bootstrapGraduatedStudents`         | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/alumni/server.ts)                       |
| `upsertAlumniProfile`                | POST   | `upsertAlumniInputSchema`                     | [server.ts](../../../src/features/alumni/server.ts)                       |
| `verifyAlumniProfile`                | POST   | `alumniIdInputSchema`                         | [server.ts](../../../src/features/alumni/server.ts)                       |
| `upsertAlumniExperience`             | POST   | `alumniExperienceInputSchema`                 | [server.ts](../../../src/features/alumni/server.ts)                       |
| `deleteAlumniExperience`             | POST   | `deleteAlumniExperienceInputSchema`           | [server.ts](../../../src/features/alumni/server.ts)                       |
| `listAlumniOpportunities`            | GET    | `listAlumniOpportunitiesInputSchema`          | [server.ts](../../../src/features/alumni/server.ts)                       |
| `upsertAlumniOpportunity`            | POST   | `upsertAlumniOpportunityInputSchema`          | [server.ts](../../../src/features/alumni/server.ts)                       |
| `createMentorshipMatch`              | POST   | `mentoringMatchInputSchema`                   | [server.ts](../../../src/features/alumni/server.ts)                       |
| `updateMentorshipStatus`             | POST   | `mentoringStatusInputSchema`                  | [server.ts](../../../src/features/alumni/server.ts)                       |
| `recordAlumniEngagement`             | POST   | `alumniEngagementInputSchema`                 | [server.ts](../../../src/features/alumni/server.ts)                       |
| `listAlumniEvents`                   | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/alumni/server.ts)                       |
| `upsertAlumniEvent`                  | POST   | `alumniEventInputSchema`                      | [server.ts](../../../src/features/alumni/server.ts)                       |
| `registerAlumniForEvent`             | POST   | `alumniEventRegistrationInputSchema`          | [server.ts](../../../src/features/alumni/server.ts)                       |

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

- [alumni-access.test.ts](../../../tests/alumni/alumni-access.test.ts)
- [education-history.test.ts](../../../tests/alumni/education-history.test.ts)
- [matching.test.ts](../../../tests/alumni/matching.test.ts)
- [portfolio.test.ts](../../../tests/alumni/portfolio.test.ts)
- [schemas.test.ts](../../../tests/alumni/schemas.test.ts)
- [survey-schema.test.ts](../../../tests/alumni/survey-schema.test.ts)

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
- [schemas.ts](../../../src/features/alumni/schemas.ts)
- [server.ts](../../../src/features/alumni/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
