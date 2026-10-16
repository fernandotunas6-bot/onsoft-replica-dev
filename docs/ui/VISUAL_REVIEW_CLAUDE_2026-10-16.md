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
