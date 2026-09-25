import { describe, expect, it, vi } from "vitest";
import { OtpService } from "@/features/otp/otp-service";
import { OtpDispatcher } from "@/features/otp/otp-dispatcher";
import { IMessageDeliveryAdapter, OtpPayload, OtpDeliveryResult } from "@/features/otp/contracts";

describe("OtpService", () => {
  it("gera código estritamente numérico de 6 dígitos", () => {
    for (let i = 0; i < 20; i++) {
      const code = OtpService.generateCode();
      expect(code).toMatch(/^\d{6}$/);
      const num = parseInt(code, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThan(1000000);
    }
  });

  it("gera hash HMAC determinístico e seguro", () => {
    const code = "483921";
    const id1 = "+244923111222";
    const id2 = "+244923333444";

    const hash1 = OtpService.hashCode(code, id1);
    const hash2 = OtpService.hashCode(code, id2);
    const hashRepeat = OtpService.hashCode(code, id1);

    expect(hash1).toHaveLength(64); // SHA-256 hex string
    expect(hash1).toBe(hashRepeat);
    expect(hash1).not.toBe(hash2); // Binds identifier
  });

  it("normaliza identificadores de Angola (+244) e e-mails", () => {
    // Telefones Angolanos (9 dígitos iniciados por 9 ou 2)
    expect(OtpService.normalizeIdentifier("923 456 789")).toBe("+244923456789");
    expect(OtpService.normalizeIdentifier("222 123 456")).toBe("+244222123456");
    expect(OtpService.normalizeIdentifier("+244 923 456 789")).toBe("+244923456789");
    expect(OtpService.normalizeIdentifier("244923456789")).toBe("+244923456789");

    // E-mails
    expect(OtpService.normalizeIdentifier("  Joao.Manuel@Escola.AO ")).toBe(
      "joao.manuel@escola.ao",
    );
  });
});

describe("OtpDispatcher", () => {
  it("determina a ordem correta da cascata de canais", () => {
    const dispatcher = new OtpDispatcher();

    // Telemóvel sem preferência explícita: Prioridade WhatsApp -> SMS
    const phoneCascade = dispatcher.resolveChannelCascade("+244923000000");
    expect(phoneCascade).toEqual(["whatsapp", "sms"]);

    // Telemóvel com preferência explícita por SMS
    const phoneCascadeSms = dispatcher.resolveChannelCascade("+244923000000", "sms");
    expect(phoneCascadeSms).toEqual(["sms", "whatsapp"]);

    // E-mail
    const emailCascade = dispatcher.resolveChannelCascade("admin@escola.ao");
    expect(emailCascade).toEqual(["email"]);
  });

  it("executa fallback automático quando o canal primário falha", async () => {
    let whatsappAttempted = false;
    let smsAttempted = false;

    // Mock do createOtpSession para testes sem banco de dados ativo
    vi.spyOn(OtpService, "createOtpSession").mockResolvedValue({
      session: {
        id: "session-uuid-123",
        targetIdentifier: "+244999888777",
        channelSent: "whatsapp",
        purpose: "login_2fa",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        attemptsLeft: 5,
      },
      generatedCode: "654321",
    });

    const mockWhatsAppAdapter: IMessageDeliveryAdapter = {
      channel: "whatsapp",
      providerName: "mock_whatsapp",
      sendCode: async (_payload: OtpPayload): Promise<OtpDeliveryResult> => {
        whatsappAttempted = true;
        return {
          success: false,
          channel: "whatsapp",
          provider: "mock_whatsapp",
          error: "Número de telemóvel não possui WhatsApp ativo",
        };
      },
    };

    const mockSmsAdapter: IMessageDeliveryAdapter = {
      channel: "sms",
      providerName: "mock_sms",
      sendCode: async (_payload: OtpPayload): Promise<OtpDeliveryResult> => {
        smsAttempted = true;
        return {
          success: true,
          channel: "sms",
          provider: "mock_sms",
          externalMessageId: "sms_test_id_999",
        };
      },
    };

    const dispatcher = new OtpDispatcher([mockWhatsAppAdapter, mockSmsAdapter]);

    const result = await dispatcher.requestOtp({
      targetIdentifier: "+244999888777",
      purpose: "login_2fa",
      preferredChannel: "whatsapp",
    });

    expect(whatsappAttempted).toBe(true);
    expect(smsAttempted).toBe(true);
    expect(result.success).toBe(true);
    expect(result.channelUsed).toBe("sms");
  });
});

describe("OtpDispatcher — limite por IP", () => {
  const okAdapter: IMessageDeliveryAdapter = {
    channel: "email",
    providerName: "mock_email",
    sendCode: async (): Promise<OtpDeliveryResult> => ({
      success: true,
      channel: "email",
      provider: "mock_email",
      externalMessageId: "ok",
    }),
  };

  it("recusa o 21.º envio por hora do mesmo IP, mesmo variando o destino", async () => {
    const dispatcher = new OtpDispatcher([okAdapter]);
    const ip = "198.51.100.77";
    for (let i = 0; i < 20; i += 1) {
      const sent = await dispatcher.requestOtp({
        targetIdentifier: `pessoa${i}@exemplo.ao`,
        purpose: "login_2fa",
        preferredChannel: "email",
        requestedIp: ip,
      });
      expect(sent.success, `envio ${i + 1}`).toBe(true);
    }
    const blocked = await dispatcher.requestOtp({
      targetIdentifier: "outra@exemplo.ao",
      purpose: "login_2fa",
      preferredChannel: "email",
      requestedIp: ip,
    });
    expect(blocked.success).toBe(false);
    expect(blocked.cooldownSeconds).toBe(3600);
  });

  it("não aplica o limite por IP quando o IP é desconhecido", async () => {
    const dispatcher = new OtpDispatcher([okAdapter]);
    for (let i = 0; i < 25; i += 1) {
      const sent = await dispatcher.requestOtp({
        targetIdentifier: `anon${i}@exemplo.ao`,
        purpose: "login_2fa",
        preferredChannel: "email",
      });
      expect(sent.success, `envio ${i + 1}`).toBe(true);
    }
  });
});
