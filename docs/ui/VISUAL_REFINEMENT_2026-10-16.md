# SIGA Plus — refinamento visual, 16 de Outubro de 2026

Base: `main` em `aa4b749`. Incremento isolado da PR #148; sem alterações de SQL,
API, permissões, dados, submissão de formulários ou regras académicas/financeiras.

## Direcção confirmada

Web, Flutter, login, marca e abertura. Preservar a organização existente; reduzir
ruído, melhorar legibilidade e alinhar superfícies, espaçamento e controlos.
**Na abertura, apenas o logótipo animado: sem vídeo nem som.** Não introduzir uma
espera na autenticação Web. A restauração da sessão Flutter continua em paralelo.

## Alterações

| Área                       | Implementação                                                                                                                          | Validação e limite                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Web / painel escolar       | Cabeçalho opaco, títulos 20–24 px, descrições com respiro, métricas sem brilho/elevação ao passar o rato                               | Checks Web; módulos autenticados ainda sem inspecção com contas reais                 |
| Login Web                  | Painel neutro, formulário limitado a 420 px, sem zoom CSS, sem vídeo/poster, marca animada na entrada                                  | Tipos, build, testes e inspecção do login em Chromium a 320/390/768/1440 px           |
| Carregamento de sessão Web | Marca apenas, mensagem acessível a leitores de ecrã, sem spinner visível                                                               | Caminho visual alterado, lógica de sessão preservada                                  |
| Modais e campos Web        | Véu discreto, largura com margem, limite de altura dinâmico, cantos consistentes, campos opacos                                        | Check de acessibilidade e testes UI; testar teclado virtual/zoom em aparelho          |
| Marca                      | Palavra Plus com gradiente reservado à identidade; pesos 400/500/600, sem fonte serifada nem sublinhado dourado no wordmark horizontal | Interpretação tipográfica da referência, não reprodução vectorial exacta              |
| Flutter / páginas          | Tema central claro/escuro, Inter local, superfícies neutras, estados legíveis, botões de 48 px, navegação e folhas alinhadas           | Formatação Dart aprovada; análise, testes e renderização Flutter pendentes            |
| Flutter / login            | Formulário em superfície delimitada, hierarquia mais clara e mensagem de erro destacada                                                | Callbacks, credenciais e MFA preservados; ainda sem teste executado no SDK            |
| Flutter / abertura         | Só a marca, fade/escala breve: 1,4 s na primeira abertura e 0,5 s nas seguintes; salto e movimento reduzido                            | Não há vídeo, áudio, .riv ou alegação de morph exacto; testes existentes por executar |

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

A revisão automática bloqueou a inicialização do Flutter porque a ferramenta tentou
consultar o endpoint de metadados da instância, com risco de exposição de credenciais.
Não repetir nem contornar essa chamada. Executar `flutter analyze`, testes e build
num ambiente autorizado antes de integrar; verificar os testes existentes de salto
único e movimento reduzido.

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
