# Navegação e destaques académicos

Referência observada em Chromium em 21/10/2026: [UNASP](https://unasp.br/),
[curso](https://unasp.br/cursos/sao-paulo/graduacao/engenharia-de-computacao/) e
[biblioteca](https://unasp.br/biblioteca/), em computador e telemóvel.

## Comportamento observado

O UNASP mantém o cabeçalho fixo, com duas faixas no computador. Na home a marca
completa ocupa cerca de 165 px; nas páginas internas aparece o símbolo de 38 px.
A altura observada é 124 px na home e 100 px nas internas, sem redução adicional
nesses percursos de scroll. Na home o fundo do cabeçalho passa a opaco ao descer.
Os submenus abrem por hover com fotografia e links agrupados. No telemóvel há
menu próprio com grupos expansíveis. A home usa quatro campanhas em slider,
com setas; cursos e conteúdos têm navegação secundária, galerias e destaques.
Os scripts/HTML públicos foram consultados para confirmar essas diferenças,
sem enviar formulários externos ou importar campanhas/dados institucionais.

## Adaptação ISPAB

- Mantém-se a composição, paleta azul/roxo, fontes, fotografias existentes, marca
  ISPAB, ícone académico e todos os caminhos. Não se substituem os serviços por
  ofertas UNASP. O rodapé conserva sempre a marca completa.
- O cabeçalho permanece sticky e reduz suavemente de cerca de 87 para 67 px no
  computador e de 71 para 63 px no telemóvel. Reduz acima de 108 px e expande
  abaixo de 36 px, evitando oscilações. Na home conserva a marca completa reduzida;
  nas internas, depois de descer, usa o ícone compacto. No telemóvel conserva o
  nome completo. Logótipos de outras escolas/carregados não são ocultados.
- Os disclosures existentes abrem por rato com pequenos atrasos, continuam por
  clique/toque e aceitam setas cima/baixo para entrar nos links. Escape e clique
  exterior mantêm o comportamento existente. O grupo e ligação actual são assinalados.
- O menu móvel bloqueia o fundo, contém o foco, admite scroll próprio e considera
  o espaço realmente visível, incluindo a faixa superior. Fechar ou desmontar
  repõe os estados anteriores de scroll/inert e limpa observadores/eventos.
- A pesquisa do cabeçalho abre o diálogo existente. Reutiliza sugestões de cursos
  publicados, com IDs distintos da pesquisa inicial, e o formulário de pesquisa
  completo. Escape fecha sugestões, depois o diálogo, devolvendo o foco. Ctrl/Cmd+K
  abre fora de campos de escrita. A ligação normal continua utilizável sem JS,
  com modificadores ou num novo separador.
- A fotografia original da home é o primeiro de três destaques, conservando a
  composição original. Os outros dois promovem ingresso e vida académica, com
  campos editáveis. Há setas, escolha directa, pausa/reprodução e swipe horizontal.
  Rotação a cada sete segundos apenas com o destaque visível: pára por hover,
  foco ou escolha manual, em segundo plano e por movimento reduzido. Os controlos
  manuais mantêm-se. O foco não é deslocado automaticamente.
- No telemóvel, os cartões existentes de cursos e blog admitem deslize horizontal
  com scroll snap e setas. No computador conservam a grelha. A pesquisa, atalhos,
  conteúdos, candidatura e portais continuam disponíveis.

## Conteúdo e limites

Os 4645 campos de `b7bb3fc0893638fd4fd6` foram comparados exactamente com os novos:
nenhum registo foi alterado ou removido. O modelo `96cb157ddf38b2059299` tem 4653
campos, acrescentando oito em duas regiões `data-site-scope`. A compatibilidade
explícita aceita as três versões anteriores, sem alterar o estado armazenado,
revisão ou publicação. Não há alterações de APIs, autenticação ou base de dados.
Sem o módulo de slides permanece a primeira imagem e os percursos originais.

Testes do website, montagem/desmontagem, temporizadores, navegação pendente da API,
pesquisa e compatibilidade. Inspecção visual/funcional em Chromium, larguras
320/390/768/1440 px, movimento reduzido e sem JavaScript. Não é uma auditoria
em dispositivos físicos nem um ensaio de autenticação/pagamentos reais.
