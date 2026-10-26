# Ligação do novo visual à navegação contextual

Trabalho disponível na [PR #244](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/244),
branch `refine/contextual-sidebar`. Comparações e limites no
[relatório visual](../visual/2026-10-22/README.md).

Este documento orienta a integração pedida com o trabalho de outros agentes.
Foi identificada a [PR #245](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/245),
branch `refine/touch-response-modal-search-20261022`, commit `e4db10fa`.
A contribuição de toque, transições e pesquisa foi combinada com os refinamentos
de modais desta branch, conservando os dois históricos. Evidências no relatório
visual. Isto não identifica nem comprova uma reprodução das imagens de outra
conversa; essa referência visual continua por confirmar.

## Onde aplicar o visual

| Responsabilidade           | Ponto existente                                                                                                   | Compatibilidade a conservar                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Cores, densidade e raio    | `src/lib/appearance.tsx`, `src/styles.css`                                                                        | Usar tokens semânticos; manter as escolhas pessoais e a marca escolar               |
| Marca institucional        | `src/lib/brand-tokens.ts`                                                                                         | Reutilizar a conversão existente e os dados da escola activa                        |
| Sidebar e menus recolhidos | `src/components/layout/AppSidebar.tsx`, `NavItem.tsx`                                                             | Conservar contexto, links com pesquisa, portal Radix e retorno do foco              |
| Resolução do módulo        | `src/features/auth/contextual-navigation.ts`                                                                      | Continuar a receber o catálogo autorizado; não duplicar destinos                    |
| Cabeçalhos e painéis       | `src/components/layout/PageHeader.tsx`                                                                            | Manter hierarquia curta, breadcrumbs e estatísticas recolhíveis acessíveis          |
| Cartões e indicadores      | `src/components/ui/stat-card.tsx`, `src/components/ui/card.tsx`                                                   | Aplicar o acabamento partilhado e preservar tons de estado explícitos               |
| Pesquisa e filtros         | `src/components/filters/ListFilterBar.tsx`, `src/components/filters/debounced-search-input.tsx`                   | Preservar debounce, parâmetros, rótulos e remoção individual de filtros             |
| Estados vazios e listas    | `src/components/ui/empty-state.tsx`, `src/components/ui/data-table-shell.tsx`, `src/components/ui/pagination.tsx` | Preservar acções, mascote de primeiro uso, todas as colunas e destinos da paginação |

A navegação mobile continua a pertencer ao AppShell existente;
não montar uma segunda sidebar ou uma segunda árvore de autorização.

## Contrato de aparência existente

`applyAppearance` aplica presets SIGA, Shadcn, Tweakcn e tema importado, nesta ordem.
A marca escolar aplica-se quando não existe tema externo nem preferência por accent
pessoal. As variáveis manuais sobrepõem as camadas anteriores; o raio escolhido é
reaplicado no fim. O catálogo de temas carrega por `import()` e a geração mais
recente impede que uma resposta tardia reponha uma aparência antiga.

O novo acabamento deve usar `--background`, `--foreground`, `--border`,
`--primary`, `--muted-foreground` e a família `--sidebar-*` existente. Para a
selecção na sidebar, conservar `--sidebar-active`: o preset claro e os escuros já
derivam valores diferentes. Não substituir essa regra por texto branco fixo.

Mudar apenas tema ou densidade não deve fechar o módulo aberto, repor a lista de
áreas ou mudar a página. Mudar rota, escola ou papel continua a actualizar o
contexto. A visibilidade dos menus acompanha as permissões existentes; não
substitui autorização de rota ou servidor.

## Verificação ao receber a outra implementação

1. Registar a branch/commit ou as imagens efectivamente recebidas e comparar os
   ficheiros partilhados com esta PR antes de integrar.
2. Aplicar os estilos nos pontos acima, conservando os comportamentos existentes;
   resolver sobreposições sem substituir ficheiros inteiros de forma cega.
3. Executar os testes de `sidebar-nav`, `contextual-navigation`,
   `appearance-theme-catalogue`, `appearance-sem-ciclo-de-render`,
   `page-header-breadcrumb-contract` e `shared-list-controls`.
4. Comparar as mesmas páginas em 1440/834/390 px, incluindo sidebar recolhida,
   teclado, tema claro/escuro, nomes longos e filtros. Distinguir ensaio controlado
   de sessão escolar autenticada no relatório.

Já existem testes de transição claro/escuro e densidade que renderizam a sidebar
real com fronteiras de conta/router substituídas e preservam os destinos e a
escolha de áreas. Estes testes verificam comportamento, não contraste renderizado.
Os testes existentes de aparência cobrem o catálogo assíncrono e a precedência
das variáveis. A integração da PR #245 acrescenta ensaios reais de alvos de toque,
movimento reduzido e composição IME. A comparação com as imagens de outra conversa
permanece pendente.

A sincronização até `1d4b6d37` incorpora a paginação portuguesa e os testes de menus
da PR #245. Estados vazios e tabelas foram refinados sobre essa base; a paginação
admite quebra de linha em larguras estreitas. Capturas e verificações no relatório.

Continuação de 23/10: sincronizada a contribuição até `48da1656`, conciliando
quebra de linha e deslocação na paginação. Os separadores passam a revelar o
destino focado e o breadcrumb mantém a página actual como texto.
[Comparação e verificação](../visual/2026-10-23/README.md).
