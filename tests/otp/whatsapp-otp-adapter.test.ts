import { afterEach, describe, expect, it, vi } from "vitest";
import { WhatsAppOtpAdapter } from "@/features/otp/adapters/whatsapp-otp-adapter";

describe("código OTP por WhatsApp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("envia para a API do WhatsApp Cloud (graph.facebook.com)", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token");
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new WhatsAppOtpAdapter().sendCode({
      recipient: "+244923000000",
      code: "123456",
      expiresInMinutes: 5,
      purpose: "password_reset",
    });

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/123456/messages");
    const body = JSON.parse(String(init.body));
    expect(body.to).toBe("244923000000");
    expect(body.messaging_product).toBe("whatsapp");
  });
});
