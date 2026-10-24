# Separadores e orientação da página — 23/10/2026

Continuação da [PR #244](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/244).
Histórico e comparações anteriores: [22/10](../2026-10-22/README.md).

## Alterações implementadas

- `TabsList` contém a deslocação horizontal; os destinos preservam a largura do
  rótulo. O foco é desenhado dentro do separador, sem depender de espaço exterior
  que o contentor deslocável pode cortar.
- `TabsTrigger` revela o destino focado com `scrollIntoView`, alinhamento próximo
  e comportamento instantâneo. O navegador podia deixar o último destino apenas
  parcialmente visível ao chegar por End/setas. O callback `onFocus` do consumidor
  continua a ser executado e pode impedir esse comportamento com `preventDefault`.
  Activação, ordem, orientação e separadores desactivados continuam sob Radix.
- `BreadcrumbPage` é texto com `aria-current="page"`, sem o papel de link sem
  destino. Links reais ganham foco visível dentro dos limites do texto.
- Integrada a contribuição da PR #245 até `48da1656`: a paginação conserva a quebra
  de linha validada e incorpora limites de largura/deslocação horizontal para
  conteúdos excepcionais. As reticências anunciam «Mais páginas», escondendo apenas
  o ícone decorativo. Destinos e rótulos personalizados permanecem.

## Comparação visual

Componentes reais com conteúdo fictício e sem sessão escolar. O ensaio contém
cinco separadores, um desactivado, e mostra o último após navegação por teclado.

| Largura | Antes | Depois |
| --- | --- | --- |
| 390 px | [Antes](sections-before-390.png) | [Depois](sections-after-390.png) |
| 1440 px | [Antes](sections-before-1440.png) | [Depois](sections-after-1440.png) |

## Validação

- 20 testes aprovados em cinco ficheiros: navegação entre secções, breadcrumbs,
  layout responsivo, paginação e wizard. Testes reais de DOM confirmam a passagem
  por destinos desactivados, Home e a semântica da página actual.
- Chromium: 12 cenários, quatro larguras (320/390/834/1440 px); quatro antes e oito
  depois, estes com direcção esquerda/direita e direita/esquerda. O último destino
  fica inteiramente dentro da faixa, com foco interior, sem transbordo do documento.
  Setas, Home/End e passagem por separadores desactivados aprovados; sem erros
  JavaScript. [Medições](sections-results.json).
- O ensaio de listas foi repetido com a paginação conciliada nas quatro larguras:
  sem transbordo após a alteração, limpeza de filtros de demonstração, deslocação
  da tabela por teclado e destino Seguinte preservados.
  [Resultados](pagination-sync-results.json).
- Zero diagnósticos sintácticos e semânticos TypeScript dirigidos aos 26 ficheiros
  de código/testes acumulados na PR. Não substitui a verificação global.
- ESLint dos cinco ficheiros de código/testes desta ronda sem erros/avisos.
- `npm run build` concluído com código 0; recursos de cliente e saída Nitro
  gerados nesta ronda. Sem publicação do build.

Sem alterações de rotas, permissões, dados, backend ou regras académicas/financeiras.
Permanecem pendentes sessão autenticada, dispositivos físicos, leitores de ecrã,
teclado virtual e `tsc` global. As capturas não validam todos os módulos reais.
Sem integração em main, deploy ou migrações.
