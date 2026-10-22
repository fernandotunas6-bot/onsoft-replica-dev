# Pequenos refinamentos visuais do SIGA

12 de Outubro de 2026. Âmbito: componentes partilhados da aplicação escolar na raiz; cada aplicação do ecossistema conserva o seu design.

## Critérios implementados

| Contexto           | Comportamento visual                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campos e seletores | Foco com borda do tema; `aria-invalid="true"` destaca a borda e o anel de foco de erro. O estado desativado tem fundo suave. Nenhum estado altera dimensões.                                                      |
| Tabelas            | Hover e foco dentro da linha têm fundo neutro. Uma linha selecionada tem tinta primária suave e conserva a distinção durante hover e foco. A seleção continua a exigir controlo/semântica no contexto consumidor. |
| Separadores        | Texto, fundo e sombra transitam em 120 ms; dimensões e posição ficam estáveis. A navegação por teclado e o estado selecionado são mantidos pelo Radix.                                                            |
| Avisos             | Sucesso, atenção, informação e erro usam tokens do tema, fundo ténue, ícone de 16 px e texto com entrelinha confortável. A escolha do estado é explícita pelo consumidor.                                         |
| Indicadores        | Os tons semânticos dos ícones usam as mesmas cores do sistema nos dois temas. Apenas cartões com destino mantêm indicação de interação.                                                                           |
| Estados vazios     | Ícone estático na cor da área, sem flutuação, vidro ou sombra volumosa. O título, a explicação e a próxima ação continuam visíveis.                                                                               |
| Feedback de ações  | Resultados têm uma entrada curta; só o processo ativo repete a rotação. Estados guardados em listas ficam estáticos.                                                                                              |

## Aceitação

- Tema claro e escuro; desktop e largura mobile de 390 px.
- Foco por teclado, campo inválido, campo desativado, seleção e hover verificáveis.
- Nenhum conteúdo ultrapassa a largura mobile; tabelas mantêm scroll dentro do seu contentor.
- Movimento reduzido remove as novas animações/transições sem esconder informação.
- Mensagens, ações, permissões e dados mantêm o comportamento do contexto consumidor.

A validação de componentes não certifica operações reais de escolas nem persistência na base de dados.
