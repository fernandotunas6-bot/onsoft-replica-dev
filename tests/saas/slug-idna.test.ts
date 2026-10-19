import { describe, expect, it } from "vitest";
import { createSchoolWizardInputSchema } from "@/features/saas/schemas";
import { hasReservedDnsHyphens, validateTenantSlug } from "@/lib/saas/platform-domain";

/**
 * Auditoria 13: `xn--…` é mostrado pelos browsers como um nome internacionalizado
 * (punycode); um subdomínio assim podia ler-se como o de outra escola.
 */
describe("subdomínio com «--» na 3.ª e 4.ª posição", () => {
  it("é recusado", () => {
    for (const slug of ["xn--colgio-esperana-vjb", "ab--cd", "XN--abc"]) {
      expect(hasReservedDnsHyphens(slug)).toBe(true);
      expect(validateTenantSlug(slug).valid).toBe(false);
    }
  });

  it("hífens noutras posições continuam permitidos", () => {
    for (const slug of ["colegio--esperanca", "abc-def", "a-b-c"]) {
      expect(hasReservedDnsHyphens(slug)).toBe(false);
      expect(validateTenantSlug(slug).valid).toBe(true);
    }
  });

  it("o esquema do registo também o recusa", () => {
    const field = createSchoolWizardInputSchema.shape.slug;
    expect(field.safeParse("xn--abc").success).toBe(false);
    expect(field.safeParse("colegio-esperanca").success).toBe(true);
  });
});
