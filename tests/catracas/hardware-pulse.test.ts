import { describe, it, expect } from "vitest";
import {
  loadDesktopHardwarePrefs,
  resolveTurnstilePulseIp,
} from "@/features/catracas/hardware-pulse";

describe("resolveTurnstilePulseIp", () => {
  const devices = [
    { id: "a", name: "Sem IP", ip_address: null },
    { id: "b", name: "Portaria", ip_address: "192.168.1.201" },
  ];

  it("prefers the preferred device IP when present", () => {
    const result = resolveTurnstilePulseIp({
      devices,
      preferredDeviceId: "b",
      desktopPrefs: { turnstileIp: "10.0.0.1" },
    });
    expect(result).toEqual({
      ipAddress: "192.168.1.201",
      source: "device",
      deviceId: "b",
    });
  });

  it("falls back to the first device with IP", () => {
    const result = resolveTurnstilePulseIp({ devices, preferredDeviceId: "a" });
    expect(result.source).toBe("device");
    expect(result.ipAddress).toBe("192.168.1.201");
    expect(result.deviceId).toBe("b");
  });

  it("uses desktop prefs when no device has IP", () => {
    const result = resolveTurnstilePulseIp({
      devices: [{ id: "x", ip_address: "  " }],
      desktopPrefs: { turnstileIp: "192.168.1.50" },
    });
    expect(result).toEqual({ ipAddress: "192.168.1.50", source: "desktop" });
  });

  it("simulates on loopback when nothing is configured", () => {
    const result = resolveTurnstilePulseIp({ devices: [] });
    expect(result).toEqual({ ipAddress: "127.0.0.1", source: "loopback" });
  });
});

describe("loadDesktopHardwarePrefs", () => {
  it("reads turnstileIp from a storage stub", () => {
    const storage = {
      getItem: () => JSON.stringify({ turnstileIp: " 10.1.2.3 ", printerIp: "x" }),
    };
    expect(loadDesktopHardwarePrefs(storage).turnstileIp).toBe("10.1.2.3");
  });

  it("returns empty object on invalid JSON", () => {
    expect(loadDesktopHardwarePrefs({ getItem: () => "{" }).turnstileIp).toBeUndefined();
  });
});
