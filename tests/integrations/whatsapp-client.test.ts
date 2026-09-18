import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeWhatsAppToDigits,
  normalizeWhatsAppRecipients,
  resolveWhatsAppCredentials,
  sendWhatsAppCloudMessage,
} from "@/features/integrations/whatsapp-client";

describe("whatsapp-client", () => {
  describe("normalizeWhatsAppToDigits", () => {
    it("should normalize 9-digit Angolan phone number to 244 format", () => {
      expect(normalizeWhatsAppToDigits("923456789")).toBe("244923456789");
      expect(normalizeWhatsAppToDigits("+244 923 456 789")).toBe("244923456789");
      expect(normalizeWhatsAppToDigits("00244923456789")).toBe("244923456789");
    });

    it("should strip non-digits and preserve country codes", () => {
      expect(normalizeWhatsAppToDigits("+351 (91) 234-5678")).toBe("351912345678");
      expect(normalizeWhatsAppToDigits("")).toBe("");
    });
  });

  describe("normalizeWhatsAppRecipients", () => {
    it("should filter invalid numbers and deduplicate", () => {
      const input = [
        "923 456 789",
        "+244 923 456 789", // duplicate
        "123", // too short (<10)
        "923456789", // duplicate
        "+244912345678",
      ];
      const result = normalizeWhatsAppRecipients(input);
      expect(result).toEqual(["244923456789", "244912345678"]);
    });

    it("should limit to maximum 50 recipients", () => {
      const numbers = Array.from({ length: 60 }, (_, i) => `923${String(i).padStart(6, "0")}`);
      const result = normalizeWhatsAppRecipients(numbers);
      expect(result.length).toBe(50);
    });
  });

  describe("resolveWhatsAppCredentials", () => {
    it("should resolve from merchantId and accessToken", () => {
      const creds = resolveWhatsAppCredentials({
        merchantId: "123456789",
        accessToken: "EAAXsampletoken",
      });
      expect(creds).toEqual({
        phoneNumberId: "123456789",
        accessToken: "EAAXsampletoken",
      });
    });

    it("should resolve from apiKey or callback fallback and envToken", () => {
      const creds = resolveWhatsAppCredentials({ phoneNumberId: "987654321" }, "env-token-123");
      expect(creds).toEqual({
        phoneNumberId: "987654321",
        accessToken: "env-token-123",
      });
    });

    it("should return null if missing phoneNumberId or accessToken", () => {
      expect(resolveWhatsAppCredentials({})).toBeNull();
      expect(resolveWhatsAppCredentials({ merchantId: "123" })).toBeNull();
      expect(resolveWhatsAppCredentials({ accessToken: "token" })).toBeNull();
    });
  });

  describe("sendWhatsAppCloudMessage", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("should send message via HTTP Cloud API successfully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [{ id: "wamid.HBgL" }],
        }),
      });

      const res = await sendWhatsAppCloudMessage({
        accessToken: "test-token",
        phoneNumberId: "phone-123",
        toE164Digits: "923456789",
        text: "Olá da escola!",
      });

      expect(res).toEqual({
        messageId: "wamid.HBgL",
        status: 200,
      });
      expect(global.fetch).toHaveBeenCalledWith(
        "https://graph.facebook.com/v21.0/phone-123/messages",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: "244923456789",
            type: "text",
            text: { preview_url: false, body: "Olá da escola!" },
          }),
        }),
      );
    });

    it("should throw error on invalid phone or missing credentials", async () => {
      await expect(
        sendWhatsAppCloudMessage({
          accessToken: "",
          phoneNumberId: "phone-123",
          toE164Digits: "923456789",
          text: "Teste",
        }),
      ).rejects.toThrow("Credenciais WhatsApp em falta.");

      await expect(
        sendWhatsAppCloudMessage({
          accessToken: "token",
          phoneNumberId: "phone-123",
          toE164Digits: "123",
          text: "Teste",
        }),
      ).rejects.toThrow("Número WhatsApp inválido");
    });

    it("should throw API error message if fetch fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: "Invalid OAuth access token." },
        }),
      });

      await expect(
        sendWhatsAppCloudMessage({
          accessToken: "invalid-token",
          phoneNumberId: "phone-123",
          toE164Digits: "923456789",
          text: "Teste",
        }),
      ).rejects.toThrow("Invalid OAuth access token.");
    });
  });
});
