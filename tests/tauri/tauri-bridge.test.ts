import { describe, it, expect } from "vitest";
import { isTauriDesktop, getNativeSystemInfo } from "@/lib/tauri-bridge";

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
