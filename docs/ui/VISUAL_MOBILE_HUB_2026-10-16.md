# Navegação móvel e filtros — 16/10/2026

Continuação visual sobre `main` em `450e157`, já incluindo a revisão do Claude
[VISUAL_REVIEW_CLAUDE_2026-10-16.md](./VISUAL_REVIEW_CLAUDE_2026-10-16.md).
Preservam-se a guarda do primeiro desenho, os botões flutuantes acima da navegação
e a abertura apenas com logótipo animado, sem vídeo/som.

## Alterações

- `MoreHub`: nomes dos módulos em várias linhas, texto de 14 px/20 px, ícones
  consistentes, linhas de pelo menos 56 px e foco visível. Pesquisa alinhada com
  o corpo da folha; títulos de grupo de 12 px, sem maiúsculas forçadas.
- `QuickActions`: cartões em duas colunas com pelo menos 104 px e nomes completos,
  sem truncar o rótulo. Mantêm o limite de seis acções e a regra `hidden`.
- `FilterSheet`: opções, chips, limpar e aplicar com pelo menos 44 px; rótulos
  compridos podem quebrar. Mantêm callbacks, contagens e estado de selecção.

Não se alteram rotas, catálogo, regras de acesso, planos, pesquisa, saída de sessão,
dados ou submissões institucionais.

## Evidência

- 102 testes de UI/filtros/navegação aprovados (21 ficheiros), incluindo a guarda
  do primeiro desenho do Claude. TypeScript local aprovado.
- Lint dos componentes sem erros; scripts de estilo/acessibilidade aprovados.
- Chromium com componentes reais, providers fictícios e pedidos externos bloqueados:
  320×700, 390×844 (escuro), 768×1024, 1440×960 e 568×320. Catálogos de Administrador,
  Professor e Aluno exercitados em demonstração; não representam contas autenticadas.
- Sem overflow horizontal nem erros JS. Linhas de 56 px, pesquisa de 44 px,
  controlos dos filtros de pelo menos 44 px. Acção rápida e aplicação do filtro
  executadas uma única vez; remoção do chip e reset da pesquisa ao reabrir aprovados.
- Capturas revistas para cartões, hub e filtros, incluindo a orientação horizontal.

## Revisão ainda necessária

Contas reais por perfil, teclado virtual, texto ampliado, Safari e aparelho Android.
A fixture não comprova isolamento nem autorização institucional. O estado da
publicação deve ser consultado no workflow; o bloqueio anterior de autenticação
Cloudflare é independente deste incremento visual.
