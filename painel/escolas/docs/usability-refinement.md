# Refinamento de utilização — ISPAB

Data: 20 de Outubro de 2026. Mesmo desenho, conteúdo institucional e 65 páginas; sem alterações ao backend SIGA.

## Falhas reproduzidas antes da alteração

| Caso | Resultado anterior | Correcção |
| --- | --- | --- |
| Menu móvel: focar um link e pressionar Escape | Menu fechado com foco num link escondido | Devolve o foco ao botão de navegação; menu fechado fica inerte |
| Menu desktop e portal móvel | Fecho sem restabelecer o controlo de origem | Escape devolve o foco ao summary ou ao botão do portal, conforme o contexto |
| Passagem desktop → móvel com foco no menu | Risco de foco retido na navegação escondida | Fecha o menu e ajusta foco, estado inerte e aria-expanded ao novo ecrã |
| Lista de preparação em dois separadores | Uma tarefa marcada num separador continuava como 0 de 6 no outro | Actualiza marcações e progresso no evento storage; inclui limpeza do armazenamento |
| Pesquisa com falha de rede | Ao pesquisar novamente, o erro era substituído por 0 resultados | Mantém indisponibilidade distinta de ausência de resultados e permite repetir pelo botão Pesquisar |
| Pesquisa por título conhecido | Resultados seguiam a ordem de construção das páginas | Prioriza título exacto, início do título e palavras do título, mantendo pesquisa no conteúdo e sem acentos |

## Implementação

O módulo de pesquisa é carregado apenas na página de pesquisa. Prepara o texto de comparação uma vez por carregamento, mantém a consulta no URL e impede pedidos simultâneos duplicados do índice. Erros HTTP, JSON inválido e índice vazio mostram a indicação de indisponibilidade. Dados locais e páginas do portal não entram no índice público.

Nenhuma página HTML, regra de estilo ou imagem foi alterada neste refinamento. Não foram criadas dependências, credenciais, chamadas a novas APIs ou submissões institucionais.

## Verificação

- Chromium local: teclado no menu móvel, desktop e portal; foco após Escape, mudança de largura e estado inerte.
- Dois separadores: marcação, propagação do progresso e eliminação por limpeza do armazenamento.
- Pesquisa: falha de rede e recuperação, HTTP 500, JSON sem índice válido, uma única chamada pendente após vários submits, consulta alterada durante o carregamento, relevância dos títulos, acentos, conteúdo e texto que poderia parecer HTML.
- 65 páginas em 320, 768, 1024 e 1440 px, sem transbordamento horizontal nem erros de JavaScript.
- Build e verificação estática nos dois projectos; saídas equivalentes, além do cliente de integração exclusivo do painel; sete testes do cliente da API aprovados.

Isto verifica os percursos locais descritos. Não constitui auditoria formal de acessibilidade ou medição de desempenho de utilizadores em produção.
