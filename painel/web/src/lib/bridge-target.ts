/**
 * Caminho dentro do WEB para onde uma ponte leva, ou `null` se o destino for outra
 * app (navegação completa).
 *
 * Várias pontes apontam para endereços absolutos do próprio WEB (getPricingUrl(),
 * getCreateSchoolUrl()). O <Navigate> do React Router trata-os como caminhos
 * relativos: /settings ia para /settings/https:/siga-web.pages.dev/pricing (404).
 */
export function bridgeInternalPath(
  bridge: { to: string; external?: boolean },
  origin: string,
): string | null {
  if (bridge.external) return null
  if (bridge.to.startsWith("/") && !bridge.to.startsWith("//")) return bridge.to
  try {
    const url = new URL(bridge.to)
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null
  } catch {
    return null
  }
}
