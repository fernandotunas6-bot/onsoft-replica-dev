# Comunicação institucional

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Comunicação institucional; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Pessoal autorizado; destinatários segundo o âmbito escolar. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Preparar comunicação → seleccionar audiência → validar destinos → publicar/enviar → acompanhar estado.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `finance_contracts.status`: `active`, `cancelled`
- `finance_invoices.status`: `cancelled`, `open`, `paid`, `partially_paid`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `school_announcements.audience`: `all_guardians`, `alumni_all`, `alumni_events`, `alumni_fundraising`, `alumni_mentoring`, `alumni_opportunities`, `alumni_surveys`, `guardians_with_debt`, `students_finalists`, `students_secondary`, `teaching_staff`
- `school_announcements.channel`: `email`, `portal`, `sms`, `whatsapp`
- `school_announcements.status`: `draft`, `scheduled`, `sent`
- `school_memberships.status`: `active`, `invited`, `revoked`, `suspended`
- `schools.status`: `active`, `archived`, `setup`, `suspended`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo    | Declaração observada                            | Schema de origem                                              |
| -------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `limit`  | `z.number().int().min(1).max(100).default(40),` | [schemas.ts](../../../src/features/communications/schemas.ts) |
| `status` | `z.enum(announcementStatusOptions).optional(),` | [schemas.ts](../../../src/features/communications/schemas.ts) |
| `id`     | `z.string().uuid(),`                            | [schemas.ts](../../../src/features/communications/schemas.ts) |
| `title`  | `z.string().trim().min(2).max(160),`            | [schemas.ts](../../../src/features/communications/schemas.ts) |
| `body`   | `z.string().trim().min(2).max(4000),`           | [schemas.ts](../../../src/features/communications/schemas.ts) |

## Regras de negócio e fonte

Link para fornecedor não é entrega; notificações reais só após confirmação do transporte e destinatários autorizados.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                           | Colunas existentes                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `communication_dispatches`       | `id`, `school_id`, `channel`, `provider`, `external_message_id`, `sender_address`, `recipient`, `subject_or_template`, `status`, `delivered_at`, `error_details`, `metadata`, `created_at`, `updated_at`                                                                                                                                                                                                |
| `enrollments`                    | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average`                                                                                                                                                               |
| `finance_contracts`              | `id`, `school_id`, `enrollment_id`, `fee_plan_id`, `discount_percentage`, `status`, `created_by`, `created_at`                                                                                                                                                                                                                                                                                          |
| `finance_invoices`               | `id`, `school_id`, `contract_id`, `fee_item_id`, `invoice_number`, `competence_month`, `amount`, `discount_amount`, `due_date`, `status`, `issued_by`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `created_at`, `penalty_amount`                                                                                                                                                            |
| `people`                         | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address`                                                                                                                       |
| `school_announcements`           | `id`, `school_id`, `title`, `body`, `audience`, `channel`, `status`, `scheduled_for`, `published_at`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `version`                                                                                                                                                                                                                   |
| `school_memberships`             | `id`, `school_id`, `user_id`, `status`, `created_at`, `updated_at`, `joined_at`, `invited_at`, `activated_at`, `suspended_at`, `last_access_at`                                                                                                                                                                                                                                                         |
| `schools`                        | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `user_communication_preferences` | `id`, `user_id`, `school_id`, `security_enabled`, `academic_enabled`, `financial_enabled`, `attendance_enabled`, `calendar_enabled`, `announcements_enabled`, `events_enabled`, `documents_enabled`, `marketing_enabled`, `channel_preferences`, `created_at`, `updated_at`, `version`                                                                                                                  |

Relações confirmadas:

- `communication_dispatches` → `schools` (`communication_dispatches_school_id_fkey`)
- `enrollments` → `academic_years` (`enrollments_school_id_academic_year_id_fkey`)
- `enrollments` → `class_groups` (`enrollments_school_id_class_group_id_fkey`)
- `enrollments` → `schools` (`enrollments_school_id_fkey`)
- `enrollments` → `students` (`enrollments_school_id_student_id_fkey`)
- `finance_contracts` → `enrollments` (`finance_contracts_school_id_enrollment_id_fkey`)
- `finance_contracts` → `fee_plans` (`finance_contracts_school_id_fee_plan_id_fkey`)
- `finance_contracts` → `schools` (`finance_contracts_school_id_fkey`)
- `finance_invoices` → `fee_items` (`finance_invoices_school_id_fee_item_id_fkey`)
- `finance_invoices` → `finance_contracts` (`finance_invoices_school_id_contract_id_fkey`)
- `finance_invoices` → `schools` (`finance_invoices_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `school_announcements` → `schools` (`school_announcements_school_id_fkey`)
- `school_memberships` → `schools` (`school_memberships_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `user_communication_preferences` → `schools` (`user_communication_preferences_school_id_fkey`)

## Contratos de API e erros

| Função                              | Método | Entrada                                       | Fonte                                                                                   |
| ----------------------------------- | ------ | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `syncSchoolContactsToResendFn`      | POST   | `Sem schema de entrada explícito neste bloco` | [contacts-sync-server.ts](../../../src/features/communications/contacts-sync-server.ts) |
| `listSchoolCommunicationDispatches` | GET    | `listDispatchesInputSchema`                   | [dispatches-server.ts](../../../src/features/communications/dispatches-server.ts)       |
| `getCommunicationDispatchStats`     | GET    | `Sem schema de entrada explícito neste bloco` | [dispatches-server.ts](../../../src/features/communications/dispatches-server.ts)       |
| `listSchoolAnnouncements`           | GET    | `listAnnouncementsInputSchema`                | [server.ts](../../../src/features/communications/server.ts)                             |
| `createSchoolAnnouncement`          | POST   | `createAnnouncementInputSchema`               | [server.ts](../../../src/features/communications/server.ts)                             |
| `updateSchoolAnnouncementStatus`    | POST   | `updateAnnouncementStatusInputSchema`         | [server.ts](../../../src/features/communications/server.ts)                             |
| `updateSchoolAnnouncement`          | POST   | `updateAnnouncementInputSchema`               | [server.ts](../../../src/features/communications/server.ts)                             |
| `archiveSchoolAnnouncement`         | POST   | `archiveAnnouncementInputSchema`              | [server.ts](../../../src/features/communications/server.ts)                             |

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

- [announcement-audience.test.ts](../../../tests/communications/announcement-audience.test.ts)
- [dispatches-schemas.test.ts](../../../tests/communications/dispatches-schemas.test.ts)
- [resend-contacts.test.ts](../../../tests/communications/resend-contacts.test.ts)
- [schemas.test.ts](../../../tests/communications/schemas.test.ts)
- [templates.test.ts](../../../tests/communications/templates.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [comunicacoes.tsx](../../../src/routes/comunicacoes.tsx)
- [schemas.ts](../../../src/features/communications/schemas.ts)
- [server.ts](../../../src/features/communications/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
