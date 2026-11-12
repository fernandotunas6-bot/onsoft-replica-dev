# Pesquisa de cursos — sugestões no espaço disponível

Quando a pesquisa inicial ficava perto do limite inferior do ecrã, as sugestões
abriam abaixo da janela. Escolher a última opção com a seta deslocava a página
inteira: 295 px no ensaio local a 390 × 740 e 262 px a 1440 × 900.

A lista existente abre agora acima ou abaixo conforme o espaço disponível,
respeitando o cabeçalho fixo e a janela visual. A altura máxima mantém o limite
anterior de 360 px/60vh e pode diminuir para caber na janela. A selecção por
teclado desloca somente o interior da lista. Nas mesmas condições, o deslocamento
da página foi zero; o campo manteve o foco e a opção activa ficou visível.

A pesquisa do cabeçalho mantém a sua lista no fluxo do diálogo, sem a regra de
posicionamento flutuante da home. A composição de texto suspende sugestões e
escolhas pendentes até a escrita terminar; Escape durante composição não fecha
o diálogo. Ao sair do campo, as sugestões fecham. Os eventos de scroll/resize
partilham uma medição por frame, ignoram o scroll da própria lista e são removidos
com os restantes eventos e frames na desmontagem.

Não há novos componentes, conteúdos ou dependências. A composição, imagens,
marca e cores são preservadas. Os destinos do formulário e das sugestões não
mudam. O manifesto completo é idêntico: versão `96cb157ddf38b2059299`, 4653 campos
editáveis, sem alterações em autenticação, candidaturas, pagamentos ou APIs.

Verificação local em Chromium a 320/390/768/1440 px e desktop de 500 px de altura:
listas acima/abaixo, opção activa visível, foco, Escape, escrita em composição,
pesquisa no diálogo, selecção por Enter e submissão normal ao catálogo, sem
transbordamento horizontal ou erros de JavaScript. Testes automatizados incluem
redução simulada da janela visual, cancelamento de frames e desmontagem. Não foi
utilizado um teclado virtual de um dispositivo físico ou uma conta institucional.
