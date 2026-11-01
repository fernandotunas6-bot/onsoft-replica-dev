/**
 * Endereços públicos da escola nova, na mesma regra do Worker do SIGA
 * (`schoolSiteLinks`): na raiz do subdomínio fica o website; em `/portal`, o
 * portal SIGA Plus da escola.
 */
export function schoolAddressUrls(hostname: string, slug: string) {
  const host = hostname.trim().toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || !host.includes(".")) return null
  const origin = `https://${host}`
  return {
    websiteUrl: `${origin}/`,
    portalUrl: `${origin}/portal?escola=${encodeURIComponent(slug)}`,
  }
}
