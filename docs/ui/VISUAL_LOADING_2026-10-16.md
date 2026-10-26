# Carregamento e ligação — 16/10/2026

Continuação visual sobre `main` em `43a7f7e`, incorporando as revisões anteriores
Web e do Claude. Não altera sessão, rede, fila offline ou submissões.

## Alterações

- Na verificação da sessão Web, apenas a marca: pulsação discreta de opacidade/escala
  com atraso CSS de 2 s. Não introduz espera nem temporizador na autenticação.
  Movimento reduzido deixa a marca estática. Sem vídeo ou som.
- A marca decorativa fica oculta à árvore acessível do estado de carregamento;
  a mensagem de sessão permanece para leitores de ecrã. O carregamento comum
  também passa a usar `role=status`, mensagem de 13 px e spinner decorativo.
- Skeletons respeitam movimento reduzido. Linhas de entidades com mínimo de 64 px,
  campos de 44 px e dimensões de texto/imagens em px; barras não excedem o espaço
  disponível. Não se alega ausência de deslocamento em todas as páginas reais.
- Aviso de ligação com 12 px/20 px, mínimo de 44 px e ícone de 18 px; texto comprido
  pode quebrar. A animação de envio pára com movimento reduzido.

## Evidência

- 102 testes existentes de UI/filtros/navegação aprovados, incluindo perda de
  ligação, envio e confirmação de alterações e a guarda do primeiro desenho.
- TypeScript e build local aprovados; lint dos componentes e scripts de
  estilo/acessibilidade aprovados.
- Chromium: 320×700, 390×844 escuro, 768×1024, 1440×960 e 568×320 com movimento
  reduzido; 390×844 adicional com movimento normal. Sem overflow ou erros JS;
  nenhum vídeo, skeletons e marca sem animação com movimento reduzido; marca com
  `siga-brand-breathe` e atraso de 2 s no modo normal; campos skeleton de 44 px.
- Simulação em memória com QueryClient, sem API institucional: sem ligação com
  uma alteração pendente, envio ao restaurar e confirmação de envio aprovados.
  Capturas de claro/escuro revistas. Aviso com 44–58 px e sem corte lateral.

## Limites

Não valida autenticação real, persistência offline, leitores de ecrã em aparelho,
Safari ou teclado virtual. Os pontos Flutter da revisão do Claude permanecem
separados: pesos da fonte, semântica de `/loading` e ensaio em dispositivo.
A marca pode ainda aparecer na verificação de sessão e novamente no login; esta
continuação não altera o fluxo ou a montagem desses ecrãs.
