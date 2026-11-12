# Menus em ecrãs baixos

20 de Outubro de 2026. Refinamento do menu existente do ISPAB, sem novas opções, imagens ou alteração de identidade.

## Falha reproduzida

Em 844×390 px, o primeiro menu começava a cerca de 122 px e terminava a 522 px, ultrapassando o ecrã. Em 1440×360 px terminava a 514 px. Não existia deslocação interna, pelo que as últimas opções ficavam fora da área visível.

## Correcção

A altura máxima do menu desktop passa a acompanhar o espaço entre o início do painel e o limite da área visível, com 12 px de margem inferior. Quando necessário, as opções deslocam-se dentro do menu. Em ecrãs altos, a dimensão natural mantém-se.

O cálculo ocorre ao abrir, redimensionar ou deslocar a página com um menu aberto, agrupado por frame. Não há ciclos permanentes ou pedidos de rede. O menu móvel mantém o seu funcionamento existente. Existe também um limite CSS de recurso quando o cálculo JavaScript não estiver disponível.

## Verificação local

- Os quatro menus em 844×390, 1440×360, 1024×300 e 1440×900 px: painéis dentro da área visível; última opção acessível por teclado e Escape devolve o foco ao título.
- Redimensionamento com menu aberto e deslocação da página; menu móvel com última opção focada e Escape.
- Confirmação do portal em 768×450 px, uma área de viewport reduzida usada para testar falta de espaço; não é uma medição do zoom da interface do navegador.
- Comparação geométrica antes/depois dos quatro menus em 1440×900 px: dimensões e posição idênticas.
- Inspecção visual em formato horizontal; 65 páginas em 320, 768, 1024 e 1440 px sem erros de JavaScript ou transbordamento horizontal.
- Build e verificação de páginas/recursos/calendário nos dois projectos; sete testes do cliente aprovados no painel; saída estática equivalente à prévia.

Teste local no Chromium. Sem alterações ao backend, à API ou aos dados institucionais.
