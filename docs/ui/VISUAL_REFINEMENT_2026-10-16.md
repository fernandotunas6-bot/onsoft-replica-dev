# SIGA Plus — refinamento visual, 16 de Outubro de 2026

Base: `main` em `aa4b749`. Incremento isolado da PR #148; sem alterações de SQL,
API, permissões, dados, submissão de formulários ou regras académicas/financeiras.

## Direcção confirmada

Web, Flutter, login, marca e abertura. Preservar a organização existente; reduzir
ruído, melhorar legibilidade e alinhar superfícies, espaçamento e controlos.
**Na abertura, apenas o logótipo animado: sem vídeo nem som.** Não introduzir uma
espera na autenticação Web. A restauração da sessão Flutter continua em paralelo.

## Alterações

| Área                       | Implementação                                                                                                                          | Validação e limite                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Web / painel escolar       | Cabeçalho opaco, títulos 20–24 px, descrições com respiro, métricas sem brilho/elevação ao passar o rato                               | Checks Web; módulos autenticados ainda sem inspecção com contas reais                        |
| Login Web                  | Painel neutro, formulário limitado a 420 px, sem zoom CSS, sem vídeo/poster, marca animada na entrada                                  | Tipos, build, testes e inspecção do login em Chromium a 320/390/768/1440 px                  |
| Carregamento de sessão Web | Marca apenas, mensagem acessível a leitores de ecrã, sem spinner visível                                                               | Caminho visual alterado, lógica de sessão preservada                                         |
| Modais e campos Web        | Véu discreto, largura com margem, limite de altura dinâmico, cantos consistentes, campos opacos                                        | Check de acessibilidade e testes UI; testar teclado virtual/zoom em aparelho                 |
| Marca                      | Palavra Plus com gradiente reservado à identidade; pesos 400/500/600, sem fonte serifada nem sublinhado dourado no wordmark horizontal | Interpretação tipográfica da referência, não reprodução vectorial exacta                     |
| Flutter / páginas          | Tema central claro/escuro, Inter local, superfícies neutras, estados legíveis, botões de 48 px, navegação e folhas alinhadas           | Análise, testes e build Web Flutter aprovados no GitHub; inspecção em aparelho pendente      |
| Flutter / login            | Formulário em superfície delimitada, hierarquia mais clara e mensagem de erro destacada                                                | Callbacks, credenciais e MFA preservados; testes Flutter aprovados no GitHub                 |
| Flutter / abertura         | Só a marca, fade/escala breve: 1,4 s na primeira abertura e 0,5 s nas seguintes; salto e movimento reduzido                            | Não há vídeo, áudio, .riv ou alegação de morph exacto; testes existentes aprovados no GitHub |

A mascote raster já existente continua disponível para os contextos que a usam;
a abertura usa a marca tipográfica. Não foi inventado um novo vector do S.

## Verificações executadas

- Web: 3.494 testes aprovados, 19 ignorados; 514 ficheiros (511 aprovados, 3 ignorados).
- Após o ajuste final do carregamento: 92 testes UI/navegação aprovados.
- TypeScript: aprovado com heap de 8 GB.
- Build Web: aprovado.
- ESLint: 0 erros, 47 avisos existentes; checks de estilo e acessibilidade aprovados.
- Login inspeccionado em Chromium nos tamanhos 320×700, 390×844, 768×1024 e
  1440×960, também com tema escuro e movimento reduzido: sem vídeo, sem overflow
  horizontal, sem corte no painel editorial e sem erros JavaScript. Foram usados
  contextos novos, sem conta e com pedidos externos bloqueados.
- A grelha editorial substitui a altura fixa do carrossel, evitando cortar o título
  quando ocupa mais linhas. Os campos de login mantêm 44 px também no desktop.
- Dart: ficheiros editados formatados pelo formatter local do SDK 3.35.7. O aviso de
  resolução de `flutter_lints` indica que as dependências Flutter não foram resolvidas;
  formatar não comprova compilação.

## Bloqueios e próximos passos

A inicialização local do Flutter foi bloqueada pela revisão automática devido a uma
consulta a metadados da instância; não se contornou essa chamada. O workflow já existente
no repositório validou entretanto o commit `5bbb735`: `flutter pub get`, formatação,
`flutter analyze`, testes e build Web release aprovados no
[run 38900488665](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/38900488665).
O incremento seguinte altera apenas componentes Web e mantém esses ficheiros Flutter.

Antes de considerar todas as superfícies validadas: conferir páginas autenticadas
Web e Flutter em 320, 390, 768 e 1440 px,
temas claro/escuro, movimento reduzido, texto ampliado, nomes compridos, teclado aberto,
rolagem de formulários/modais, foco e retorno nativo. Usar dados controlados; não
transformar imagens de referência em dados institucionais. Não publicar por este incremento.

## Fonte Inter

`assets/fonts/Inter-Latin.ttf` é a conversão de formato do Inter Latin WOFF2 já presente
em `public/fonts/inter/`, sem redesenhar glifos. Inclui os acentos portugueses. Caracteres
fora do subconjunto usam o fallback da plataforma. Licença SIL OFL 1.1 junto ao ficheiro;
fonte da licença: https://github.com/rsms/inter/blob/master/LICENSE.txt.

## Continuação — listas e navegação móvel

- Cabeçalho móvel opaco de 64 px; barra inferior flutuante de 64 px com margens de 8 px.
  A reserva `--siga-bottom-nav-h` acompanha a altura total (80 px + área segura), para
  não cobrir as últimas linhas ou botões.
- Nomes/contextos das entidades podem ocupar duas linhas; estado e metadados partilham
  a linha seguinte. Alvos de toque, foco, selecção e callbacks são preservados.
- Pesquisa com 44 px reais, texto de 16 px e área de limpeza de 44 px; mantém debounce.
- Folhas inferiores com título em várias linhas e largura limitada em ecrãs grandes;
  tabelas, métricas e estados vazios com hierarquia tipográfica mais legível.
- Revisão em Chromium a 320 e 390 px, claro/escuro, usando componentes reais com
  providers/avatares de demonstração: sem overflow, pesquisa de 44 px, navegação total
  de 80 px, última linha visível ao chegar ao fim, folha a abrir/fechar sem erros JS.
  Não representa um ensaio autenticado de dados ou de isolamento.
- 92 testes UI/navegação aprovados após este incremento; checks de estilo e
  acessibilidade aprovados. TypeScript e build aprovados na branch.

## Continuação — filtros, paginação e acções

- Filtros com campos de 44 px, labels de 12 px e texto de entrada de 16 px no
  telemóvel. Os campos ocupam uma linha cada em ecrãs estreitos; os chips quebram
  nomes compridos sem alargar a página. Pesquisa mantém o debounce de 220 ms.
- Paginação com botões e selector de 44 px, números tabulares e distribuição
  adaptável. Separadores com alvo de 44 px e foco visível.
- Folhas de acções mostram nomes e descrições em várias linhas, com linhas de
  pelo menos 52 px. Mantêm separação destrutiva, regras de visibilidade e callbacks.
- Chromium com dados fictícios em 320, 390 (escuro), 768 e 1440 px: todos os
  controlos medidos com 44 px; sem overflow horizontal nem erros JavaScript;
  mudar página e separador, escrever na pesquisa e abrir a folha funcionaram.
  Revisão de capturas para filtros e acções; não equivale a uma sessão institucional.
- 99 testes de UI/filtros/navegação aprovados; scripts de estilo/acessibilidade e
  lint dos componentes editados, TypeScript e build aprovados. A abertura continua apenas com o
  logótipo animado, sem vídeo.
- CI e Flutter do incremento anterior (`86daf1f`) concluídos com sucesso:
  [CI 38901652089](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/38901652089)
  e [Flutter 38901652086](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/38901652086).

## Continuação — contexto escolar e confirmações

- Selector escolar com nomes e funções completos em várias linhas, estado na zona
  de texto e escola activa assinalada também por `aria-pressed`. Linhas com pelo
  menos 64 px; ano e período admitem textos compridos e mantêm alvos de 44 px.
- Confirmação destrutiva com assunto destacado, título de 18 px e espaçamento
  entre linhas em px. Botões podem crescer para acomodar os rótulos completos;
  callbacks e fecho conservam o comportamento existente.
- Base partilhada `AlertDialog`: margem de 16 px, cantos arredondados em todas as
  larguras, fundo opaco e véu mais leve. Altura limitada à janela dinâmica com
  rolagem interna para manter o conteúdo acessível em janelas baixas.
- Chromium com componentes reais e providers de demonstração: 320×700,
  390×844 (escuro), 768×1024, 1440×960 e 568×320. Sem overflow lateral ou erros JS;
  confirmação dentro da janela, botões de pelo menos 44 px, foco inicial em
  Cancelar, cancelar sem confirmar e confirmar uma única vez. Troca de período
  verificada apenas no provider fictício; não valida contexto ou permissões reais.
- 99 testes existentes de UI/filtros/navegação aprovados; lint dos componentes e
  scripts de estilo/acessibilidade e TypeScript aprovados. Abertura mantém apenas a marca animada.

- CI e Flutter do incremento de filtros (`d29a31b`) concluídos com sucesso nos
  runs 38902673975 e 38902674002, respectivamente.

## Entrega no main para revisão pelo Claude — 16/10/2026

Por pedido do utilizador, a PR #164 foi integrada em `main` no commit
`ee8b732b9d4627e56ff336a3bce7a00f1c434082`. As indicações anteriores de não integrar
ou publicar descrevem o estado antes desta autorização.

O commit final da PR (`3471217`) passou os workflows completos
[CI Web](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/38903471251)
e [Flutter](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/38903471194).
A integração accionou o workflow já existente de
[publicação](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/38904027322);
o sucesso desse workflow deve ser consultado separadamente das validações da PR.

Pontos para a revisão seguinte:

1. Preservar a abertura apenas com o logótipo animado, sem vídeo ou som.
2. Conferir páginas autenticadas por perfil, sobretudo formulários longos, modais,
   selector de escola e reserva inferior da navegação com teclado virtual aberto.
3. Verificar texto ampliado, foco e retorno, movimento reduzido, Safari e aparelho
   Android real; as capturas de Chromium com dados fictícios não cobrem esses casos.
4. Manter o âmbito visual. Alterações de autenticação, permissões, dados e
   renumeração de alunos pertencem a revisões próprias; esta entrega não aplica SQL.
5. A marca actual é tipográfica. Uma futura reprodução vectorial exacta deve usar
   um asset aprovado; não substituir a marca por uma animação de vídeo na abertura.

### Resultado da tentativa de publicação

O [run 38904027322](https://github.com/fernandotunas6-bot/onsoft-replica-dev/actions/runs/38904027322)
passou tipos, lint e testes, mas falhou na primeira publicação do ecossistema,
`DOC → siga-docs`, com `Authentication error [10000]` e `Invalid access token [9109]`
da Cloudflare. O script parou antes das etapas WEB, ADMIN, PAYFLOW/D1 e SIGA;
esta execução não publicou o novo visual do SIGA. DNS e health checks finais foram ignorados.

Acção de configuração pendente: substituir `CLOUDFLARE_API_TOKEN` em
GitHub → Settings → Environments → production por um token válido para a conta e
recursos usados pelo workflow; depois repetir a execução falhada. Não guardar o token
no código ou na documentação. Este bloqueio não exige alterar os componentes visuais.

## Continuação — formulários por etapas

- Cabeçalhos dos modais com título de 18 px e descrição de 13 px em várias linhas;
  botão de fechar de 44 px no topo. Rodapés opacos com botões de pelo menos 44 px
  e texto que pode quebrar, mantendo os callbacks existentes.
- Assistente usado nas matrículas e turmas: etapas com tipografia explícita,
  alvos de 44 px também no desktop e indicação de conclusão nos tokens da marca.
  Sem alterações à validação, à ordem das etapas ou à submissão.
- Células dos formulários com labels de 12 px e mais espaçamento; áreas de texto
  opacas com mínimo de 96 px. Ajuda e mensagens dos formulários React Hook Form
  com 12 px e entrelinha de 20 px, mantendo associações e erros existentes.
- ModalShell com margem de 16 px e cantos de 20 px; véus sem desfoque, incluindo
  a confirmação de alterações não guardadas.
- Chromium com formulário e callbacks fictícios a 320×700, 390×844 (escuro),
  768×1024, 1440×960 e 568×320: sem overflow horizontal, título completo,
  textarea de 96 px, fechar e concluir com 44 px; avançar, voltar e concluir
  uma vez aprovados. Não testa submissão de matrícula real nem teclado nativo.
- 99 testes existentes de UI/filtros/navegação aprovados. Lint dos ficheiros
  editados sem erros, com um aviso de Fast Refresh já existente em `form.tsx`;
  scripts de estilo/acessibilidade aprovados. Build local aprovado.
