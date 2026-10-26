# Catracas e cartões de acesso

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Catracas e cartões de acesso; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Administrador gere dispositivo/cartão; utilizador usa credencial própria. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Registar dispositivo → emitir cartão → autenticar leitura → verificar âmbito/replay → registar acesso.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `siga_access_cards.status`: `active`, `expired`, `lost`, `suspended`
- `siga_access_logs.direction`: `entry`, `exit`
- `siga_access_logs.status`: `denied`, `granted`
- `siga_attendance_records.status`: `absent`, `early_exit`, `excused`, `late`, `not_registered`, `present`
- `siga_attendance_sessions.status`: `cancelled`, `completed`, `pending`
- `siga_turnstile_devices.device_type`: `door`, `gate`, `scanner_app`, `turnstile`
- `siga_turnstile_devices.direction_capability`: `bidirectional`, `entry`, `exit`
- `siga_turnstile_devices.status`: `maintenance`, `offline`, `online`
- `students.status`: `active`, `applicant`, `cancelled`, `graduated`, `inactive`, `locked`, `suspended`, `transferred`, `withdrawn`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo | Declaração observada | Schema de origem |
| --- | --- | --- |
| `personId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `studentId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `rfidTag` | `z.string().optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `token` | `z.string().min(3, "Token ou código inválido."),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `deviceId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `direction` | `accessDirectionEnum.default("entry"),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `name` | `z.string().min(3, "O nome deve ter pelo menos 3 caracteres."),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `location` | `z.string().min(2, "Informe a localização (ex: Portaria Principal)."),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `deviceType` | `turnstileDeviceTypeEnum.default("turnstile"),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `directionCapability` | `z.enum(["entry", "exit", "bidirectional"]).default("bidirectional"),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `ipAddress` | `z.string().optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `macAddress` | `z.string().optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `personId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `studentId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `deviceId` | `z.string().uuid().optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `status` | `accessStatusEnum.optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `direction` | `accessDirectionEnum.optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `date` | `z.string().optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `limit` | `z.number().int().min(1).max(500).default(50),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `cardId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `status` | `accessCardStatusEnum,` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `deviceId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `status` | `z.enum(["online", "offline", "maintenance"]).optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `ipAddress` | `z.string().max(64).optional().nullable(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `name` | `z.string().min(3).max(120).optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `location` | `z.string().min(2).max(160).optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `deviceId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `cardId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `rfidTag` | `z.string().max(64).nullable().optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `cardId` | `z.string().uuid(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `status` | `accessCardStatusEnum.optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `search` | `z.string().max(80).optional(),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `limit` | `z.number().int().min(1).max(200).default(80),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `apiKey` | `z.string().min(8, "API key inválida."),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `token` | `z.string().min(3, "Token ou código inválido."),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |
| `direction` | `accessDirectionEnum.default("entry"),` | [schemas.ts](../../../src/features/catracas/schemas.ts) |

## Regras de negócio e fonte

Dispositivo e cartão têm vínculo escolar; segredos só no servidor. Acesso físico não substitui presença de aula.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

Especificação complementar: [SGA_GATE_QR_LESSON_ATTENDANCE_PAYROLL_SPEC.md](../SGA_GATE_QR_LESSON_ATTENDANCE_PAYROLL_SPEC.md).

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `siga_access_cards` | `id`, `school_id`, `person_id`, `student_id`, `card_number`, `barcode`, `qr_secret`, `rfid_tag`, `status`, `issued_at`, `expires_at`, `created_at`, `updated_at` |
| `siga_access_logs` | `id`, `school_id`, `person_id`, `student_id`, `card_id`, `device_id`, `direction`, `status`, `denial_reason`, `device_name`, `created_at` |
| `siga_attendance_records` | `id`, `school_id`, `session_id`, `student_id`, `status`, `notes`, `recorded_by`, `created_at`, `updated_at` |
| `siga_attendance_sessions` | `id`, `school_id`, `academic_year_id`, `class_group_id`, `subject_id`, `teacher_id`, `timetable_slot_id`, `lesson_date`, `period_number`, `starts_at`, `ends_at`, `status`, `notes`, `created_at`, `created_by`, `updated_at`, `updated_by` |
| `siga_turnstile_devices` | `id`, `school_id`, `name`, `location`, `device_type`, `direction_capability`, `ip_address`, `mac_address`, `api_key`, `status`, `last_ping_at`, `created_at` |
| `students` | `id`, `school_id`, `person_id`, `student_number`, `admission_date`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |

Relações confirmadas:

- `siga_access_cards` → `people` (`siga_access_cards_person_id_fkey`)
- `siga_access_cards` → `schools` (`siga_access_cards_school_id_fkey`)
- `siga_access_cards` → `students` (`siga_access_cards_student_id_fkey`)
- `siga_access_logs` → `people` (`siga_access_logs_person_id_fkey`)
- `siga_access_logs` → `schools` (`siga_access_logs_school_id_fkey`)
- `siga_access_logs` → `siga_access_cards` (`siga_access_logs_card_id_fkey`)
- `siga_access_logs` → `siga_turnstile_devices` (`siga_access_logs_device_id_fkey`)
- `siga_access_logs` → `students` (`siga_access_logs_student_id_fkey`)
- `siga_attendance_records` → `schools` (`siga_attendance_records_school_id_fkey`)
- `siga_attendance_records` → `siga_attendance_sessions` (`siga_attendance_records_session_id_fkey`)
- `siga_attendance_records` → `students` (`siga_attendance_records_student_id_fkey`)
- `siga_attendance_sessions` → `academic_years` (`siga_attendance_sessions_academic_year_id_fkey`)
- `siga_attendance_sessions` → `class_groups` (`siga_attendance_sessions_class_group_id_fkey`)
- `siga_attendance_sessions` → `schools` (`siga_attendance_sessions_school_id_fkey`)
- `siga_attendance_sessions` → `subjects` (`siga_attendance_sessions_subject_id_fkey`)
- `siga_attendance_sessions` → `teachers` (`siga_attendance_sessions_teacher_id_fkey`)
- `siga_attendance_sessions` → `timetable_slots` (`siga_attendance_sessions_timetable_slot_id_fkey`)
- `siga_turnstile_devices` → `schools` (`siga_turnstile_devices_school_id_fkey`)
- `students` → `people` (`students_school_id_person_id_fkey`)
- `students` → `schools` (`students_school_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `getOrCreateVirtualCard` | POST | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/catracas/server.ts) |
| `validateGatePassToken` | POST | `validateGatePassTokenInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `validateGatePassByDeviceApiKey` | POST | `validateGatePassDeviceInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `listTurnstileDevices` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/catracas/server.ts) |
| `revealTurnstileDeviceApiKey` | POST | `revealTurnstileDeviceApiKeyInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `registerTurnstileDevice` | POST | `registerTurnstileDeviceInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `updateTurnstileDevice` | POST | `updateTurnstileDeviceInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `setAccessCardStatus` | POST | `setAccessCardStatusInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `linkAccessCardRfid` | POST | `linkAccessCardRfidInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `rotateAccessCardQr` | POST | `rotateAccessCardQrInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `issueAccessCard` | POST | `issueAccessCardInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `listAccessCards` | GET | `listAccessCardsInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `listAccessLogs` | GET | `listAccessLogsInputSchema` | [server.ts](../../../src/features/catracas/server.ts) |
| `exportGatePassOfflineList` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/catracas/server.ts) |
| `getCampusVsClassroomReconciliation` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/catracas/server.ts) |

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

- [gate-pass-secret-only.test.ts](../../../tests/catracas/gate-pass-secret-only.test.ts)
- [gate-pass-token.test.ts](../../../tests/catracas/gate-pass-token.test.ts)
- [gate-pass-validation.test.ts](../../../tests/catracas/gate-pass-validation.test.ts)
- [hardware-pulse.test.ts](../../../tests/catracas/hardware-pulse.test.ts)
- [reconciliation.test.ts](../../../tests/catracas/reconciliation.test.ts)
- [schemas.test.ts](../../../tests/catracas/schemas.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [device-scan.tsx](../../../src/routes/api/catracas/device-scan.tsx)
- [catracas.tsx](../../../src/routes/catracas.tsx)
- [schemas.ts](../../../src/features/catracas/schemas.ts)
- [server.ts](../../../src/features/catracas/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
