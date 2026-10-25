# Mensagens internas

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Mensagens internas; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Utilizadores e destinatários permitidos na escola. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Seleccionar conversa autorizada → enviar → persistir → receber → consultar histórico.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `school_memberships.status`: `active`, `invited`, `revoked`, `suspended`
- `siga_chat_conversations.type`: `direct`, `group`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo            | Declaração observada                                      | Schema de origem                                                  |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `conversationId` | `z.string().uuid(),`                                      | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `limit`          | `z.number().int().min(10).max(200).default(60),`          | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `before`         | `z.string().datetime().optional(),`                       | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `id`             | `string;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `ts`             | `number;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `text`           | `string;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `from`           | `string;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `status`         | `ChatMessageStatus;`                                      | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `deleted`        | `boolean;`                                                | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `replyTo`        | `{ id: string; from: string; text: string } \| null;`     | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `file`           | `{ name: string; size: number; fileId: string } \| null;` | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `id`             | `string;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `type`           | `ChatConversationType;`                                   | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `name`           | `string;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `sub`            | `string;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `peerId`         | `string \| null;`                                         | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `avatarUrl`      | `string \| null;`                                         | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `unread`         | `number;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `messages`       | `ChatMessage[];`                                          | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `id`             | `string;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `name`           | `string;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `sub`            | `string;`                                                 | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `avatarUrl`      | `string \| null;`                                         | [chat-schemas.ts](../../../src/features/messages/chat-schemas.ts) |
| `peerId`         | `z.string().uuid(),`                                      | [schemas.ts](../../../src/features/messages/schemas.ts)           |
| `limit`          | `z.number().int().min(10).max(200).default(80),`          | [schemas.ts](../../../src/features/messages/schemas.ts)           |
| `peerId`         | `string;`                                                 | [schemas.ts](../../../src/features/messages/schemas.ts)           |
| `full_name`      | `string;`                                                 | [schemas.ts](../../../src/features/messages/schemas.ts)           |
| `avatar_url`     | `string \| null;`                                         | [schemas.ts](../../../src/features/messages/schemas.ts)           |
| `lastActivityAt` | `string;`                                                 | [schemas.ts](../../../src/features/messages/schemas.ts)           |
| `lastBody`       | `string;`                                                 | [schemas.ts](../../../src/features/messages/schemas.ts)           |
| `lastIncomingAt` | `string \| null;`                                         | [schemas.ts](../../../src/features/messages/schemas.ts)           |

## Regras de negócio e fonte

A entrega e o acesso à conversa não dependem apenas do menu; cache e realtime devem respeitar a troca de escola.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                    | Colunas existentes                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `member_roles`            | `school_id`, `membership_id`, `role_id`, `created_at`                                                                                                                                                                                                        |
| `profiles`                | `id`, `display_name`, `locale`, `created_at`, `updated_at`, `phone`, `full_name`, `avatar_url`, `cargo`, `school_id`, `national_id`, `first_name`, `last_name`, `preferred_name`, `avatar_path`, `timezone`, `status`, `onboarding_status`, `last_active_at` |
| `roles`                   | `id`, `school_id`, `code`, `name`, `is_system`, `created_at`                                                                                                                                                                                                 |
| `school_memberships`      | `id`, `school_id`, `user_id`, `status`, `created_at`, `updated_at`, `joined_at`, `invited_at`, `activated_at`, `suspended_at`, `last_access_at`                                                                                                              |
| `siga_chat_conversations` | `id`, `school_id`, `type`, `title`, `student_id`, `direct_key`, `created_by`, `created_at`                                                                                                                                                                   |
| `siga_chat_members`       | `conversation_id`, `user_id`, `last_read_at`, `joined_at`                                                                                                                                                                                                    |
| `siga_chat_messages`      | `id`, `conversation_id`, `school_id`, `sender_id`, `body`, `reply_to`, `attachment_file_id`, `attachment_file_name`, `deleted_at`, `created_at`                                                                                                              |
| `siga_direct_messages`    | `id`, `school_id`, `sender_id`, `recipient_id`, `body`, `created_at`, `created_by`, `attachment_file_id`, `attachment_file_name`                                                                                                                             |

Relações confirmadas:

- `member_roles` → `roles` (`member_roles_role_id_fkey`)
- `member_roles` → `roles` (`member_roles_school_id_role_id_fkey`)
- `member_roles` → `school_memberships` (`member_roles_membership_id_fkey`)
- `member_roles` → `school_memberships` (`member_roles_school_id_membership_id_fkey`)
- `member_roles` → `schools` (`member_roles_school_id_fkey`)
- `profiles` → `schools` (`profiles_school_id_fkey`)
- `roles` → `schools` (`roles_school_id_fkey`)
- `school_memberships` → `schools` (`school_memberships_school_id_fkey`)
- `siga_chat_conversations` → `schools` (`siga_chat_conversations_school_id_fkey`)
- `siga_chat_conversations` → `students` (`siga_chat_conversations_student_id_fkey`)
- `siga_chat_members` → `siga_chat_conversations` (`siga_chat_members_conversation_id_fkey`)
- `siga_chat_messages` → `schools` (`siga_chat_messages_school_id_fkey`)
- `siga_chat_messages` → `siga_chat_conversations` (`siga_chat_messages_conversation_id_fkey`)
- `siga_chat_messages` → `siga_chat_messages` (`siga_chat_messages_reply_to_fkey`)
- `siga_chat_messages` → `siga_files` (`siga_chat_messages_attachment_file_id_fkey`)
- `siga_direct_messages` → `schools` (`siga_direct_messages_school_id_fkey`)
- `siga_direct_messages` → `siga_files` (`siga_direct_messages_attachment_file_id_fkey`)

## Contratos de API e erros

| Função                    | Método | Entrada                                       | Fonte                                                           |
| ------------------------- | ------ | --------------------------------------------- | --------------------------------------------------------------- |
| `listChatConversations`   | GET    | `Sem schema de entrada explícito neste bloco` | [chat-server.ts](../../../src/features/messages/chat-server.ts) |
| `listChatMessages`        | GET    | `listChatMessagesInputSchema`                 | [chat-server.ts](../../../src/features/messages/chat-server.ts) |
| `sendChatMessage`         | POST   | `sendChatMessageInputSchema`                  | [chat-server.ts](../../../src/features/messages/chat-server.ts) |
| `deleteChatMessage`       | POST   | `deleteChatMessageInputSchema`                | [chat-server.ts](../../../src/features/messages/chat-server.ts) |
| `markChatRead`            | POST   | `conversationInputSchema`                     | [chat-server.ts](../../../src/features/messages/chat-server.ts) |
| `startDirectConversation` | POST   | `startDirectInputSchema`                      | [chat-server.ts](../../../src/features/messages/chat-server.ts) |
| `listChatContacts`        | GET    | `Sem schema de entrada explícito neste bloco` | [chat-server.ts](../../../src/features/messages/chat-server.ts) |
| `listSchoolColleagues`    | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/messages/server.ts)           |
| `listDirectThread`        | GET    | `listDirectThreadInputSchema`                 | [server.ts](../../../src/features/messages/server.ts)           |
| `sendDirectMessage`       | POST   | `sendDirectMessageInputSchema`                | [server.ts](../../../src/features/messages/server.ts)           |
| `listInboxPreviews`       | GET    | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/messages/server.ts)           |

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

- [schemas.test.ts](../../../tests/messages/schemas.test.ts)
- [thread-order.test.ts](../../../tests/messages/thread-order.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [comunicacoes.tsx](../../../src/routes/comunicacoes.tsx)
- [schemas.ts](../../../src/features/messages/schemas.ts)
- [server.ts](../../../src/features/messages/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
