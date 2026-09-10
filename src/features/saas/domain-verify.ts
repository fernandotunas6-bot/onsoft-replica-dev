import { getPlatformSubdomain } from "@/lib/saas/platform-domain";

/**
 * Verificação DNS para domínios customizados SIGA Plus.
 * O operador deve configurar CNAME → {slug}.{PLATFORM_DOMAIN}
 * ou TXT em _siga-verify.{hostname} com o token do tenant.
 */

export function expectedCnameTarget(tenantSlug: string): string {
  return getPlatformSubdomain(tenantSlug);
}

export function dnsVerifyTxtHost(hostname: string): string {
  return `_siga-verify.${hostname.trim().toLowerCase()}`;
}

export function dnsVerifyToken(tenantId: string): string {
  return `siga-verify=${tenantId}`;
}

function normalizeDnsName(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function cnameMatchesTarget(cnames: string[], expectedTarget: string): boolean {
  const target = normalizeDnsName(expectedTarget);
  return cnames.some((entry) => normalizeDnsName(entry) === target);
}

export function txtRecordsIncludeToken(records: string[][], token: string): boolean {
  const needle = token.trim();
  return records.some((parts) => parts.join("").includes(needle));
}

export type DomainDnsCheckResult =
  { ok: true; method: "cname" | "txt" } | { ok: false; reason: string };

export async function verifyCustomDomainDns(
  hostname: string,
  tenantSlug: string,
  tenantId: string,
): Promise<DomainDnsCheckResult> {
  const host = hostname.trim().toLowerCase();
  const expected = expectedCnameTarget(tenantSlug);
  const dns = await import("node:dns/promises");

  try {
    const cnames = await dns.resolveCname(host);
    if (cnameMatchesTarget(cnames, expected)) {
      return { ok: true, method: "cname" };
    }
    return {
      ok: false,
      reason: `CNAME actual: ${cnames.join(", ") || "—"}. Esperado: ${expected}`,
    };
  } catch (cnameError) {
    const cnameMessage = cnameError instanceof Error ? cnameError.message : String(cnameError);
    try {
      const txtHost = dnsVerifyTxtHost(host);
      const txts = await dns.resolveTxt(txtHost);
      const token = dnsVerifyToken(tenantId);
      if (txtRecordsIncludeToken(txts, token)) {
        return { ok: true, method: "txt" };
      }
      return {
        ok: false,
        reason: `Sem CNAME válido (${cnameMessage}). TXT em ${txtHost} deve conter «${token}».`,
      };
    } catch (txtError) {
      const txtMessage = txtError instanceof Error ? txtError.message : String(txtError);
      return {
        ok: false,
        reason: `Configure CNAME ${host} → ${expected} ou TXT ${dnsVerifyTxtHost(host)} = ${dnsVerifyToken(tenantId)}. (${txtMessage})`,
      };
    }
  }
}
