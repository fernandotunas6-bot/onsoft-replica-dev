# Integrações e capacidades

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Integrações e capacidades; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Administrador instala/configura; utilizadores com capacidade concedida usam. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Instalar → conceder capacidade → configurar credencial no servidor → executar → confirmar resultado → diagnosticar/repetir.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `school_integrations.status`: `configured`, `connected`, `disconnected`, `error`
- `school_memberships.status`: `active`, `invited`, `revoked`, `suspended`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `siga_attendance_sessions.status`: `cancelled`, `completed`, `pending`
- `siga_lesson_meetings.status`: `active`, `cancelled`, `ended`
- `teachers.employment_type`: `fixed_term`, `part_time`, `permanent`, `visiting`
- `teachers.highest_qualification`: `bachelor`, `doctorate`, `licentiate`, `master`, `other`, `secondary`
- `teachers.status`: `active`, `archived`, `inactive`, `leave`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

Sem declaração de campos Zod local inventariada; consultar o contrato de origem/importado nas fontes, antes de qualquer alteração.

## Regras de negócio e fonte

catalog-ready, deep-link, cópia, exportação e HTTP confirmado são capacidades diferentes; segredo não vai ao browser.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                           | Colunas existentes                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_logs`                     | `id`, `school_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `occurred_at`                                                                                                                                                                                                                                                                                       |
| `enrollments`                    | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average`                                                                                                                                                               |
| `people`                         | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address`                                                                                                                       |
| `profiles`                       | `id`, `display_name`, `locale`, `created_at`, `updated_at`, `phone`, `full_name`, `avatar_url`, `cargo`, `school_id`, `national_id`, `first_name`, `last_name`, `preferred_name`, `avatar_path`, `timezone`, `status`, `onboarding_status`, `last_active_at`                                                                                                                                            |
| `school_integration_secrets`     | `id`, `school_id`, `provider`, `secret_key`, `secret_value`, `expires_at`, `created_at`, `updated_at`                                                                                                                                                                                                                                                                                                   |
| `school_integrations`            | `id`, `school_id`, `provider`, `status`, `config`, `created_at`, `updated_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                                                                               |
| `school_memberships`             | `id`, `school_id`, `user_id`, `status`, `created_at`, `updated_at`, `joined_at`, `invited_at`, `activated_at`, `suspended_at`, `last_access_at`                                                                                                                                                                                                                                                         |
| `schools`                        | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `siga_attendance_sessions`       | `id`, `school_id`, `academic_year_id`, `class_group_id`, `subject_id`, `teacher_id`, `timetable_slot_id`, `lesson_date`, `period_number`, `starts_at`, `ends_at`, `status`, `notes`, `created_at`, `created_by`, `updated_at`, `updated_by`                                                                                                                                                             |
| `siga_lesson_meetings`           | `id`, `school_id`, `attendance_session_id`, `provider`, `external_meeting_id`, `join_url`, `topic`, `starts_at`, `duration_minutes`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`                                                                                                                                                                                                   |
| `teachers`                       | `id`, `school_id`, `person_id`, `employee_number`, `hired_on`, `employment_type`, `highest_qualification`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `user_id`                                                                                                                                                                                                                  |
| `user_communication_preferences` | `id`, `user_id`, `school_id`, `security_enabled`, `academic_enabled`, `financial_enabled`, `attendance_enabled`, `calendar_enabled`, `announcements_enabled`, `events_enabled`, `documents_enabled`, `marketing_enabled`, `channel_preferences`, `created_at`, `updated_at`, `version`                                                                                                                  |

Relações confirmadas:

- `audit_logs` → `schools` (`audit_logs_school_id_fkey`)
- `enrollments` → `academic_years` (`enrollments_school_id_academic_year_id_fkey`)
- `enrollments` → `class_groups` (`enrollments_school_id_class_group_id_fkey`)
- `enrollments` → `schools` (`enrollments_school_id_fkey`)
- `enrollments` → `students` (`enrollments_school_id_student_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `profiles` → `schools` (`profiles_school_id_fkey`)
- `school_integration_secrets` → `schools` (`school_integration_secrets_school_id_fkey`)
- `school_integrations` → `schools` (`school_integrations_school_id_fkey`)
- `school_memberships` → `schools` (`school_memberships_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `siga_attendance_sessions` → `academic_years` (`siga_attendance_sessions_academic_year_id_fkey`)
- `siga_attendance_sessions` → `class_groups` (`siga_attendance_sessions_class_group_id_fkey`)
- `siga_attendance_sessions` → `schools` (`siga_attendance_sessions_school_id_fkey`)
- `siga_attendance_sessions` → `subjects` (`siga_attendance_sessions_subject_id_fkey`)
- `siga_attendance_sessions` → `teachers` (`siga_attendance_sessions_teacher_id_fkey`)
- `siga_attendance_sessions` → `timetable_slots` (`siga_attendance_sessions_timetable_slot_id_fkey`)
- `siga_lesson_meetings` → `schools` (`siga_lesson_meetings_school_id_fkey`)
- `siga_lesson_meetings` → `siga_attendance_sessions` (`siga_lesson_meetings_attendance_session_id_fkey`)
- `teachers` → `people` (`teachers_school_id_person_id_fkey`)
- `teachers` → `schools` (`teachers_school_id_fkey`)
- `user_communication_preferences` → `schools` (`user_communication_preferences_school_id_fkey`)

## Contratos de API e erros

| Função                       | Método | Entrada                                       | Fonte                                                     |
| ---------------------------- | ------ | --------------------------------------------- | --------------------------------------------------------- |
| `listSchoolIntegrations`     | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/integrations/server.ts) |
| `listInstalledCapabilities`  | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/integrations/server.ts) |
| `upsertSchoolIntegration`    | POST   | `upsertIntegrationInputSchema`                | [server.ts](../../../src/features/integrations/server.ts) |
| `installSchoolIntegration`   | POST   | `installIntegrationInputSchema`               | [server.ts](../../../src/features/integrations/server.ts) |
| `revokeSchoolIntegration`    | POST   | `revokeIntegrationInputSchema`                | [server.ts](../../../src/features/integrations/server.ts) |
| `rotateGatewayWebhookApiKey` | POST   | `rotateGatewayWebhookKeyInputSchema`          | [server.ts](../../../src/features/integrations/server.ts) |
| `sendSchoolResendEmail`      | POST   | `sendSchoolResendEmailInputSchema`            | [server.ts](../../../src/features/integrations/server.ts) |
| `sendSchoolWhatsAppMessage`  | POST   | `sendSchoolWhatsAppInputSchema`               | [server.ts](../../../src/features/integrations/server.ts) |
| `sendSchoolSmsMessage`       | POST   | `sendSchoolSmsInputSchema`                    | [server.ts](../../../src/features/integrations/server.ts) |
| `startZoomOAuth`             | GET    | `Sem schema de entrada explícito neste bloco` | [zoom.ts](../../../src/features/integrations/zoom.ts)     |
| `completeZoomOAuth`          | GET    | `Sem schema de entrada explícito neste bloco` | [zoom.ts](../../../src/features/integrations/zoom.ts)     |
| `disconnectZoom`             | POST   | `Sem schema de entrada explícito neste bloco` | [zoom.ts](../../../src/features/integrations/zoom.ts)     |
| `createZoomLessonMeeting`    | POST   | `createMeetingSchema`                         | [zoom.ts](../../../src/features/integrations/zoom.ts)     |
| `getZoomLessonMeeting`       | GET    | `Sem schema de entrada explícito neste bloco` | [zoom.ts](../../../src/features/integrations/zoom.ts)     |

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

- [actions.test.ts](../../../tests/integrations/actions.test.ts)
- [emis.test.ts](../../../tests/integrations/emis.test.ts)
- [firebase-messaging.test.ts](../../../tests/integrations/firebase-messaging.test.ts)
- [gateway-webhook-key.test.ts](../../../tests/integrations/gateway-webhook-key.test.ts)
- [google-firebase.test.ts](../../../tests/integrations/google-firebase.test.ts)
- [install.test.ts](../../../tests/integrations/install.test.ts)
- [launcher.test.ts](../../../tests/integrations/launcher.test.ts)
- [payment-gateway-aal2.test.ts](../../../tests/integrations/payment-gateway-aal2.test.ts)
- [platform-messaging-limits.test.ts](../../../tests/integrations/platform-messaging-limits.test.ts)
- [public-database-error.test.ts](../../../tests/integrations/public-database-error.test.ts)
- [resend-client.test.ts](../../../tests/integrations/resend-client.test.ts)
- [resend-webhook-signature.test.ts](../../../tests/integrations/resend-webhook-signature.test.ts)
- [whatsapp-client.test.ts](../../../tests/integrations/whatsapp-client.test.ts)
- [zoom-integration.test.ts](../../../tests/integrations/zoom-integration.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [server.ts](../../../src/features/integrations/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
