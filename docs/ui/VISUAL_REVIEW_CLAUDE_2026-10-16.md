# Revisão do refinamento visual (PR #164) — Claude, 16/10/2026

Revisão pedida no handoff de [VISUAL_REFINEMENT_2026-10-16.md](./VISUAL_REFINEMENT_2026-10-16.md).
Ficheiro separado para não colidir com as continuações acrescentadas a esse documento.

Corrigido nesta revisão (só Web):

- **Botões flutuantes por cima da barra inferior.** A barra passou a 80 px + área segura,
  mas `RightRail` e `ContextualActionsPanelHost` continuavam em `bottom-20` (60 px com a
  raiz a 12 px no telemóvel) e tapavam os ícones da navegação. Agora usam o utilitário
  `bottom-above-nav`, que acompanha `--siga-bottom-nav-h` como o `pb-bottom-nav`.
- **Restos do login com vídeo:** removidos `AuthBackgroundVideo.tsx` (sem uso) e
  `public/auth-classroom.mp4` (1,7 MB publicado sem uso). O `.asset.json` do Lovable fica.
- **CSS morto:** `.page-header-glow`, `.empty-chip` e `@keyframes header-glow` já não eram
  usados depois do #164.

Por decidir ou verificar (não alterado):

1. **Flutter — pesos do Inter.** `assets/fonts/Inter-Latin.ttf` é variável (eixo `wght`
   100–900, omissão 400) e está registado sem pesos. O tema pede `w500`/`w600`; se o motor
   não aplicar o eixo, o texto sai em 400 ou em negrito sintético. Verificar em aparelho;
   se for o caso, usar `fontVariations: [FontVariation.weight(600)]` nos estilos ou gerar
   instâncias estáticas 500/600.
2. **Carregamento só com a marca.** Sem indicador de progresso, uma verificação de sessão
   lenta parece um ecrã parado (Web `PageLoading brandOnly` e Flutter `/loading`). Está de
   acordo com a direcção «só o logótipo»; considerar uma pulsação lenta após ~2 s.
3. **A entrada da marca repete-se.** Num utilizador sem sessão, a marca entra no ecrã de
   verificação e volta a entrar no login (`AuthBrandIntro`), noutra posição.
4. **Flutter `/loading`:** `Semantics` de «A carregar a sua sessão» envolve a `Brand`, que já
   tem rótulo próprio; os leitores de ecrã juntam os dois.

## PR #166 e #167 (formulários por etapas, selectores e menus)

Corrigido (regressões funcionais do #167):

- **Selects compactos forçados a 44 px no desktop.** `SelectTrigger` tinha `h-[44px] min-h-[44px]`
  sem a excepção `lg:min-h-0`; quem pede `h-7`/`h-8` (tabelas da importação, Turnstile,
  heatmap) ficava com 44 px. Sai o `min-h`: a omissão continua 44 px e o `h-*` de quem chama
  volta a valer.
- **Lista do select mais estreita que 160 px.** Em `popper`, `min-w-[trigger]` substituía o
  `min-w-[160px]` (tailwind-merge fica com o último). Agora
  `min-w-[max(var(--radix-select-trigger-width),160px)]`.
- **Submenu por cima do menu em tablets.** O deslocamento do submenu para dentro do ecrã
  aplicava-se abaixo de `lg` (1024 px); em tablets e janelas estreitas tapava o próprio item e
  os de baixo. Passa a só abaixo de `sm` (telemóvel), onde não há espaço ao lado.
- **Ícones forçados a 18 px** nos itens e sub-itens, mesmo quando quem chama pede `size-3.5`
  (ex.: exportação SAFT em `faturas.tsx`). Agora só os ícones sem `size-*`.
- **`inset` desalinhado** (32 px) dos itens com visto/rádio (36 px): `inset` passa a 36 px.

Por decidir (escolhas de design, não alteradas):

1. **`Textarea` com mínimo de 96 px** (#166) sobrepõe `rows={2}` (pedido de alteração de nota,
   acompanhamento de risco): os formulários compactos crescem ~1/3. Se for para manter, rever
   esses usos; senão, baixar o mínimo e deixar `rows` decidir.
2. **`Textarea` com fundo `bg-card`** em todos os 19 usos, também fora dos modais (superfícies
   tingidas passam a mostrar um bloco opaco).
3. **Cabeçalho dos modais** com `items-start`: um título de uma linha fica desalinhado do ícone e
   do botão de fechar de 44 px. Os botões de 44 px também no desktop tornam mais alto o
   cabeçalho de modais densos (PrintTemplateStudio, ficha do aluno).
4. **`DropdownMenuLabel`** passou de 14 px semibold a 12 px cinzento para todos os menus; títulos
   de menu (ex.: nome da conta) ficam menos visíveis.
5. **Repetição de classes**: o conjunto de 44 px dos botões dos modais e a animação dos menus
   estão copiados em 3 sítios cada; um tamanho de `Button` e uma constante partilhada evitam
   que divirjam.

## PR #168 (MoreHub, acções rápidas, filtros)

Sem erros de lógica: só estilo em `FilterSheet`, `MoreHub` e `QuickActions`; callbacks,
rotas e regras de acesso intactos. Nada alterado nesta revisão. Por decidir:

1. **Chips de filtro aplicado perderam a cor de «activo»** (de `primary-soft` para
   `secondary` neutro), ao contrário do botão de filtros e das opções, que continuam a
   primária. Um filtro aplicado passa a parecer um controlo qualquer.
2. **Acções rápidas com 104 px de altura mínima** em duas colunas: com 6 acções o bloco passa
   de ~170 px a mais de 340 px no painel do Administrador e empurra métricas e alertas para
   fora do primeiro ecrã a 320×700.
3. **Títulos de secção desalinhados**: o MoreHub passou a 12 px sem maiúsculas, mas
   «Acções rápidas» no painel (`AdminPortalDashboard`) continua 11 px em maiúsculas.
4. **Limpeza**: `min-h-[56px]` fixo em vez dos tokens `--siga-control-*`; a mesma linha do
   MoreHub copiada 4 vezes (um `HubRow` evitava); valores arbitrários iguais à escala
   (`size-[36px]` = `size-9`, `leading-[20px]` = `leading-5`); `flex-wrap` sem efeito no
   rodapé (filhos `flex-1 min-w-0` nunca quebram) e `whitespace-normal` sem efeito em
   `FilterOption`.

## PR #170 (carregamento e avisos de ligação)

Responde em parte ao ponto 2 do #164 (carregamento sem sinal de progresso). Nada alterado
nesta revisão. Por decidir:

1. **Aviso offline mais alto e no fluxo da página.** `OfflineBanner` passou de ~28 px a
   44–58 px e continua antes do contentor `min-h-screen` do `AppShell`, cuja barra lateral é
   `sticky h-screen`. Sem rede, a página fica mais alta que o ecrã (aparece scroll e o fundo da
   barra lateral sai do ecrã); no telemóvel o aviso não é fixo e desaparece ao rolar, logo
   enquanto se preenchem formulários. Já acontecia com 28 px; agora nota-se mais. Sugestão:
   torná-lo fixo por cima do cabeçalho (com reserva) ou tirá-lo do fluxo; os 44 px de altura
   mínima não servem de alvo de toque (não é interactivo).
2. **`role="status"` montado já com o texto.** Em `PageLoading` (pendente de rotas e
   «A confirmar acesso…»), muitos leitores de ecrã não anunciam uma região viva que nasce com
   o conteúdo; os que anunciam repetem «A carregar…» em cada navegação lenta.
3. **Movimento reduzido:** o novo indicador é um anel estático com um segmento colorido
   (`motion-safe:animate-spin`), que parece parado; sem `message`, não há outro sinal.
4. **A marca continua a entrar duas vezes** (ver #164, ponto 3): agora com a respiração
   `siga-brand-wait`, cortada a meio quando o login monta e volta a fazer a entrada.
5. **Limpeza:** `Bar` em `mobile/skeletons.tsx` duplica `ui/skeleton.tsx`; muitas trocas de
   classes da escala por valores arbitrários iguais (`size-9`→`size-[36px]`); guardas
   `motion-safe:` repetem a regra global de `prefers-reduced-motion` em `styles.css`.
