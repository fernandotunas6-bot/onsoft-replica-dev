import { describe, it, expect, vi } from "vitest";
import { isTauriDesktop, getNativeSystemInfo } from "@/lib/tauri-bridge";
import {
  isTauriDesktop as isTauriDesktopUtil,
  getSystemInfo,
  pulseTurnstileRelay,
  printThermalReceiptNative,
  notifyNative,
  openExternalLink,
} from "@/lib/desktop-utils";
import { createNativeStrongholdStore } from "@/lib/native-stronghold";
import { checkNativeUpdate, installNativeUpdate } from "@/lib/native-updater";

describe("Tauri 2 Desktop Bridge", () => {
  it("detects browser environment fallback gracefully when not in Tauri window", () => {
    expect(isTauriDesktop()).toBe(false);
  });

  it("returns fallback system info in web browser context", async () => {
    const info = await getNativeSystemInfo();
    expect(info.is_desktop_native).toBe(false);
    expect(["windows", "macos"]).toContain(info.os_type);
  });
});

describe("Desktop Utils & Native Hardware Fallbacks", () => {
  it("detects desktop runtime gracefully", () => {
    expect(isTauriDesktopUtil()).toBe(false);
  });

  it("returns system info in web fallback mode", async () => {
    const info = await getSystemInfo();
    expect(info.is_desktop_native).toBe(false);
  });

  it("simulates turnstile relay in web browser mode", async () => {
    const result = await pulseTurnstileRelay("192.168.1.100", 1, "entry");
    expect(result.success).toBe(true);
    expect(result.message).toContain("Modo Web: Simulação");
    expect(result.bytes_sent).toBe(5);
  });

  it("simulates thermal receipt printing in web browser mode", async () => {
    const result = await printThermalReceiptNative("192.168.1.200", "SIGA - Recibo de Teste");
    expect(result.success).toBe(true);
    expect(result.message).toContain("Modo Web: Simulação");
    expect(result.bytes_sent).toBeGreaterThan(0);
  });

  it("skips native notification when not running inside Tauri", async () => {
    const sent = await notifyNative("Teste SIGA", "Corpo da notificação");
    expect(sent).toBe(false);
  });

  it("falls back to window.open for external links in browser mode", async () => {
    const mockOpen = vi.fn();
    const hadWindow = "window" in globalThis;
    const originalWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window?: unknown }).window = { open: mockOpen };

    try {
      await openExternalLink("https://onsoft.ao");
      expect(mockOpen).toHaveBeenCalledWith("https://onsoft.ao", "_blank", "noopener,noreferrer");
    } finally {
      if (hadWindow) {
        (globalThis as unknown as { window?: unknown }).window = originalWindow;
      } else {
        delete (globalThis as unknown as { window?: unknown }).window;
      }
    }
  });
});

describe("Native Stronghold & Updater Guards", () => {
  it("prevents opening stronghold outside native desktop", async () => {
    await expect(createNativeStrongholdStore("super-secret")).rejects.toThrow(
      "Stronghold só está disponível no runtime nativo do SIGA",
    );
  });

  it("validates empty password guard for stronghold", async () => {
    await expect(createNativeStrongholdStore("   ")).rejects.toThrow();
  });

  it("returns unconfigured update status outside native desktop", async () => {
    const updateInfo = await checkNativeUpdate();
    expect(updateInfo.configured).toBe(false);
    expect(updateInfo.available).toBe(false);
  });

  it("returns false for installNativeUpdate outside native desktop", async () => {
    const installed = await installNativeUpdate();
    expect(installed).toBe(false);
  });
});
