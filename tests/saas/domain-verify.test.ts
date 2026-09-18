import { describe, expect, it } from "vitest";
import {
  cnameMatchesTarget,
  dnsVerifyToken,
  dnsVerifyTxtHost,
  expectedCnameTarget,
  txtRecordsIncludeToken,
} from "@/features/saas/domain-verify";

describe("domain-verify helpers", () => {
  it("calcula alvo CNAME a partir do slug", () => {
    expect(expectedCnameTarget("Colegio-Horizonte")).toBe("colegio-horizonte.portal-siga.com");
  });

  it("aceita CNAME equivalente sem ponto final", () => {
    expect(cnameMatchesTarget(["escola.portal-siga.com."], "escola.portal-siga.com")).toBe(true);
  });

  it("valida token TXT", () => {
    expect(txtRecordsIncludeToken([["siga-verify=abc-123"]], "siga-verify=abc-123")).toBe(true);
    expect(txtRecordsIncludeToken([["outro-valor"]], "siga-verify=abc-123")).toBe(false);
  });

  it("gera host TXT de verificação", () => {
    expect(dnsVerifyTxtHost("Portal.Colegio.ao")).toBe("_siga-verify.portal.colegio.ao");
    expect(dnsVerifyToken("ten-uuid")).toBe("siga-verify=ten-uuid");
  });
});
