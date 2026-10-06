// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  TRUSTED_DEVICE_DAYS,
  deviceTrust,
  forgetAllTrustedDevices,
  forgetTrustedDevice,
  trustDevice,
} from "@/features/auth/trusted-device";

const DAY = 24 * 60 * 60_000;

describe("dispositivo de confiança", () => {
  beforeEach(() => localStorage.clear());

  it("sem marcação, o dispositivo é partilhado", () => {
    expect(deviceTrust("u1")).toBe("shared");
  });

  it(`confia durante ${TRUSTED_DEVICE_DAYS} dias e depois expira`, () => {
    const now = 1_000_000;
    trustDevice("u1", now);
    expect(deviceTrust("u1", now + (TRUSTED_DEVICE_DAYS - 1) * DAY)).toBe("trusted");
    expect(deviceTrust("u1", now + TRUSTED_DEVICE_DAYS * DAY)).toBe("expired");
  });

  it("a confiança é por conta", () => {
    trustDevice("u1");
    expect(deviceTrust("u2")).toBe("shared");
  });

  it("esquecer devolve o dispositivo a partilhado", () => {
    trustDevice("u1");
    trustDevice("u2");
    forgetTrustedDevice("u1");
    expect(deviceTrust("u1")).toBe("shared");
    expect(deviceTrust("u2")).toBe("trusted");
    forgetAllTrustedDevices();
    expect(deviceTrust("u2")).toBe("shared");
  });

  it("o ecrã de entrada e a saída usam a regra", () => {
    const gate = readFileSync(join(process.cwd(), "src/components/auth/AuthGate.tsx"), "utf8");
    expect(gate).toMatch(/if \(trustThisDevice\) trustDevice\(/);
    expect(gate).toMatch(/deviceTrust\(session\.user\.id\)/);
    const signOut = readFileSync(join(process.cwd(), "src/features/auth/use-sign-out.ts"), "utf8");
    expect(signOut).toMatch(/forgetAllTrustedDevices\(\)/);
  });
});
