# Favoritos e comparação — continuidade da navegação

20 de Outubro de 2026. Refinamento dos componentes existentes do ISPAB, sem novas páginas ou alterações de conteúdo institucional.

## Falhas reproduzidas

- Retirar um curso dos favoritos ou da comparação deixava o foco no body.
- A lista de cursos para adicionar à comparação incluía cursos que já estavam seleccionados.
- A tabela de comparação não tinha uma região explicitamente acessível por Tab para deslocação horizontal, nem cabeçalhos semânticos para os cursos.
- O evento storage reconstruía todas as listas locais, mesmo quando o tipo de dado alterado não lhes dizia respeito.

## Correcções

Os favoritos mantêm o foco no controlo correspondente; ao retirar o curso focado, passa para o seguinte, para o anterior no fim da lista, ou para o link do estado vazio. A comparação aplica o mesmo princípio às colunas e mantém a deslocação horizontal, limitada à largura restante.

A tabela pode receber foco por Tab e deslocar-se com as setas do teclado. O nome acessível identifica a comparação e a orientação horizontal. Cada curso passa a cabeçalho de coluna, mantendo o desenho, as cores, as dimensões e os conteúdos anteriores. Os cursos já comparados ficam indisponíveis no selector de adição; ao retirá-los voltam a estar disponíveis. O limite de três mantém-se.

Alterações noutro separador actualizam apenas as listas relacionadas com a chave modificada. A limpeza total do armazenamento continua a actualizar todas. A sincronização preserva o foco quando reconstrói a lista relevante.

## Verificação

- Favoritos: remoção no meio, no fim e do último curso; foco no controlo seguinte ou no estado vazio.
- Comparação: setas na região horizontal, deslocação preservada, foco após remoção, estado vazio, opções indisponíveis/reactivadas e limite de três.
- Dois separadores: alterações de favoritos, limpeza total e ausência de reconstrução da lista em alterações de pedidos sem relação com ela.
- Comparação geométrica antes/depois da tabela e das suas linhas, com três cursos, em 390 e 1440 px; dimensões preservadas.
- 65 páginas em 320, 768, 1024 e 1440 px, sem erros de JavaScript ou transbordamento horizontal do documento.
- Build e verificação de páginas/recursos nos dois projectos, saídas estáticas equivalentes e sete testes do cliente da API aprovados.

Verificação local no Chromium. Não substitui auditoria formal de acessibilidade ou teste de leitores de ecrã. Não há novos dados, serviços ou operações institucionais.
