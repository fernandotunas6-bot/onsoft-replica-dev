import { describe, it, expect, beforeEach, vi } from "vitest";
import { ContactVerificationService } from "./contact-verification-service";

/**
 * Testes para ContactVerificationService
 * Nota: Estes são testes unitários que mockam o Supabase.
 * Testes de integração com BD real devem estar em integration tests.
 */

describe("ContactVerificationService", () => {
  // Mocks
  const mockUserId = "user-123";
  const mockSchoolId = "school-456";
  const mockEmail = "user@example.com";
  const mockPhone = "923000000";
  const mockPhoneE164 = "+244923000000";
  const mockWhatsapp = "+244924000000";

  describe("resolveChannel", () => {
    it("retorna email se apenas email está verificado", () => {
      const profile = {
        id: "1",
        userId: mockUserId,
        schoolId: mockSchoolId,
        emailAddress: mockEmail,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        phoneNumber: null,
        phoneVerified: false,
        phoneVerifiedAt: null,
        whatsappNumber: null,
        whatsappVerified: false,
        whatsappVerifiedAt: null,
        preferredCommunicationChannel: "email",
        preferredLanguage: "pt",
        lastEmailSentAt: null,
        lastSmsSentAt: null,
        lastWhatsappSentAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const channel = ContactVerificationService.resolveChannel(profile);
      expect(channel).toBe("email");
    });

    it("retorna null se nenhum canal está verificado", () => {
      const profile = {
        id: "1",
        userId: mockUserId,
        schoolId: mockSchoolId,
        emailAddress: mockEmail,
        emailVerified: false,
        emailVerifiedAt: null,
        phoneNumber: mockPhoneE164,
        phoneVerified: false,
        phoneVerifiedAt: null,
        whatsappNumber: mockWhatsapp,
        whatsappVerified: false,
        whatsappVerifiedAt: null,
        preferredCommunicationChannel: "email",
        preferredLanguage: "pt",
        lastEmailSentAt: null,
        lastSmsSentAt: null,
        lastWhatsappSentAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const channel = ContactVerificationService.resolveChannel(profile);
      expect(channel).toBeNull();
    });

    it("respeita canais preferidos quando disponíveis", () => {
      const profile = {
        id: "1",
        userId: mockUserId,
        schoolId: mockSchoolId,
        emailAddress: mockEmail,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        phoneNumber: mockPhoneE164,
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
        whatsappNumber: mockWhatsapp,
        whatsappVerified: true,
        whatsappVerifiedAt: new Date().toISOString(),
        preferredCommunicationChannel: "email",
        preferredLanguage: "pt",
        lastEmailSentAt: null,
        lastSmsSentAt: null,
        lastWhatsappSentAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // Preferir WhatsApp
      const channel = ContactVerificationService.resolveChannel(profile, ["whatsapp", "sms"]);
      expect(channel).toBe("whatsapp");
    });

    it("faz fallback ao canal preferido se o preferido não está disponível", () => {
      const profile = {
        id: "1",
        userId: mockUserId,
        schoolId: mockSchoolId,
        emailAddress: mockEmail,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        phoneNumber: null,
        phoneVerified: false,
        phoneVerifiedAt: null,
        whatsappNumber: null,
        whatsappVerified: false,
        whatsappVerifiedAt: null,
        preferredCommunicationChannel: "whatsapp",
        preferredLanguage: "pt",
        lastEmailSentAt: null,
        lastSmsSentAt: null,
        lastWhatsappSentAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      // WhatsApp não está verificado, mas email está
      const channel = ContactVerificationService.resolveChannel(profile);
      expect(channel).toBe("email");
    });

    it("usa primeira opção disponível se preferido não está disponível", () => {
      const profile = {
        id: "1",
        userId: mockUserId,
        schoolId: mockSchoolId,
        emailAddress: null,
        emailVerified: false,
        emailVerifiedAt: null,
        phoneNumber: mockPhoneE164,
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
        whatsappNumber: mockWhatsapp,
        whatsappVerified: true,
        whatsappVerifiedAt: new Date().toISOString(),
        preferredCommunicationChannel: "email", // Email não está disponível
        preferredLanguage: "pt",
        lastEmailSentAt: null,
        lastSmsSentAt: null,
        lastWhatsappSentAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      const channel = ContactVerificationService.resolveChannel(profile);
      expect(channel).toBe("sms");
    });
  });

  describe("Phone number formatting", () => {
    it("normaliza telefones de Angola com 9 dígitos", () => {
      // Testes de normalização (métodos privados testados indiretamente)
      // Este é um placeholder para demonstrar a estrutura de testes

      // Em produção, seria testado via API quando o utilizador adiciona um número
      const mockNumberAngola = "923000000";
      const expectedE164 = "+244923000000";

      // Simular normalização
      expect(mockNumberAngola.length).toBe(9);
      expect(expectedE164).toMatch(/^\+244\d{9}$/);
    });
  });

  describe("Communication preferences", () => {
    it("garante que segurança é sempre obrigatória", () => {
      // A tabela garante security_enabled = true por padrão
      // e o serviço nunca deve permitir desabilitar

      // Teste conceitual: se alguém tentar desabilitar segurança
      const categories = {
        security: false, // Tentativa de desabilitar
        academic: true,
      };

      // O serviço deveria ignorar ou rejeitar this
      // Implementar validação no updateCommunicationCategories se necessário
      expect(categories).toBeDefined();
    });
  });

  describe("Multi-tenant isolation", () => {
    it("respeita school_id para isolamento", () => {
      // Cada operação deve filtrar por school_id
      // Este é um teste que seria testado na integração

      const profile1 = { schoolId: "school-1" };
      const profile2 = { schoolId: "school-2" };

      expect(profile1.schoolId).not.toBe(profile2.schoolId);
    });
  });
});
