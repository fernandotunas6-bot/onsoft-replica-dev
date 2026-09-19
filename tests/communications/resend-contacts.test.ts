import { describe, expect, it } from "vitest";
import { ResendContactsClient } from "@/features/integrations/resend-contacts-client";

describe("ResendContactsClient", () => {
  it("valida obrigatoriedade da API key antes de disparar chamadas", async () => {
    // Simula ambiente sem API key
    const originalEnv = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    await expect(ResendContactsClient.listAudiences()).rejects.toThrow(
      "RESEND_API_KEY não configurada",
    );

    await expect(ResendContactsClient.createAudience("Escola")).rejects.toThrow(
      "RESEND_API_KEY não configurada",
    );

    await expect(
      ResendContactsClient.createContact({
        audienceId: "aud_123",
        email: "teste@escola.ao",
      }),
    ).rejects.toThrow("RESEND_API_KEY não configurada");

    // Restaura
    if (originalEnv) process.env.RESEND_API_KEY = originalEnv;
  });
});
