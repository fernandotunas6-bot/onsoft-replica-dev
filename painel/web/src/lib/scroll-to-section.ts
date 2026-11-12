/**
 * Levar a vista a uma secção da landing (`#contact`, `#pricing`…).
 *
 * As secções usam `content-visibility: auto` (index.css): enquanto não se desenham,
 * o browser conta-lhes uma altura estimada (24rem). Ao descer, as que ficam pelo
 * caminho ganham a altura real e o destino muda de sítio, por isso um só
 * `scrollIntoView` acabava longe da secção (ou nem saía do topo, em `/#contact`).
 * Aqui desloca-se, espera-se pelo layout e corrige-se até a secção ficar no topo.
 * A secção pode ser substituída entretanto (o formulário de contacto carrega à
 * parte), por isso procura-se de novo em cada passo.
 */
const MAX_CORRECTIONS = 12
const SETTLE_MS = 90
const TOLERANCE_PX = 2

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

export function scrollToSection(hash: string, options: { smooth?: boolean } = {}): boolean {
  if (!hash.startsWith("#") || hash.length < 2) return false
  const find = () => {
    try {
      return document.querySelector<HTMLElement>(hash)
    } catch {
      return null // id inválido para um selector
    }
  }
  const first = find()
  if (!first) return false

  const smooth = Boolean(options.smooth) && !prefersReducedMotion()
  first.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "start" })

  let corrections = 0
  const settle = () => {
    const target = find()
    if (!target) return
    const offset = target.getBoundingClientRect().top
    if (Math.abs(offset) <= TOLERANCE_PX || corrections++ >= MAX_CORRECTIONS) return
    // "instant": o html tem scroll-behavior: smooth, e "auto" herdá-lo-ia.
    window.scrollBy({ top: offset, behavior: "instant" })
    window.setTimeout(settle, SETTLE_MS)
  }
  // Depois do deslize suave, ou logo a seguir ao salto, corrigir o que o layout mudou.
  window.setTimeout(settle, smooth ? 700 : SETTLE_MS)
  return true
}
