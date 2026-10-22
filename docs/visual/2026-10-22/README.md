# Refinamento visual e navegação contextual

Base: `82b5bdc3` (main). Referência de organização: [Atlassian Navigation System](https://atlassian.design/components/navigation-system/). Adaptação aos componentes e permissões do SIGA; sem instalar Atlaskit.

## Alterações

| Área | Antes | Depois | Evidência |
| --- | --- | --- | --- |
| Sidebar | Grupos globais e submenus acumulados em armazenamento local | Contexto derivado do catálogo autorizado; Todas as áreas/Voltar ao módulo; um submenu global aberto por vez | `tests/routes/sidebar-nav.test.tsx` |
| Académico | Árvore académica montada também no financeiro | Árvore apresentada no contexto pedagógico | Condição em `AppSidebar.tsx`; árvore e APIs preservadas |
| Destino activo | Listagem genérica e acção específica podiam aparecer seleccionadas simultaneamente | Parâmetros específicos têm prioridade; links sem estado explícito conservam o comportamento do router | `tests/auth/contextual-navigation.test.ts` |
| Cabeçalhos e estatísticas | Ícones primários e sombras por omissão | Ícones neutros e hierarquia mais discreta; tons de estado explícitos preservados | `PageHeader.tsx` |
| Painéis e cartões | Sombras, elevação ao hover e cantos maiores | Superfícies com bordas subtis, sem elevação decorativa | `PageHeader.tsx`, `card.tsx` |

Catálogo, ordem dos destinos, rotas, grants, plano, RBAC, autenticação, APIs e base de dados não foram alterados. A navegação usa apenas o resultado já filtrado de `getPortalNavigation`. Continua disponível a navegação mobile própria do AppShell. A preferência de recolher a sidebar mantém-se.

## Comparação visual

Capturas de componentes reais (`AppSidebar`, `PageHeader`, `StatGrid`, `Panel`) num cenário controlado de Faturas e Recibos. Escola, pessoa, valores e registos são fictícios. Conta, sessão, router e fronteiras de rede foram substituídos no ensaio; não são capturas de uma escola autenticada nem prova de funcionamento financeiro.

| Tamanho | Antes | Depois |
| --- | --- | --- |
| Desktop 1440 × 900 | [Antes](before-1440.png) | [Depois](after-1440.png) |
| Tablet 834 × 900 | [Antes](before-834.png) | [Depois](after-834.png) |
| Telemóvel 390 × 900 | [Antes](before-390.png) | [Depois](after-390.png) |

A composição de demonstração em tablet/telemóvel verifica os componentes partilhados, não o AppShell mobile autenticado. Captura adicional: [sidebar recolhida](after-collapsed.png).

## Validação e limites

- Testes dirigidos de navegação, sidebar, apresentação e ausência de ciclo de render aprovados.
- Chromium headless: seis capturas (antes/depois em 1440/834/390 px), sem erros JavaScript nem transbordo horizontal do documento. Alternância Todas as áreas/Voltar ao módulo e recolher a sidebar exercitadas. Inter local servido no ensaio.
- ESLint dos ficheiros alterados: sem erros; avisos de Fast Refresh nos módulos que também exportam constantes.
- Build Cloudflare concluído numa primeira passagem; repetição final após o ajuste de estabilidade em verificação.
- TypeScript: primeira execução esgotou o heap padrão de 2 GB; repetição com 6 GB em verificação.
- Suite completa em verificação; não confundir os testes dirigidos com aprovação global.

Pendente: sessão real, permissões dinâmicas entre escolas, dispositivos físicos, teclado/zoom e auditoria de todos os módulos e formulários extensos. Não houve deploy nem migrações de produção.
