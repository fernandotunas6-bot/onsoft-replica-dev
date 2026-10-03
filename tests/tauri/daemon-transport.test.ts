// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import {
  checkPythonHardwareBridgeHealth,
  discoverLocalHardwareDevices,
  saveLocalHardwareAllowlist,
} from "@/lib/tauri-bridge";

afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
});

describe("daemon transport in HTTPS desktop", () => {
  it("reads health through restricted IPC without WebView HTTP", async () => {
    vi.stubGlobal("isTauri", true);
    const invoke = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify({ service: "SIGA Python Hardware Bridge" }),
    });
    mockIPC(invoke);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await checkPythonHardwareBridgeHealth()).toMatchObject({
      online: true,
      service: "SIGA Python Hardware Bridge",
    });
    expect(invoke).toHaveBeenCalledWith("hardware_bridge_request", {
      path: "/health",
      method: "GET",
      body: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not report another local service as the SIGA daemon", async () => {
    vi.stubGlobal("isTauri", true);
    mockIPC(() => ({ status: 200, body: JSON.stringify({ service: "unrelated service" }) }));
    expect(await checkPythonHardwareBridgeHealth()).toMatchObject({ online: false });
  });
  it("never retries a native daemon failure through browser HTTP", async () => {
    vi.stubGlobal("isTauri", true);
    mockIPC(() => {
      throw new Error("offline");
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await discoverLocalHardwareDevices()).ok).toBe(false);
    await expect(saveLocalHardwareAllowlist([])).rejects.toThrow("offline");
    expect(fetch).not.toHaveBeenCalled();
  });
});
