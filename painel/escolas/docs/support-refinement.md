# Ajuda e serviços locais do portal

20 de Outubro de 2026. Refinamento dos componentes existentes do ISPAB. Sem alterações de identidade visual, novas páginas, backend ou dados institucionais.

## Falhas reproduzidas e correcções

| Caso | Antes | Depois |
| --- | --- | --- |
| Pesquisa na ajuda por dados portal | Nenhuma resposta, por exigir a frase literal | Procura todas as palavras, independentemente da ordem, de maiúsculas e de acentos |
| Pesquisar portal e limpar | Passava de uma resposta aberta para três | Repõe as respostas abertas antes de iniciar a pesquisa |
| Guardar nome e movimento reduzido noutro separador | A saudação e as animações mantinham o estado anterior | Actualiza saudação, preferência de movimento e controlos do perfil |
| Apagar o último pedido local | Foco no body | Foco no tipo de pedido; nos restantes casos mantém o pedido focado ou passa ao seguinte/anterior |

As preferências são lidas novamente após gravação, alteração noutro separador ou limpeza. Ao apagar os dados locais, a saudação regressa ao perfil fictício original. A preferência do sistema por movimento reduzido continua respeitada pelo CSS. O texto do nome é inserido como texto, sem executar HTML.

Os botões de eliminação identificam o tipo e a referência local do pedido para tecnologias de apoio. A eliminação mantém a confirmação e o cancelamento. Falhas no armazenamento preservam o texto do formulário e não mostram um pedido guardado.

## Verificação local

- Ajuda: palavras em ordem diferente, acentos, ausência de resultados, texto semelhante a HTML, espaços em branco e reposição das respostas abertas.
- Preferências em dois separadores: nome, movimento reduzido, cancelamento da eliminação, limpeza e reposição da saudação e dos controlos.
- Pedidos: criação, cancelamento/eliminação, foco no próximo/último pedido e no formulário quando a lista fica vazia, erro de armazenamento, repetição e actualização noutro separador.
- Exportação dos dados locais inclui os pedidos existentes.
- 65 páginas em 320, 768, 1024 e 1440 px, sem erros de JavaScript ou transbordamento horizontal.
- Build e verificação de páginas/recursos/calendário nos dois projectos; saída estática equivalente; sete testes do cliente da API aprovados.

Tudo continua guardado apenas no navegador. Pedidos, saudações e preferências da demonstração não são enviados ao ISPAB ou a um serviço externo.
