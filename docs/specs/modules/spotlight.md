# Pesquisa e atalhos de trabalho

**Data:** 08/10/2026. **Estado:** implementação presente; aceitação integrada por concluir. As alterações específicas são distinguidas no documento de correcções.

## Objectivo e âmbito

Pesquisa e atalhos de trabalho; operar dentro da responsabilidade escolar/plataforma definida pela arquitectura, sem duplicar a fonte de verdade de outro módulo.

## Estado actual e comportamento pretendido

**Implementado:** os ficheiros, contratos e tabelas abaixo estão inventariados. A auditoria anterior e os testes locais identificam provas parciais. Não implica que todas as operações estejam completas.

**Proposto:** concluir em staging os critérios de persistência, recuperação e isolamento indicados nesta SPEC. **Por decidir:** regras da instituição não presentes na configuração/documentação e acessos externos indispensáveis.

## Perfis e permissões

Utilizador autenticado com permissão no destino. O cargo não substitui grant por módulo nem âmbito escolar. O servidor volta a autorizar cada pedido.

## Pré-condições e dependências

Sessão válida, vínculo activo e escola seleccionada autorizada; configurações do ano/turma/contrato quando usadas. Escrita sensível exige AAL2. Relações carregadas de outra escola são recusadas. Testes com escrita exigem ambiente isolado e destinos sintéticos.

## Fluxo principal e alternativas

Pesquisar tarefa/registo → filtrar capacidades autorizadas → abrir destino com contexto → executar na área responsável.

Sem pré-requisito: explicar a falta e ligar à configuração responsável. Sem permissão: impedir o pedido. Erro recuperável: preservar o preenchimento, mostrar o motivo e permitir repetir sem duplicar. Conflito de versão/capacidade: reler o contexto e pedir revisão antes de gravar. Transporte externo indisponível: não anunciar entrega/sucesso fictícios.

## Estados e transições

Os estados efectivos estão nos schemas e contratos abaixo; não se propõe um novo enum por inferência da interface.

Enum permitido não autoriza qualquer transição: as guardas de alteração, publicação, fecho e reabertura no servidor/SQL são normativas. Transições sem regra documentada ficam **por decidir**, não são habilitadas por esta SPEC.

## Campos, formatos e validações

Os schemas ligados são o contrato efectivo, incluindo refinamentos, campos opcionais/defaults e validação condicional. O inventário abaixo mostra as declarações encontradas; expressões multilinha e schemas derivados devem ser lidos na fonte, não inferidos apenas desta tabela.

| Campo | Declaração observada | Schema de origem |
| --- | --- | --- |
| `item` | `Pick<SpotlightItem, "kind" \| "surfaces">,` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `items` | `SpotlightItem[],` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `input` | `{` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `enabled` | `z.boolean().optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `order` | `z.number().int().optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `title` | `z.string().trim().min(3).max(80).optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `body` | `z.string().trim().min(8).max(180).optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `cta` | `z.string().trim().min(2).max(40).optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `roles` | `z.array(z.enum(applicationRoles)).optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `startsOn` | `z.union([spotlightDaySchema, z.null()]).optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `endsOn` | `z.union([spotlightDaySchema, z.null()]).optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `surfaces` | `z` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `link` | `spotlightLinkSchema.optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `kind` | `z.enum(spotlightKinds).optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `logoUrl` | `z.string().trim().optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `tone` | `z.enum(spotlightTones).optional(),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `items` | `z.record(z.string(), spotlightItemOverrideSchema).default({}),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `extras` | `z.array(spotlightItemSchema).max(MAX_CUSTOM_SPOTLIGHTS).default([]),` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `catalog` | `SpotlightItem[],` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `overrides` | `SpotlightOverridesInput \| null \| undefined,` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `catalog` | `SpotlightItem[],` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |
| `edited` | `SpotlightItem[],` | [schemas.ts](../../../src/features/spotlight/schemas.ts) |

## Regras de negócio e fonte

Resultado de pesquisa não concede acesso; o endpoint de destino volta a validar âmbito e permissão.

Fonte: implementação e skills canónicos, `DATABASE_RULES.md`, configuração efectiva da escola e SPEC temática quando ligada. Regras académicas/financeiras sem fundamento institucional confirmado ficam **por decidir**.

## Modelo de dados e relações

Tabelas confirmadas no banco existente; este levantamento não propõe substituí-las:

| Tabela | Colunas existentes |
| --- | --- |
| `school_settings` | `id`, `school_id`, `domain`, `version`, `value`, `changed_by`, `created_at` |

Relações confirmadas:

- `school_settings` → `schools` (`school_settings_school_id_fkey`)

## Contratos de API e erros

| Função | Método | Entrada | Fonte |
| --- | --- | --- | --- |
| `listSpotlightConfig` | GET | `Sem schema de entrada explícito neste bloco` | [server.ts](../../../src/features/spotlight/server.ts) |
| `saveSpotlightOverrides` | POST | `spotlightOverridesSchema` | [server.ts](../../../src/features/spotlight/server.ts) |

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

- [catalog.test.ts](../../../tests/spotlight/catalog.test.ts)
- [link-schemes.test.ts](../../../tests/spotlight/link-schemes.test.ts)

**Riscos/pendências:** jornada anual e A/B autenticado exigem staging; concorrência PostgreSQL, fornecedores, restauro, artefactos oficiais extensos e dispositivos reais não ficam certificados por mocks/PGlite. Consultar a matriz e o progresso para o resultado efectivamente executado.

## Fontes e navegação

- [index.tsx](../../../src/routes/index.tsx)
- [schemas.ts](../../../src/features/spotlight/schemas.ts)
- [server.ts](../../../src/features/spotlight/server.ts)

[Índice](../README.md) · [Contratos transversais](../CONTRATOS_TRANSVERSAIS.md)
