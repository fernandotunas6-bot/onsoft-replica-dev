# Códigos de autenticação

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Códigos de autenticação; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Destinatário e fluxo que originou o código. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Pedir código → limitar tentativas → enviar a destino de teste → validar → expirar/rejeitar reuso.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

- `schools.status`: `active`, `archived`, `setup`, `suspended`
- `tenants.status`: `active`, `archived`, `cancelled`, `past_due`, `provisioning`, `provisioning_failed`, `suspended`, `trial`

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

Sem declaração de campos Zod local inventariada; consultar o contrato de origem/importado nas fontes, antes de qualquer alteração.

## Regras de negócio e fonte

OTP confirma identidade/destino; não cria permissão escolar por si. Conteúdo e códigos não devem ir aos logs.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

Especificação complementar: [SGA_SECURITY_ACCESS_SPEC.md](../SGA_SECURITY_ACCESS_SPEC.md).

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela                     | Colunas existentes                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `communication_dispatches` | `id`, `school_id`, `channel`, `provider`, `external_message_id`, `sender_address`, `recipient`, `subject_or_template`, `status`, `delivered_at`, `error_details`, `metadata`, `created_at`, `updated_at`                                                                                                                                                                                                |
| `schools`                  | `id`, `public_code`, `name`, `timezone`, `currency_code`, `status`, `theme`, `created_at`, `updated_at`, `nif`, `email`, `phone`, `province`, `municipality`, `address`, `logo_path`, `official_authorization_reference`, `tenant_id`, `commercial_name`, `city`, `logo_url`, `director_name`, `evaluation_periods`, `passing_grade`, `preferences`, `commune`, `neighborhood`, `latitude`, `longitude` |
| `tenants`                  | `id`, `name`, `slug`, `status`, `plan_id`, `subscription_status`, `trial_ends_at`, `contact_name`, `contact_phone`, `contact_email`, `max_students`, `max_storage_gb`, `created_at`, `updated_at`, `billing_exempt`, `billing_exempt_reason`                                                                                                                                                            |
| `verification_otps`        | `id`, `school_id`, `user_id`, `target_identifier`, `channel_sent`, `purpose`, `code_hash`, `attempts_left`, `expires_at`, `consumed_at`, `requested_ip`, `user_agent`, `created_at`                                                                                                                                                                                                                     |

Relações confirmadas:

- `communication_dispatches` → `schools` (`communication_dispatches_school_id_fkey`)
- `schools` → `tenants` (`schools_tenant_id_fkey`)
- `tenants` → `plans` (`tenants_plan_id_fkey`)
- `verification_otps` → `schools` (`verification_otps_school_id_fkey`)

## Contratos de API e erros

| Função                     | Método | Entrada                 | Fonte                                            |
| -------------------------- | ------ | ----------------------- | ------------------------------------------------ |
| `requestOtpVerificationFn` | POST   | `requestOtpInputSchema` | [server.ts](../../../src/features/otp/server.ts) |
| `verifyOtpCodeFn`          | POST   | `verifyOtpInputSchema`  | [server.ts](../../../src/features/otp/server.ts) |

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

- [dispatch-status-mapping.test.ts](../../../tests/otp/dispatch-status-mapping.test.ts)
- [otp-service.test.ts](../../../tests/otp/otp-service.test.ts)
- [verify-atomic.test.ts](../../../tests/otp/verify-atomic.test.ts)
- [webhook-signatures.test.ts](../../../tests/otp/webhook-signatures.test.ts)
- [whatsapp-otp-adapter.test.ts](../../../tests/otp/whatsapp-otp-adapter.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [server.ts](../../../src/features/otp/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
