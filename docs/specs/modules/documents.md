# Documentos, modelos e exportações

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Documentos, modelos e exportações; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Pessoal autorizado em documentos e no domínio dos dados exportados. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Escolher modelo → seleccionar pessoa/turma/período → validar dados → gerar → imprimir/descarregar → verificar autenticidade.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `document_requests.request_type`: `certificate`, `declaration`, `other`, `term`, `transfer`
- `document_requests.status`: `approved`, `cancelled`, `fulfilled`, `in_review`, `rejected`, `submitted`
- `document_templates.document_type`: `certificate`, `declaration`, `other`, `term`, `transfer`
- `document_templates.status`: `active`, `draft`, `retired`
- `enrollments.status`: `active`, `cancelled`, `completed`, `pending`, `transferred`
- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo | Declaração observada | Schema de origem |
| --- | --- | --- |
| `limit` | `z.number().int().min(1).max(250).default(100),` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `studentId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `templateId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `requestNumber` | `z.string().trim().min(1).max(64),` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `priority` | `z.enum(["normal", "urgent"]).default("normal"),` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `dueOn` | `z.string().date().optional(),` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `notes` | `z.string().trim().max(1000).optional(),` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `requestId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `status` | `z.enum(["queued", "processing", "ready", "delivered", "rejected", "cancelled"]),` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `key` | `printTemplateKeySchema,` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `key` | `printTemplateKeySchema,` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `source` | `z` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `key` | `printTemplateKeySchema,` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `key` | `printTemplateKeySchema,` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `schoolName` | `string;` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `studentName` | `string;` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `registrationNumber` | `string;` | [schemas.ts](../../../src/features/documents/schemas.ts) |
| `academicYear` | `string;` | [schemas.ts](../../../src/features/documents/schemas.ts) |

## Regras de negócio e fonte

Modelo/assinante devem pertencer à escola; filtros da lista devem acompanhar exportação; homologação/legalidade não são inferidas do PDF.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `audit_logs` | `id`, `school_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `occurred_at` |
| `class_groups` | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `document_requests` | `id`, `school_id`, `student_id`, `template_id`, `request_type`, `status`, `purpose`, `requested_by`, `reviewed_by`, `reviewed_at`, `review_note`, `created_at`, `updated_at` |
| `document_templates` | `id`, `school_id`, `code`, `name`, `document_type`, `version`, `status`, `body_template`, `allowed_fields`, `created_by`, `created_at` |
| `enrollments` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `student_id`, `enrollment_number`, `enrolled_on`, `status`, `ended_on`, `end_reason`, `created_by`, `updated_by`, `created_at`, `updated_at`, `attendance_rate`, `final_average` |
| `school_settings` | `id`, `school_id`, `domain`, `version`, `value`, `changed_by`, `created_at` |
| `schools` | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `students` | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |

Relações confirmadas:

- `audit_logs` → `schools` (`audit_logs_school_id_fkey`)
- `class_groups` → `academic_years` (`class_groups_school_id_academic_year_id_fkey`)
- `class_groups` → `campuses` (`class_groups_school_id_campus_id_fkey`)
- `class_groups` → `grade_levels` (`class_groups_school_id_grade_level_id_fkey`)
- `class_groups` → `rooms` (`class_groups_school_id_room_id_fkey`)
- `class_groups` → `schools` (`class_groups_school_id_fkey`)
- `class_groups` → `students` (`class_groups_delegate_student_fk`)
- `class_groups` → `teachers` (`class_groups_school_id_homeroom_teacher_id_fkey`)
- `document_requests` → `document_templates` (`document_requests_school_id_template_id_fkey`)
- `document_requests` → `schools` (`document_requests_school_id_fkey`)
- `document_requests` → `students` (`document_requests_school_id_student_id_fkey`)
- `document_templates` → `schools` (`document_templates_school_id_fkey`)
- `enrollments` → `academic_years` (`enrollments_school_id_academic_year_id_fkey`)
- `enrollments` → `class_groups` (`enrollments_school_id_class_group_id_fkey`)
- `enrollments` → `schools` (`enrollments_school_id_fkey`)
- `enrollments` → `students` (`enrollments_school_id_student_id_fkey`)
- `school_settings` → `schools` (`school_settings_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `listDocumentWorkspace` | GET | `listDocumentsInputSchema` | [server.ts](../../../src/features/documents/server.ts) |
| `createDocumentRequest` | POST | `createDocumentRequestInputSchema` | [server.ts](../../../src/features/documents/server.ts) |
| `updateDocumentRequestStatus` | POST | `updateDocumentRequestStatusInputSchema` | [server.ts](../../../src/features/documents/server.ts) |
| `listPrintTemplates` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/documents/server.ts) |
| `getPrintTemplate` | POST | `getPrintTemplateInputSchema` | [server.ts](../../../src/features/documents/server.ts) |
| `savePrintTemplate` | POST | `savePrintTemplateInputSchema` | [server.ts](../../../src/features/documents/server.ts) |
| `resetPrintTemplate` | POST | `resetPrintTemplateInputSchema` | [server.ts](../../../src/features/documents/server.ts) |
| `setActivePrintTemplate` | POST | `setActivePrintTemplateInputSchema` | [server.ts](../../../src/features/documents/server.ts) |
| `registerIssuedDocument` | POST | `registerInputSchema` | [verification.ts](../../../src/features/documents/verification.ts) |
| `verifyIssuedDocument` | GET | `verifyInputSchema` | [verification.ts](../../../src/features/documents/verification.ts) |

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

- [print-settings.test.ts](../../../tests/documents/print-settings.test.ts)
- [print-templates.test.ts](../../../tests/documents/print-templates.test.ts)
- [schemas.test.ts](../../../tests/documents/schemas.test.ts)
- [verification.test.ts](../../../tests/documents/verification.test.ts)
- [vocabulario-de-estados.test.ts](../../../tests/documents/vocabulario-de-estados.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [documentos.tsx](../../../src/routes/documentos.tsx)
- [schemas.ts](../../../src/features/documents/schemas.ts)
- [server.ts](../../../src/features/documents/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
