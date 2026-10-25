# Candidatura e matrícula pública

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Candidatura e matrícula pública; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Visitante envia; Secretaria/Administrador analisam. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Abrir campanha → enviar candidatura → emitir talão → analisar → aceitar/rejeitar → criar aluno → encaminhar matrícula.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `enrollment_applications.status`: `accepted`, `pending`, `rejected`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `programs.grading_profile`: `20_ects`, `components`, `components`, `frequencia_exame`, `gpa4`, `scale`, `scale`, `so_exame`
- `programs.kind`: `general`, `postgraduate`, `professional`, `technical`, `undergraduate`
- `school_integrations.status`: `configured`, `connected`, `disconnected`, `error`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo                  | Declaração observada                                                     | Schema de origem                                          |
| ---------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `title`                | `z.string().trim().min(3).max(120),`                                     | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `subtitle`             | `optionalText,`                                                          | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `heroText`             | `optionalText,`                                                          | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `accentColor`          | `z`                                                                      | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `logoUrl`              | `optionalText,`                                                          | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `isOpen`               | `z.boolean().default(true),`                                             | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `visibleFields`        | `z`                                                                      | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `id`                   | `z.string().uuid(),`                                                     | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `slug`                 | `z`                                                                      | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `slug`                 | `getPublicEnrollmentFormInputSchema.shape.slug,`                         | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `person`               | `personCoreFieldsObjectSchema`                                           | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `guardianName`         | `optionalText,`                                                          | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `guardianPhone`        | `optionalText,`                                                          | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `guardianRelationship` | `optionalText,`                                                          | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `desiredProgramId`     | `z.string().uuid().optional(),`                                          | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `status`               | `z.enum(["pending", "accepted", "rejected", "all"]).default("pending"),` | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `limit`                | `z.number().int().min(1).max(200).default(50),`                          | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `applicationId`        | `z.string().uuid(),`                                                     | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `decision`             | `z.enum(["accepted", "rejected"]),`                                      | [schemas.ts](../../../src/features/enrollment/schemas.ts) |
| `classGroupId`         | `z.string().uuid().optional(),`                                          | [schemas.ts](../../../src/features/enrollment/schemas.ts) |

## Regras de negócio e fonte

Número CAND é canónico; decisão repetida não pode criar outro aluno; turma é da escola/ano do formulário.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                    | Colunas existentes                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `class_groups`            | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id`                                                                                                                      |
| `enrollment_applications` | `id`, `school_id`, `form_id`, `full_name`, `payload`, `status`, `decided_at`, `decided_by`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`, `student_id`                                                                                                                                                                                                               |
| `enrollment_forms`        | `id`, `school_id`, `slug`, `title`, `subtitle`, `hero_text`, `accent_color`, `logo_url`, `is_open`, `visible_fields`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `version`                                                                                                                                                                                                   |
| `people`                  | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address`                                                                                                                       |
| `person_documents`        | `id`, `school_id`, `person_id`, `document_type`, `document_number`, `issued_at`, `expires_at`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `file_id`, `file_name`                                                                                                                                                                                                             |
| `programs`                | `id`, `school_id`, `academic_level_id`, `code`, `name`, `kind`, `is_active`, `created_at`, `grading_profile`                                                                                                                                                                                                                                                                                            |
| `school_integrations`     | `id`, `school_id`, `provider`, `status`, `config`, `created_at`, `updated_at`, `created_by`, `updated_by`                                                                                                                                                                                                                                                                                               |
| `schools`                 | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `students`                | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`                                                                                                                                                                                                                                                      |

Relações confirmadas:

- `class_groups` → `academic_years` (`class_groups_school_id_academic_year_id_fkey`)
- `class_groups` → `campuses` (`class_groups_school_id_campus_id_fkey`)
- `class_groups` → `grade_levels` (`class_groups_school_id_grade_level_id_fkey`)
- `class_groups` → `rooms` (`class_groups_school_id_room_id_fkey`)
- `class_groups` → `schools` (`class_groups_school_id_fkey`)
- `class_groups` → `students` (`class_groups_delegate_student_fk`)
- `class_groups` → `teachers` (`class_groups_school_id_homeroom_teacher_id_fkey`)
- `enrollment_applications` → `enrollment_forms` (`enrollment_applications_form_id_fkey`)
- `enrollment_applications` → `schools` (`enrollment_applications_school_id_fkey`)
- `enrollment_forms` → `schools` (`enrollment_forms_school_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `person_documents` → `people` (`person_documents_person_id_fkey`)
- `person_documents` → `schools` (`person_documents_school_id_fkey`)
- `programs` → `academic_levels` (`programs_school_id_academic_level_id_fkey`)
- `programs` → `schools` (`programs_school_id_fkey`)
- `school_integrations` → `schools` (`school_integrations_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)

## Contratos de API e erros

| Função                        | Método | Entrada                                       | Fonte                                                   |
| ----------------------------- | ------ | --------------------------------------------- | ------------------------------------------------------- |
| `getOrCreateEnrollmentForm`   | POST   | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/enrollment/server.ts) |
| `updateEnrollmentForm`        | POST   | `updateEnrollmentFormInputSchema`             | [server.ts](../../../src/features/enrollment/server.ts) |
| `getPublicEnrollmentForm`     | GET    | `getPublicEnrollmentFormInputSchema`          | [server.ts](../../../src/features/enrollment/server.ts) |
| `submitPublicEnrollment`      | POST   | `submitPublicEnrollmentInputSchema`           | [server.ts](../../../src/features/enrollment/server.ts) |
| `listEnrollmentApplications`  | GET    | `listEnrollmentApplicationsInputSchema`       | [server.ts](../../../src/features/enrollment/server.ts) |
| `decideEnrollmentApplication` | POST   | `decideEnrollmentApplicationInputSchema`      | [server.ts](../../../src/features/enrollment/server.ts) |

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

- [candidate-groups.test.ts](../../../tests/enrollment/candidate-groups.test.ts)
- [decide-application-integrity.test.ts](../../../tests/enrollment/decide-application-integrity.test.ts)
- [desired-program.test.ts](../../../tests/enrollment/desired-program.test.ts)
- [no-privileged-fallback.test.ts](../../../tests/enrollment/no-privileged-fallback.test.ts)
- [process-number-contract.test.ts](../../../tests/enrollment/process-number-contract.test.ts)
- [schemas.test.ts](../../../tests/enrollment/schemas.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [$slug.tsx](../../../src/routes/matricula/$slug.tsx)
- [schemas.ts](../../../src/features/enrollment/schemas.ts)
- [server.ts](../../../src/features/enrollment/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
