import { describe, expect, it } from "vitest";
import {
  createResendDomainInputSchema,
  verifyResendDomainInputSchema,
} from "@/features/saas/resend-domains-server";

describe("Resend Domains Schemas", () => {
  it("valida nomes de domínio com formato correto", () => {
    expect(createResendDomainInputSchema.parse({ domainName: "colegioesperanca.ao" })).toEqual({
      domainName: "colegioesperanca.ao",
    });

    expect(createResendDomainInputSchema.parse({ domainName: "mail.escola.co.ao" })).toEqual({
      domainName: "mail.escola.co.ao",
    });
  });

  it("rejeita nomes de domínio malformados", () => {
    expect(() => createResendDomainInputSchema.parse({ domainName: "invalido" })).toThrow();
    expect(() => createResendDomainInputSchema.parse({ domainName: "http://escola.ao" })).toThrow();
  });

  it("valida ID de verificação de domínio", () => {
    expect(verifyResendDomainInputSchema.parse({ domainId: "dom_123456789" })).toEqual({
      domainId: "dom_123456789",
    });

    expect(() => verifyResendDomainInputSchema.parse({ domainId: "" })).toThrow();
  });
});
