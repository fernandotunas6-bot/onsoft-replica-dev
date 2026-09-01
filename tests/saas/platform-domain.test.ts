import { describe, expect, it } from "vitest";
import {
  getPlatformDomain,
  getPlatformSubdomain,
  isReservedSubdomain,
  validateTenantSlug,
  slugifySchoolName,
  RESERVED_SUBDOMAINS,
} from "@/lib/saas/platform-domain";

describe("platform-domain module", () => {
  describe("getPlatformDomain", () => {
    it("devolve domínio por defeito ou da variável de ambiente", () => {
      const domain = getPlatformDomain();
      expect(typeof domain).toBe("string");
      expect(domain.length).toBeGreaterThan(0);
      expect(domain).not.toContain(" ");
    });
  });

  describe("getPlatformSubdomain", () => {
    it("combina slug com o domínio da plataforma", () => {
      const sub = getPlatformSubdomain("esperanca");
      const domain = getPlatformDomain();
      expect(sub).toBe(`esperanca.${domain}`);
    });

    it("normaliza slug para lowercase e sem espaços", () => {
      const sub = getPlatformSubdomain(" Colegio-Central ");
      const domain = getPlatformDomain();
      expect(sub).toBe(`colegio-central.${domain}`);
    });
  });

  describe("isReservedSubdomain", () => {
    it("identifica slugs reservados da infraestrutura", () => {
      expect(isReservedSubdomain("www")).toBe(true);
      expect(isReservedSubdomain("app")).toBe(true);
      expect(isReservedSubdomain("admin")).toBe(true);
      expect(isReservedSubdomain("api")).toBe(true);
      expect(isReservedSubdomain("auth")).toBe(true);
      expect(isReservedSubdomain("status")).toBe(true);
      expect(isReservedSubdomain("mail")).toBe(true);
      expect(isReservedSubdomain("billing")).toBe(true);
      expect(isReservedSubdomain("financeiro")).toBe(true);
      expect(isReservedSubdomain("suporte")).toBe(true);
      expect(isReservedSubdomain("docs")).toBe(true);
      expect(isReservedSubdomain("noreply")).toBe(true);
    });

    it("permite slugs legítimos de escolas", () => {
      expect(isReservedSubdomain("colegio-esperanca")).toBe(false);
      expect(isReservedSubdomain("horizonte-sul")).toBe(false);
      expect(isReservedSubdomain("escola-santa-maria")).toBe(false);
      expect(isReservedSubdomain("liceu-nacional")).toBe(false);
    });
  });

  describe("validateTenantSlug", () => {
    it("valida slugs válidos", () => {
      expect(validateTenantSlug("colegio-esperanca")).toEqual({ valid: true });
      expect(validateTenantSlug("horizonte")).toEqual({ valid: true });
      expect(validateTenantSlug("escola123")).toEqual({ valid: true });
    });

    it("rejeita slugs curtos ou longos demais", () => {
      expect(validateTenantSlug("ab").valid).toBe(false);
      expect(validateTenantSlug("a".repeat(51)).valid).toBe(false);
    });

    it("rejeita caracteres especiais ou hífens no início/fim", () => {
      expect(validateTenantSlug("-escola").valid).toBe(false);
      expect(validateTenantSlug("escola-").valid).toBe(false);
      expect(validateTenantSlug("escola_teste").valid).toBe(false);
      expect(validateTenantSlug("escola.teste").valid).toBe(false);
      expect(validateTenantSlug("escola teste").valid).toBe(false);
    });

    it("rejeita slugs reservados com mensagem explícita", () => {
      const res = validateTenantSlug("admin");
      expect(res.valid).toBe(false);
      expect(res.reason).toContain("reservado");
    });
  });

  describe("slugifySchoolName", () => {
    it("transforma nomes com acentos e espaços em slugs limpos", () => {
      expect(slugifySchoolName("Colégio Adventista Esperança")).toBe("colegio-adventista-esperanca");
      expect(slugifySchoolName("Escola Primária Nº 123")).toBe("escola-primaria-n-123");
      expect(slugifySchoolName("Liceu São José (Bengo)")).toBe("liceu-sao-jose-bengo");
      expect(slugifySchoolName("   Complexo   Escolar   ")).toBe("complexo-escolar");
    });
  });
});
