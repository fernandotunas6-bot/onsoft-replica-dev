# Vocabulário institucional na navegação mobile

Continuação sobre `eed0d976d9ac561b1dd555dfe777b990dda32fd7` de main.

## Problema e correcção

O desktop já usa «Estudantes» nas instituições exclusivamente de Ensino Superior,
mas o menu «Mais» continuava a mostrar e pesquisar «Alunos». O MoreHub passa a
reutilizar `isHigherEdOnly` e `withHigherEdVocabulary`, exactamente como AppSidebar.
Instituições de ensino geral ou misto conservam «Alunos». A pesquisa segue os
rótulos apresentados, sem alterar caminhos, parâmetros, perfis ou permissões.
Os modais existentes não foram alterados.

## Comparação

Componentes reais com conta, configurações escolares, router e rede simulados;
não são capturas autenticadas de produção. O conteúdo atrás da gaveta é fictício.

| Antes, 390 px                           | Depois, 390 px                          |
| --------------------------------------- | --------------------------------------- |
| ![Antes](sidebar-labels-before-390.png) | ![Depois](sidebar-labels-after-390.png) |

## Verificação efectuada

- **88 testes em 6 ficheiros**: menu mobile, vocabulário, sidebar desktop,
  contexto, árvore académica e portal-engine.
- Casos novos: ensino geral, Superior, misto, pesquisa por «estudante», troca de
  escola e portal de aluno do Superior sem áreas administrativas.
- ESLint nos dois ficheiros TypeScript alterados e `git diff --check`.
- Chromium a **390, 834 e 1440 px**, com dados fictícios do Superior: rótulo
  consistente, rota `/alunos` e `action=matricular` preservados, sem overflow
  horizontal; gaveta fechada após selecção nos dois tamanhos mobile/tablet.
- Resultados: `sidebar-labels-results.json`. Os indicadores `false` no registo
  «before» significam que os fluxos de clique não foram executados nesse caso;
  no desktop a gaveta não se aplica.

## Estado anterior confirmado e limites

As PRs #256 e #259 estão integradas. Os checks executados do último commit da
#259 (`45365c0b`) passaram. O workflow «Deploy produção» do merge `86920d33`,
execução `39972083996`, concluiu com sucesso, incluindo tipos, lint, testes,
publicação e verificação de resposta dos serviços.

Este incremento de vocabulário é novo e não foi publicado. Typecheck/build globais
dependem da sua CI. Não foram validadas sessões reais, permissões por escola no
backend, dispositivos físicos ou leitores de ecrã. A evidência da publicação
anterior não constitui validação desses fluxos autenticados.
