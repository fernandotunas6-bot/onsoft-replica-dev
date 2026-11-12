# Resposta ao toque e fluidez — continuação da PR #244

Data: 2026-10-22. Base: `refine/contextual-sidebar`, commit `59396d4`.

## O que foi corrigido

| Componente | Problema identificado no código | Alteração |
| --- | --- | --- |
| `src/components/ui/dialog.tsx` | Fecho sem área táctil definida | Área interactiva 44×44 px, mantendo as classes `h-4 w-4` do ícone; foco por teclado mais claro |
| `src/components/ui/sheet.tsx` | Abertura em 500 ms e fecho em 300 ms; animação executada mesmo com redução de movimento | Objectivos de 200/150 ms; animações apenas com `motion-safe`; botão de fecho 44×44 px sem ampliar o ícone |
| `src/components/filters/debounced-search-input.tsx` | Debounce dispara consultas com texto ainda em composição IME | Suspensão de pedidos enquanto há composição; debounce de 220 ms após o final; entradas normais preservadas |
| `src/components/ui/data-table-shell.tsx` | `transition-all` permite animar alterações de layout sem necessidade | Transições apenas de cor de fundo e borda, respeitando movimento reduzido |

## Âmbito e compatibilidade

Estas mudanças propagam-se aos módulos que já usam os componentes partilhados. Não foram alterados o catálogo de navegação, a identidade visual, os dados, os campos de formulário, os contratos de API, a base de dados, RBAC, autenticação ou o modelo multi-tenant.

O comportamento de fecho de Dialog/Sheet e os nomes acessíveis existentes são preservados. Os controlos continuam a depender das operações reais do servidor; nenhum sucesso optimista de operações críticas foi introduzido.

O novo ficheiro `tests/ui/touch-motion-contract.test.tsx` cobre fecho de diálogo e sheet, áreas táctil e visual, duração e movimento reduzido por contrato de classes, composição IME e debounce normal.

## Validação a executar no checkout completo

```bash
npm ci
npx vitest run tests/ui/touch-motion-contract.test.tsx tests/ui/modal-shell.test.tsx tests/ui/shared-list-controls.test.tsx
npx eslint src/components/ui/dialog.tsx src/components/ui/sheet.tsx src/components/ui/data-table-shell.tsx src/components/filters/debounced-search-input.tsx tests/ui/touch-motion-contract.test.tsx
npm run typecheck
npm run build
```

Depois: comparação visual em 390, 834 e 1440 px; teclado e leitores de ecrã; redução de movimento no SO; Android/iOS físicos; sessão real de perfis com permissões diferentes e mudança de escola.

**Limites de verificação nesta contribuição:** alterações efectuadas via API do GitHub, sem checkout local disponível nem execução dos testes/compilação. Valores de 150/200/220 ms são parâmetros de código, não medições de INP ou FPS. Nenhum deploy ou migração foi executado.

## Integração com outros agentes

Esta continuação é uma PR empilhada sobre a #244: rever e integrar a #244 antes ou juntamente com esta contribuição. Comparar a branch do outro agente antes de resolver ficheiros sobrepostos. Conservar o contrato em `docs/design/CONTEXTUAL_VISUAL_INTEGRATION.md`.

## Validação na integração com a PR #244

A contribuição da PR #245, commit `e4db10fa`, foi integrada na branch
`refine/contextual-sidebar`, preservando os refinamentos mais recentes dos modais.
O cabeçalho de Dialog/Sheet reserva agora 32 px adicionais para separar o título
do novo alvo táctil. As classes do ícone são preservadas: o seu tamanho renderizado
acompanha a fonte raiz, que no ensaio foi 12 px em mobile/tablet e 11 px em desktop;
o alvo interactivo mede 44 × 44 px em todos estes casos.

Foi acrescentado um quinto teste: iniciar composição cancela uma pesquisa que já
estava pendente e só envia o texto final após o debounce. O ensaio Chromium confirma
esse comportamento, o foco contido no painel, o retorno ao botão de abertura e
a ausência de sobreposição entre título e fecho em 390/834/1440 px.

Com movimento normal, o estilo computado da animação de abertura é 0,2 s; com
movimento reduzido, o nome da animação é `none`. Isto não mede INP ou FPS.
As capturas e os resultados estão no [relatório de integração](../visual/2026-10-22/README.md).
Sessão autenticada, leitores de ecrã e dispositivos físicos continuam pendentes.

Sincronização adicional até `22670f4c`: combinadas as actualizações concorrentes
do modal e o suporte de movimento reduzido em Popover/Tooltip. A reserva de 32 px
do cabeçalho foi mantida por já separar o alvo táctil no ensaio real. Os detalhes
e os resultados finais de integração estão no relatório acima.
