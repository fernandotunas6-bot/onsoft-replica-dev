# Resposta ao toque e fluidez — continuação da PR #244

Data: 2026-10-22. Base: `refine/contextual-sidebar`, inicialmente `59396d4`; sincronizada com a versão `8e7f884` da PR #244, preservando a revisão paralela dos modais.

## O que foi corrigido

| Componente | Problema identificado no código | Alteração |
| --- | --- | --- |
| `src/components/ui/dialog.tsx` | Fecho visual de 16×16 px sem área táctil definida | Área interactiva de 44×44 **pixels CSS reais** (a raiz da aplicação é reduzida); mantém o ícone de 16×16 px, foco visível e os ajustes simultâneos de título longo, rodapé e scroll responsivo da PR #244 |
| `src/components/ui/sheet.tsx` | Abertura em 500 ms e fecho em 300 ms; animação executada mesmo com redução de movimento | Objectivos de 200/150 ms; animações apenas com `motion-safe`; botão de fecho 44×44 px sem ampliar o ícone |
| `src/components/filters/debounced-search-input.tsx` | Debounce dispara consultas com texto ainda em composição IME | Suspensão de pedidos enquanto há composição; debounce de 220 ms após o final; entradas normais preservadas |
| `src/components/ui/data-table-shell.tsx` | `transition-all` permite animar alterações de layout sem necessidade | Transições apenas de cor de fundo e borda, respeitando movimento reduzido |
| `src/components/ui/popover.tsx`, `tooltip.tsx` | Animações sem variante explícita para movimento reduzido | Apenas animar quando permitido; conservar as superfícies, rótulos e a duração partilhada do SIGA |

## Âmbito e compatibilidade

Estas mudanças propagam-se aos módulos que já usam os componentes partilhados. Não foram alterados o catálogo de navegação, a identidade visual, os dados, os campos de formulário, os contratos de API, a base de dados, RBAC, autenticação ou o modelo multi-tenant.

O comportamento de fecho de Dialog/Sheet e os nomes acessíveis existentes são preservados. Os controlos continuam a depender das operações reais do servidor; nenhum sucesso optimista de operações críticas foi introduzido.

`tests/ui/touch-motion-contract.test.tsx` cobre fecho de diálogo e sheet, alvos táctil e visual, duração e movimento reduzido por contrato de classes, composição IME e debounce normal. `tests/ui/menu-motion-contract.test.ts` protege a activação condicional das animações de popover e tooltip.

## Validação a executar no checkout completo

```bash
bun install --frozen-lockfile
bunx vitest run tests/ui/touch-motion-contract.test.tsx tests/ui/menu-motion-contract.test.ts tests/ui/modal-shell.test.tsx tests/ui/shared-list-controls.test.tsx
bunx eslint src/components/ui/dialog.tsx src/components/ui/sheet.tsx src/components/ui/popover.tsx src/components/ui/tooltip.tsx src/components/ui/data-table-shell.tsx src/components/filters/debounced-search-input.tsx tests/ui/touch-motion-contract.test.tsx tests/ui/menu-motion-contract.test.ts
npm run typecheck
npm run build
```

Depois: comparação visual em 390, 834 e 1440 px; teclado e leitores de ecrã; redução de movimento no SO; Android/iOS físicos; sessão real de perfis com permissões diferentes e mudança de escola.

**Limites de verificação nesta contribuição:** alterações feitas via API do GitHub; os jobs de CI executam lint, tipos, testes e build no GitHub, mas só se devem declarar aprovados os passos que constam concluídos. A auditoria de dependências falhou na base e nesta PR devido ao DOMPurify transitivo — [issue #246](https://github.com/fernandotunas6-bot/onsoft-replica-dev/issues/246). Valores de 150/200/220 ms são parâmetros de código, não medições de INP/FPS. Nenhum deploy ou migração foi executado.

## Integração com outros agentes

Esta continuação é uma PR empilhada sobre a #244: rever e integrar a #244 antes ou juntamente com esta contribuição. A sincronização incorporou os ajustes responsivos do diálogo e do alerta realizados em paralelo. Em futuras alterações concorrentes, comparar e voltar a combinar as versões, sem substituir o trabalho do outro agente. Conservar o contrato em `docs/design/CONTEXTUAL_VISUAL_INTEGRATION.md`.
