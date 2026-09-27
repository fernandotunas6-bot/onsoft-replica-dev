import { describe, expect, it, vi } from "vitest";
import { countInRange, passwordExposureCount, sha1Hex } from "@/lib/pwned-password";

// SHA-1 de "password": 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
const PREFIX = "5BAA6";
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function respond(body: string, ok = true) {
  return vi.fn(async () => ({ ok, text: async () => body }) as unknown as Response);
}

describe("pwned-password", () => {
  it("calcula o SHA-1 em maiúsculas", async () => {
    expect(await sha1Hex("password")).toBe(PREFIX + SUFFIX);
  });

  it("lê a contagem do sufixo e ignora contagens a zero", () => {
    const body = `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:3861493\r\nFFFF:0`;
    expect(countInRange(body, SUFFIX)).toBe(3861493);
    expect(countInRange(body, "FFFF")).toBe(0);
    expect(countInRange(body, "ABCDEF")).toBe(0);
  });

  it("só envia os 5 primeiros caracteres do hash, num GET simples", async () => {
    const fetchImpl = respond(`${SUFFIX}:10`);
    expect(await passwordExposureCount("password", { fetchImpl })).toBe(10);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(url).not.toContain(SUFFIX);
    // Sem cabeçalhos próprios: não há pedido prévio de CORS que possa falhar.
    expect(init.headers).toBeUndefined();
  });

  it("devolve 0 quando a senha não aparece", async () => {
    expect(await passwordExposureCount("password", { fetchImpl: respond("ABC:1") })).toBe(0);
  });

  it("falha aberta: erro de rede ou resposta inválida dão null", async () => {
    const broken = vi.fn(async () => {
      throw new TypeError("network");
    });
    expect(await passwordExposureCount("password", { fetchImpl: broken })).toBeNull();
    expect(await passwordExposureCount("password", { fetchImpl: respond("", false) })).toBeNull();
    expect(await passwordExposureCount("", { fetchImpl: respond("") })).toBeNull();
  });
});
