# Alinhamento da navegação contextual — 23/10/2026

## Âmbito e contribuição paralela

Base: `246cdd1a80daa548402f56571a0b556130491731` de `main`.
Integra a [PR #256](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/256),
commits até `5add1808e9afc087991f5a7d695bedefce709a74`, mantendo o seu histórico
e sem modificar a branch de origem.

Foram recuperadas orientações resumidas do trabalho paralelo: refinar o AppShell
e a sidebar existentes, reutilizar componentes, preservar identidade, permissões,
dados e regras de negócio, e validar desktop/mobile. O prompt integral e a conversa
em tempo real do outro agente não estão disponíveis nesta sessão.

A instrução actual limita esta fase à navegação. Os modais existentes não foram
alterados; fica registada a preferência por modais simples, objectivos e necessários.

## Implementação

- `AppSidebar.tsx`: contribuição da PR #256 mantém a área seleccionada nas páginas
  de detalhe, com a mesma resolução de caminhos e parâmetros dos destinos.
- `MoreHub.tsx`: o catálogo «Todas as áreas» mantém a indicação da área actual no
  telemóvel, mesmo ao explorar outra área. Usa os destinos já filtrados por perfil,
  permissões e plano; não cria outro catálogo de autorização.
- O botão da área usa `aria-current="true"`; os links das páginas continuam a usar
  `aria-current="page"`. Mantém foco visível, cores institucionais e comportamento
  existente de fechar a gaveta ao seleccionar uma página.
- Mantidos o lado esquerdo recto e o encontro inverso da sidebar com o conteúdo.
- Continuação da PR #256: o submenu recolhido fecha ao mudar a escola, o perfil
  ou a rota/parâmetros. Um rerender sem mudança de contexto mantém-no aberto;
  pode voltar a abrir por teclado, e Escape devolve o foco ao botão.
- A pesquisa mobile cancela o temporizador pendente ao mudar o contexto. Um
  termo introduzido na escola/página anterior não reaparece na nova navegação.

## Antes e depois

Ensaio com componentes reais, conta/router/rede controlados e dados fictícios.
Não são capturas autenticadas de produção. A página simulada é
`/alunos/aluno-teste`; o cabeçalho atrás da gaveta é apenas conteúdo de demonstração.

| Antes: área sem destaque | Depois: Secretaria identificada |
| --- | --- |
| ![Antes](sidebar-alignment-before.png) | ![Depois](sidebar-alignment-after.png) |

## Validação efectuada

- Node 24: **81 testes aprovados em 5 ficheiros** (sidebar, menu mobile,
  contexto, árvore académica e portal-engine).
- **13 testes mobile aprovados**, incluindo cancelamento da pesquisa pendente
  ao mudar escola ou rota. ESLint nos quatro ficheiros TypeScript alterados e
  `git diff --check`.
- Chromium, 390 px: antes/depois do catálogo numa página de detalhe, navegação por
  teclado para Secretaria, matrícula com parâmetros preservados, fecho da gaveta
  e ausência de overflow horizontal.
- Chromium, 390 e 1440 px: perfis simulados Aluno, Encarregado e Professor,
  áreas académicas, frequência/notas no mesmo contexto, calendário directo,
  ausência de destinos administrativos e parâmetros preservados. Nas três
  variantes mobile, a gaveta fecha após navegação.
- Resultados estruturados: `sidebar-alignment-results.json` e
  `portal-areas-browser-results.json`.

## Pendente

A CI do primeiro commit publicado da PR #259 (`2a4d9fdf`) passou nos checks de
estilo/acessibilidade/tipos/testes/build, WEB e auditoria de dependências;
Lighthouse e smoke E2E foram ignorados pelo workflow da PR. A continuação precisa
de uma nova execução da CI. Os testes apresentados não
validam contas reais, autorização por escola no backend, dispositivos físicos,
leitores de ecrã ou todos os fluxos funcionais. Esta alteração não foi publicada
em produção.
