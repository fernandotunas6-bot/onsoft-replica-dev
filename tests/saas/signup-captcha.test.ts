import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyHcaptcha } from "@/lib/hcaptcha-verify.server";

/** Registo público de escolas: com HCAPTCHA_SECRET_KEY, sem sinal válido não se cria nada. */
describe("hCaptcha no registo de escolas", () => {
  afterEach(() => {
    delete process.env.HCAPTCHA_SECRET_KEY;
  });

  it("sem segredo configurado, não exige (nada muda até se configurar)", async () => {
    expect(await verifyHcaptcha(undefined, "1.2.3.4")).toBe(true);
  });

  it("com segredo, sem sinal recusa sem chamar o hCaptcha", async () => {
    process.env.HCAPTCHA_SECRET_KEY = "0xsecret";
    const fetcher = vi.fn();
    expect(await verifyHcaptcha(undefined, "1.2.3.4", fetcher as never)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("com segredo, aceita só quando o hCaptcha confirma", async () => {
    process.env.HCAPTCHA_SECRET_KEY = "0xsecret";
    const ok = vi.fn(async () => Response.json({ success: true }));
    const no = vi.fn(async () => Response.json({ success: false }));
    expect(await verifyHcaptcha("tok", "1.2.3.4", ok as never)).toBe(true);
    expect(await verifyHcaptcha("tok", "1.2.3.4", no as never)).toBe(false);
    const body = (ok.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("secret")).toBe("0xsecret");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("falha de rede no hCaptcha não deixa passar", async () => {
    process.env.HCAPTCHA_SECRET_KEY = "0xsecret";
    const boom = vi.fn(async () => {
      throw new Error("rede");
    });
    expect(await verifyHcaptcha("tok", "1.2.3.4", boom as never)).toBe(false);
  });

  it("o registo verifica o captcha antes de provisionar", async () => {
    const { readFileSync } = await import("node:fs");
    const code = readFileSync("src/features/saas/public-signup.ts", "utf8");
    expect(code.indexOf("verifyHcaptcha(")).toBeGreaterThan(-1);
    expect(code.indexOf("verifyHcaptcha(")).toBeLessThan(code.indexOf("provisionTenantCore("));
  });
});
