// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { triggerTurnstileRelay, printThermalReceiptNative } from "@/lib/tauri-bridge";
import { openExternalLink } from "@/lib/desktop-utils";

afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("native physical command failures", () => {
  it("does not repeat failed native actions through HTTP", async () => {
    vi.stubGlobal("isTauri", true);
    mockIPC(() => ({ success: false, message: "offline", bytes_sent: 0 }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(triggerTurnstileRelay({ ipAddress: "192.168.1.20" })).rejects.toThrow("offline");
    await expect(
      printThermalReceiptNative({ printerIp: "192.168.1.20", receiptText: "Recibo 42" }),
    ).rejects.toThrow("offline");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not open a browser window after native opener failure", async () => {
    vi.stubGlobal("isTauri", true);
    mockIPC(() => {
      throw new Error("denied");
    });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await expect(openExternalLink("https://onsoft.ao")).rejects.toThrow("denied");
    expect(open).not.toHaveBeenCalled();
  });

  it("retains device allowlist checks using the native daemon transport", async () => {
    vi.stubGlobal("isTauri", true);
    const invoke = vi
      .fn()
      .mockReturnValue({ status: 403, body: JSON.stringify({ error: "not allowed" }) });
    mockIPC(invoke);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      triggerTurnstileRelay({ ipAddress: "192.168.1.20", deviceId: "serial:test" }),
    ).rejects.toThrow("not allowed");
    expect(invoke).toHaveBeenCalledWith(
      "hardware_bridge_request",
      expect.objectContaining({ path: "/hardware/turnstile/open", method: "POST" }),
    );
    expect(JSON.parse(invoke.mock.calls[0][1].body).device_id).toBe("serial:test");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects simulated daemon results and transmits the exact receipt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ printer_result: { status: "simulated" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      printThermalReceiptNative({ printerIp: "127.0.0.1", receiptText: "Recibo 42" }),
    ).rejects.toThrow();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).receipt_text).toBe("Recibo 42");
  });
});
