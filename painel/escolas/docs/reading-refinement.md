# Leitura e estados visuais — refinamento

20 de Outubro de 2026. Paleta, imagens, tipografia e composição aprovadas preservadas.

O foco por teclado passa a usar um azul mais definido da paleta. Nos controlos sobre imagens e fundos coloridos, um halo branco separa o contorno do fundo. Os campos de formulário passam a mostrar um contorno explícito por teclado, corrigindo uma regra anterior que removia o outline.

Os pequenos textos da faixa superior e da lateral do destaque inicial usam um tom ligeiramente mais escuro. Nos pares de cores sólidos verificados, o contorno sobre branco passa de 2,33:1 para 6,02:1; o texto da faixa superior passa de 4,32:1 para 4,96:1. Estes valores descrevem apenas esses pares, não uma auditoria de todo o site.

O cartão do curso com foco ganha uma indicação discreta na borda e sombra. Os resultados da pesquisa têm um fundo subtil quando focados. Botões premidos recebem uma pequena alteração de luminosidade, sem novas deslocações. A selecção de texto usa as cores da marca. O modo de cores forçadas mantém as cores de destaque do sistema, e a preferência de movimento reduzido continua respeitada.

## Verificação local

- Comparação geométrica antes/depois em início, catálogo, candidatura e portal, a 390 e 1440 px: blocos medidos sem alterações de posição ou dimensão.
- Chromium: contorno em botões e campos, indicação do cartão focado, luminosidade ao premir/soltar botões e contorno no modo de cores forçadas.
- Inspecção visual do foco no catálogo móvel e das páginas iniciais.
- 65 páginas em 320, 768, 1024 e 1440 px, sem erros de JavaScript ou transbordamento horizontal.
- Build e verificação de páginas/recursos/calendário nos dois projectos; sete testes do cliente no painel aprovados; saídas estáticas equivalentes.

Não foram alterados dados, requisitos de cursos, candidaturas ou serviços oficiais. Esta verificação não substitui uma auditoria formal de acessibilidade.
