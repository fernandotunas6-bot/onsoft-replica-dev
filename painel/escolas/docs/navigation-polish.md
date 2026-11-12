# Refinamento da navegação existente

A apresentação aprovada, marca, cores, dimensões e conteúdos permanecem.
Foram reproduzidos e corrigidos estes comportamentos:

- Um hover pendente podia reabrir o menu depois de Escape ou clique exterior.
  Acções explícitas cancelam agora os temporizadores pendentes.
- A saída do ponteiro de toque podia fechar um menu num equipamento híbrido.
  A abertura/saída por hover respeita o tipo de ponteiro. O hover noutro grupo
  também não esconde um link que tenha foco de teclado. Ao sair desse grupo,
  o painel fecha sem deslocar o foco.
- Uma ligação editada para uma secção da mesma página podia deixar o menu móvel
  aberto e o fundo bloqueado. A selecção normal fecha e desbloqueia o menu antes
  da navegação nativa; cliques com modificadores, novos separadores e acções
  canceladas conservam o comportamento habitual.
- Ctrl/Cmd+K podia interromper campos `contenteditable` vazios ou `plaintext-only`.
  O atalho respeita escrita, composição e eventos já tratados, incluindo destinos
  sem método `closest`.
- Uma ligação como `/ingresso/#academic-section-2` não chegava à secção se a
  sincronização terminasse depois do carregamento. Os destinos e classes de
  margem de scroll passam a existir no HTML inicial de ingresso, instituição e
  novos estudantes. Mantêm os IDs usados pela navegação existente, evitam colisões
  e sobrevivem à desmontagem do realce. Funcionam também sem JavaScript.
- Um segundo ponteiro já não termina o gesto de swipe iniciado por outro dedo.
  Um gesto cancelado também não muda o slide.

Antes da correcção, a ligação directa testada com API atrasada ficava no topo da
página (`scrollY: 0`), com o destino a cerca de 1339 px. Depois, o destino fica
visível, abaixo do cabeçalho. É um ensaio local com atraso simulado; não representa
uma medição de desempenho da rede ou de dispositivos físicos.

O manifesto mantém exactamente a versão `96cb157ddf38b2059299` e todos os 4653
registos, sem migração, alteração de publicações ou novos campos. Não há alterações
no acesso aos portais, autenticação, APIs, pagamentos ou dados institucionais.
CSS e imagens não mudam. Nenhuma dependência nova foi acrescentada.

Validação: testes de navegação/temporizadores, foco, toque híbrido, escrita,
gestos, montagem/desmontagem e destinos no HTML. Chromium em 320/390/768/1440 px,
com ligações directas, API atrasada, histórico Voltar/Avançar, menu móvel e versão
sem JavaScript. Comparação exacta do manifesto antes/depois e checks das 66 páginas.
