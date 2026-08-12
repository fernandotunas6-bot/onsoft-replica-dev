import { describe, expect, it, beforeEach, vi } from "vitest";
import { consumeSettingsOpen, requestSettingsOpen } from "@/lib/settings-deep-link";

describe("settings deep link", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    });
  });

  it("stores and consumes a panel id once", () => {
    requestSettingsOpen("integracoes");
    expect(consumeSettingsOpen()).toBe("integracoes");
    expect(consumeSettingsOpen()).toBeUndefined();
  });

  it("opens the root panel when no id is passed", () => {
    requestSettingsOpen();
    expect(consumeSettingsOpen()).toBeUndefined();
  });
});
