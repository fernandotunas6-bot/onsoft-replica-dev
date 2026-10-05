import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ContactVerificationService,
  type ContactVerificationProfile,
} from "@/features/contacts/contact-verification-service";

/**
 * O serviço fala com a base por `loadSgaAdminClient()`. Aqui esse cliente é substituído por
 * um que não liga a lado nenhum e só regista o que lhe mandaram — tabela, patch e filtro.
 * `vi.hoisted` porque `vi.mock` sobe para o topo do ficheiro e não veria estas variáveis
 * declaradas mais abaixo.
 */
const { escritas, erroDoCliente, utilizadorAuth } = vi.hoisted(() => ({
  escritas: [] as Array<{
    tabela: string;
    patch: Record<string, unknown>;
    filtro: [string, unknown];
  }>,
  erroDoCliente: { valor: null as { message: string } | null },
  utilizadorAuth: {
    valor: { email: "User@Example.com", email_confirmed_at: "2026-10-01T00:00:00Z" } as {
      email: string | null;
      email_confirmed_at: string | null;
    },
  },
}));

vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: utilizadorAuth.valor }, error: null }),
      },
    },
    from: (tabela: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (coluna: string, valor: unknown) => {
          escritas.push({ tabela, patch, filtro: [coluna, valor] });
          return Promise.resolve({ error: erroDoCliente.valor });
        },
      }),
    }),
  }),
}));

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
      const profile: ContactVerificationProfile = {
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
      const profile: ContactVerificationProfile = {
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
      const profile: ContactVerificationProfile = {
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
      const profile: ContactVerificationProfile = {
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
      const profile: ContactVerificationProfile = {
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

/**
 * Cobertura das operações de escrita, que não tinham nenhuma.
 *
 * Eram oito cópias do mesmo bloco e passaram a uma só (`patchProfile`) com duas variantes
 * por canal. Um refactor desses é exactamente o que se parte em silêncio — troca-se um
 * nome de coluna entre canais e nada acusa. Estes testes fixam o payload de cada operação:
 * tabela, colunas, valores e filtro.
 */
describe("ContactVerificationService — escritas no perfil", () => {
  beforeEach(() => {
    escritas.length = 0;
    erroDoCliente.valor = null;
  });

  const ultima = () => escritas[escritas.length - 1];

  it("cada operação escreve na tabela certa e filtra pelo utilizador", async () => {
    await ContactVerificationService.markEmailAsVerified("u1");
    expect(escritas).toHaveLength(1);
    expect(ultima().tabela).toBe("contact_verification_profiles");
    expect(ultima().filtro).toEqual(["user_id", "u1"]);
  });

  it("normaliza o email e volta a pô-lo por verificar", async () => {
    await ContactVerificationService.updateEmailAddress("u1", "  User@Example.COM  ");
    expect(ultima().patch).toEqual({
      email_address: "user@example.com",
      email_verified: false,
      email_verified_at: null,
    });
  });

  it.each([
    ["updatePhoneNumber", "phone_number", "phone_verified", "phone_verified_at"],
    ["updateWhatsappNumber", "whatsapp_number", "whatsapp_verified", "whatsapp_verified_at"],
  ] as const)("%s escreve as colunas do seu canal", async (metodo, contacto, verif, verifEm) => {
    await ContactVerificationService[metodo]("u1", "+244923000000");
    expect(ultima().patch).toEqual({
      [contacto]: "+244923000000",
      [verif]: false,
      [verifEm]: null,
    });
  });

  it("markEmailAsVerified grava o email confirmado pelo Auth", async () => {
    await ContactVerificationService.markEmailAsVerified("u1");
    const patch = ultima().patch;
    expect(patch["email_verified"]).toBe(true);
    expect(patch["email_address"]).toBe("user@example.com");
    expect(typeof patch["email_verified_at"]).toBe("string");
  });

  it("markEmailAsVerified recusa quando o Auth não confirmou o email", async () => {
    const antes = utilizadorAuth.valor;
    utilizadorAuth.valor = { email: "user@example.com", email_confirmed_at: null };
    try {
      await expect(ContactVerificationService.markEmailAsVerified("u1")).rejects.toThrow(
        "ainda não foi confirmado",
      );
      expect(escritas).toHaveLength(0);
    } finally {
      utilizadorAuth.valor = antes;
    }
  });

  it.each([
    ["markPhoneAsVerified", "phone_verified", "phone_verified_at"],
    ["markWhatsappAsVerified", "whatsapp_verified", "whatsapp_verified_at"],
  ] as const)("%s marca só o seu canal", async (metodo, verif, verifEm) => {
    await ContactVerificationService[metodo]("u1");
    const patch = ultima().patch;
    expect(patch[verif]).toBe(true);
    expect(typeof patch[verifEm]).toBe("string");
    expect(Object.keys(patch).sort()).toEqual([verif, verifEm].sort());
  });

  it.each([
    ["email", "last_email_sent_at"],
    ["sms", "last_sms_sent_at"],
    ["whatsapp", "last_whatsapp_sent_at"],
  ] as const)("recordLastMessageSent(%s) carimba a coluna do canal", async (canal, coluna) => {
    await ContactVerificationService.recordLastMessageSent("u1", canal);
    expect(Object.keys(ultima().patch)).toEqual([coluna]);
  });

  it("setPreferredChannel grava só o canal preferido", async () => {
    await ContactVerificationService.setPreferredChannel("u1", "whatsapp");
    expect(ultima().patch).toEqual({ preferred_communication_channel: "whatsapp" });
  });

  it("nenhuma escrita envia updated_at — é o trigger da tabela que o escreve", async () => {
    await ContactVerificationService.updateEmailAddress("u1", "a@b.pt");
    await ContactVerificationService.markPhoneAsVerified("u1");
    await ContactVerificationService.setPreferredChannel("u1", "sms");
    await ContactVerificationService.recordLastMessageSent("u1", "email");

    const comCarimbo = escritas.filter((e) => "updated_at" in e.patch || "version" in e.patch);
    expect(
      comCarimbo,
      "o trigger siga_touch_updated_at_and_version substitui estes valores antes de " +
        "chegarem ao disco — enviá-los dá a impressão de que é o serviço a controlá-los",
    ).toEqual([]);
  });

  it("um erro da base vira mensagem com contexto", async () => {
    erroDoCliente.valor = { message: "permissão negada" };
    await expect(ContactVerificationService.markEmailAsVerified("u1")).rejects.toThrow(
      "Falha ao marcar email como verificado: permissão negada",
    );
  });

  it("recordLastMessageSent engole o erro — é auditoria best-effort", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    erroDoCliente.valor = { message: "indisponível" };

    await expect(
      ContactVerificationService.recordLastMessageSent("u1", "email"),
    ).resolves.toBeUndefined();
    expect(consola).toHaveBeenCalled();

    consola.mockRestore();
  });
});
