# Logótipo e cabeçalho durante a navegação

Referência consultada: [UNASP](https://unasp.br/), curso de Engenharia de Computação
e Biblioteca, em desktop e largura móvel. No desktop, a home apresenta a marca
completa e as páginas internas usam o símbolo compacto desde a entrada. As duas
linhas de navegação permanecem no topo. O ISPAB adapta esses comportamentos à
composição branca e à identidade azul/roxa já aprovadas.

- Home: marca completa e cabeçalho amplo no topo; redução discreta ao deslocar.
- Páginas internas, desktop: cabeçalho e símbolo compactos desde o HTML inicial.
- Telemóvel: marca completa, botão do menu e redução existentes mantêm-se.
- As duas linhas actuais ficam juntas no topo, conservando o seu espaço na página.
  Menus, separadores fixos e destinos consideram a altura conjunta. O painel
  aberto continua limitado à janela quando o cabeçalho volta a expandir. O logo tem
  uma área de interacção de pelo menos 44 × 44 px; o nome acessível e o destino
  publicado mantêm-se, mesmo quando apenas o símbolo é visível.
- O regresso pelo histórico actualiza a redução. Ao desmontar, o contexto inicial
  e os estilos anteriores são repostos. Movimento reduzido continua respeitado.
- A marca da escola começa a carregar assim que a sua identidade é conhecida,
  antes do blog e dos restantes auxiliares. Logótipos próprios continuam a ter
  prioridade; a imagem ISPAB não substitui marcas de outras instituições.

Não foram copiadas marcas ou imagens do UNASP. Não há novos menus, links, campos
ou dependências, nem alterações nos portais, autenticação, pagamentos ou APIs.
O manifesto completo conserva exactamente os 4653 registos e a versão
`96cb157ddf38b2059299`; os conteúdos e ligações continuam editáveis.

Verificação: Chromium a 320/390/768/1440 px, home, curso e biblioteca; topo,
scroll, regresso, menus, marca completa/compacta e rodapé preservado; desktop
de 500 px de altura, clique no logo, Voltar e mudança entre larguras. Verificações
sem JavaScript em 390/1440 px e com resposta do blog pendente. Testes do contexto
no HTML, altura conjunta, pageshow e limpeza; suite do website, typecheck,
compilação e checks de 66 páginas/4515 ligações e calendário. Ensaio local,
sem contas institucionais ou teste em dispositivos físicos.
