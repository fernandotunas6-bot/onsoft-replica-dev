/** Only provisioned platform domains or verified custom domains may serve a school. */
export function schoolWebsiteDomainVerified(domain: {
  type: string | null;
  verified_at: string | null;
}): boolean {
  return (
    domain.type === "siga_subdomain" ||
    (domain.type === "custom_domain" && Boolean(domain.verified_at))
  );
}
