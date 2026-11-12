# Arquivos escolares

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Arquivos escolares; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Pessoal autorizado; aluno/encarregado apenas no âmbito permitido. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Seleccionar ficheiro → validar → carregar bytes → gravar metadados → consultar/descarregar → substituir/arquivar.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `class_groups.shift`: `afternoon`, `evening`, `full_day`, `morning`
- `class_groups.status`: `active`, `archived`, `closed`, `draft`
- `people.sex`: `female`, `male`, `other`, `undisclosed`
- `people.status`: `active`, `archived`, `inactive`
- `school_memberships.status`: `active`, `invited`, `revoked`, `suspended`
- `siga_file_events.action`: `access_denied`, `created`, `deleted`, `downloaded`, `folder_created`, `linked_class`, `metadata_updated`, `moved`, `opened`, `renamed`, `unlinked_class`, `visibility_changed`
- `siga_files.area`: `escola`, `pessoal`, `publico`, `secretaria`
- `siga_files.category`: `bilhete`, `certificado`, `comunicado`, `contrato`, `fatura`, `foto`, `material_aula`, `outro`, `pauta`, `recibo`, `talao`
- `siga_files.storage_backend`: `local`, `sga`
- `siga_files.visibility`: `private`, `public`, `school`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo | Declaração observada | Schema de origem |
| --- | --- | --- |
| `title` | `z.string().trim().min(1).max(180).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `description` | `z.string().trim().max(800).optional().or(z.literal("")),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `category` | `fileCategorySchema.default("outro"),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `documentDate` | `z` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `referenceCode` | `z.string().trim().max(80).optional().or(z.literal("")),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedUserId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedPersonId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `query` | `z.string().trim().optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `area` | `fileAreaSchema.optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `classGroupId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedUserId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedPersonId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `category` | `fileCategorySchema.optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `parentId` | `z.string().uuid().nullable().optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `limit` | `z.number().int().min(1).max(FILE_LIST_LIMIT).default(FILE_LIST_LIMIT),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `name` | `z.string().trim().min(1).max(180),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `mime` | `z.string().trim().min(1).max(120),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `sizeBytes` | `z.number().int().min(1).max(FILE_MAX_BYTES),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `area` | `fileAreaSchema,` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `visibility` | `fileVisibilitySchema,` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `storagePath` | `z.string().trim().min(1).max(400),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `storageBackend` | `z.enum(fileBackendOptions),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `classGroupId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `parentId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `title` | `z.string().trim().min(1).max(180).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `description` | `z.string().trim().max(800).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `category` | `fileCategorySchema.optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `documentDate` | `z.string().trim().optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `referenceCode` | `z.string().trim().max(80).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedUserId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedPersonId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `name` | `z.string().trim().min(1).max(120),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `area` | `fileAreaSchema,` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `parentId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `visibility` | `fileVisibilitySchema.default("private"),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `ids` | `z.array(z.string().uuid()).min(1).max(40),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `parentId` | `z.string().uuid().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `area` | `fileAreaSchema.optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `folderId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `category` | `z.enum(["recibo", "talao", "fatura"]),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `title` | `z.string().trim().min(1).max(180),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `description` | `z.string().trim().min(12).max(800),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedPersonId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `sourceLabel` | `z.string().trim().max(120).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `documentCode` | `z.string().trim().max(40).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `amountLabel` | `z.string().trim().max(80).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `ids` | `z.array(z.string().uuid()).min(1).max(60),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `name` | `z.string().trim().min(1).max(180),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `title` | `z.string().trim().min(1).max(180).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `description` | `z.string().trim().max(800).optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `category` | `fileCategorySchema.optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `documentDate` | `z.string().trim().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `referenceCode` | `z.string().trim().max(80).optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedUserId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedPersonId` | `z.string().uuid().optional().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `visibility` | `fileVisibilitySchema.optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `area` | `fileAreaSchema.optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `classGroupId` | `z.string().uuid().nullable(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `visibility` | `fileVisibilitySchema,` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `action` | `fileEventActionSchema,` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `detail` | `z.string().trim().max(240).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `z.string().uuid(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `limit` | `z.number().int().min(1).max(40).default(20),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `query` | `z.string().trim().max(80).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `limit` | `z.number().int().min(1).max(40).default(24),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `query` | `z.string().trim().max(80).optional(),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `limit` | `z.number().int().min(1).max(40).default(24),` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `schoolId` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `ownerUserId` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `name` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `mime` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `kind` | `(typeof fileKindOptions)[number];` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `sizeBytes` | `number;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `area` | `(typeof fileAreaOptions)[number];` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `visibility` | `(typeof fileVisibilityOptions)[number];` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `storageBackend` | `(typeof fileBackendOptions)[number];` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `storagePath` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `classGroupId` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `parentId` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `isFolder` | `boolean;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `title` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `description` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `category` | `(typeof fileCategoryOptions)[number] \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `documentDate` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `referenceCode` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedUserId` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedPersonId` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedUserName` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `relatedPersonName` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `isSystem` | `boolean;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `createdAt` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `updatedAt` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `updatedByUserId` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `lastAction` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `lastActionAt` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `lastActionByUserId` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `ownerName` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `updatedByName` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `lastActionByName` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `ownerAvatarUrl` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `updatedByAvatarUrl` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `lastActionByAvatarUrl` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `id` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `fileId` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `action` | `(typeof fileEventActions)[number];` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `detail` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `actorUserId` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `actorName` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `actorAvatarUrl` | `string \| null;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |
| `createdAt` | `string;` | [schemas.ts](../../../src/features/arquivos/schemas.ts) |

## Regras de negócio e fonte

Existência de metadados não prova upload; links e paths exigem âmbito e expiração. Reversão não elimina anexos pré-existentes.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `class_groups` | `id`, `school_id`, `academic_year_id`, `campus_id`, `grade_level_id`, `homeroom_teacher_id`, `code`, `name`, `shift`, `capacity`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `delegate_student_id`, `whatsapp_invite_url`, `whatsapp_group_name`, `room_id` |
| `people` | `id`, `school_id`, `full_name`, `preferred_name`, `date_of_birth`, `sex`, `national_id`, `email`, `phone`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `photo_path`, `photo_url`, `deleted_at`, `user_id`, `province`, `municipality`, `commune`, `address` |
| `profiles` | `id`, `display_name`, `locale`, `created_at`, `updated_at`, `phone`, `full_name`, `avatar_url`, `cargo`, `school_id`, `national_id`, `first_name`, `last_name`, `preferred_name`, `avatar_path`, `timezone`, `status`, `onboarding_status`, `last_active_at` |
| `school_memberships` | `id`, `school_id`, `user_id`, `status`, `created_at`, `updated_at`, `joined_at`, `invited_at`, `activated_at`, `suspended_at`, `last_access_at` |
| `siga_file_events` | `id`, `school_id`, `file_id`, `actor_user_id`, `action`, `detail`, `created_at` |
| `siga_files` | `id`, `school_id`, `owner_user_id`, `name`, `mime`, `size_bytes`, `area`, `visibility`, `storage_backend`, `storage_path`, `class_group_id`, `is_folder`, `parent_id`, `title`, `description`, `category`, `document_date`, `reference_code`, `related_user_id`, `related_person_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `last_action`, `last_action_at`, `last_action_by`, `is_system`, `deleted_at` |
| `students` | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |

Relações confirmadas:

- `class_groups` → `academic_years` (`class_groups_school_id_academic_year_id_fkey`)
- `class_groups` → `campuses` (`class_groups_school_id_campus_id_fkey`)
- `class_groups` → `grade_levels` (`class_groups_school_id_grade_level_id_fkey`)
- `class_groups` → `rooms` (`class_groups_school_id_room_id_fkey`)
- `class_groups` → `schools` (`class_groups_school_id_fkey`)
- `class_groups` → `students` (`class_groups_delegate_student_fk`)
- `class_groups` → `teachers` (`class_groups_school_id_homeroom_teacher_id_fkey`)
- `people` → `schools` (`people_school_id_fkey`)
- `profiles` → `schools` (`profiles_school_id_fkey`)
- `school_memberships` → `schools` (`school_memberships_school_id_fkey`)
- `siga_file_events` → `schools` (`siga_file_events_school_id_fkey`)
- `siga_file_events` → `siga_files` (`siga_file_events_file_id_fkey`)
- `siga_files` → `people` (`siga_files_related_person_id_fkey`)
- `siga_files` → `schools` (`siga_files_school_id_fkey`)
- `siga_files` → `siga_files` (`siga_files_parent_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `getFilesWorkspace` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/arquivos/server.ts) |
| `listArquivosClassOptions` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/arquivos/server.ts) |
| `listSchoolFiles` | GET | `listArquivosInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `registerSchoolFile` | POST | `registerSchoolFileInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `createSchoolFolder` | POST | `createSchoolFolderInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `moveSchoolFiles` | POST | `moveSchoolFilesInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `listFolderTrail` | GET | `listFolderTrailInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `archiveFinanceDocument` | POST | `archiveFinanceDocumentInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `renameSchoolFile` | POST | `renameSchoolFileInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `updateSchoolFileMeta` | POST | `updateSchoolFileMetaInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `listArquivosUserOptions` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/arquivos/server.ts) |
| `listArquivosPersonOptions` | GET | `listArquivosPeopleInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `listArquivosStudentOptions` | GET | `listArquivosStudentsInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `setSchoolFileVisibility` | POST | `setSchoolFileVisibilityInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `linkSchoolFileToClass` | POST | `linkSchoolFileToClassInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `deleteSchoolFile` | POST | `schoolFileIdInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `logSchoolFileEvent` | POST | `logSchoolFileEventInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `listSchoolFileActivity` | GET | `listSchoolFileActivityInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `signSchoolFile` | GET | `schoolFileIdInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |
| `signSchoolFiles` | GET | `schoolFileIdsInputSchema` | [server.ts](../../../src/features/arquivos/server.ts) |

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

- [own-upload-path.test.ts](../../../tests/arquivos/own-upload-path.test.ts)
- [person-photo-url.test.ts](../../../tests/arquivos/person-photo-url.test.ts)
- [schemas.test.ts](../../../tests/arquivos/schemas.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [arquivos.tsx](../../../src/routes/arquivos.tsx)
- [schemas.ts](../../../src/features/arquivos/schemas.ts)
- [server.ts](../../../src/features/arquivos/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
