// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  TRUSTED_DEVICE_DAYS,
  deviceFingerprint,
  deviceTrust,
  forgetAllTrustedDevices,
  forgetTrustedDevice,
  trustDevice,
} from "@/features/auth/trusted-device";

const DAY = 24 * 60 * 60_000;
const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const CHROME_WIN_NEXT = CHROME_WIN.replace("Chrome/140.0", "Chrome/141.0");
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("dispositivo reconhecido", () => {
  beforeEach(() => localStorage.clear());

  it("sem verificação, o dispositivo não é reconhecido", () => {
    expect(deviceTrust("u1")).toBe("shared");
  });

  it(`reconhece durante ${TRUSTED_DEVICE_DAYS} dias e depois volta a pedir`, () => {
    const now = 1_000_000;
    trustDevice("u1", now, "windows:chrome");
    expect(deviceTrust("u1", now + (TRUSTED_DEVICE_DAYS - 1) * DAY, "windows:chrome")).toBe(
      "trusted",
    );
    expect(deviceTrust("u1", now + TRUSTED_DEVICE_DAYS * DAY, "windows:chrome")).toBe("expired");
  });

  it("outro navegador ou sistema com o mesmo armazenamento é sinal de risco", () => {
    trustDevice("u1", Date.now(), "windows:chrome");
    expect(deviceTrust("u1", Date.now(), "linux:firefox")).toBe("changed");
  });

  it("actualizar o navegador não conta como mudança", () => {
    expect(deviceFingerprint(CHROME_WIN)).toBe(deviceFingerprint(CHROME_WIN_NEXT));
    expect(deviceFingerprint(CHROME_WIN)).toBe("windows:chrome");
    expect(deviceFingerprint(FIREFOX_LINUX)).toBe("linux:firefox");
    expect(deviceFingerprint(SAFARI_IPHONE)).toBe("ios:safari");
  });

  it("o reconhecimento é por conta e sair esquece-o", () => {
    trustDevice("u1");
    trustDevice("u2");
    expect(deviceTrust("u3")).toBe("shared");
    forgetTrustedDevice("u1");
    expect(deviceTrust("u1")).toBe("shared");
    expect(deviceTrust("u2")).toBe("trusted");
    forgetAllTrustedDevices();
    expect(deviceTrust("u2")).toBe("shared");
  });

  it("registo antigo ou estragado não conta como reconhecido", () => {
    localStorage.setItem("siga:trusted-device:u1", String(Date.now() + DAY));
    expect(deviceTrust("u1")).toBe("shared");
  });

  it("a entrada reconhece sem caixa, o fecho por inactividade respeita o risco e sair esquece", () => {
    const gate = readFileSync(join(process.cwd(), "src/components/auth/AuthGate.tsx"), "utf8");
    expect(gate).not.toMatch(/trustThisDevice/);
    expect(gate).toMatch(/trustDevice\(userId\)/);
    expect(gate).toMatch(/trust === "expired" \|\| trust === "changed"/);
    const signOut = readFileSync(join(process.cwd(), "src/features/auth/use-sign-out.ts"), "utf8");
    expect(signOut).toMatch(/forgetAllTrustedDevices\(\)/);
  });
});
