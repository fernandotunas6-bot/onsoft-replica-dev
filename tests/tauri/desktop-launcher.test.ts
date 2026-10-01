import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

function launcher(fetch: ReturnType<typeof vi.fn>) {
  let connect: () => Promise<void> = async () => {};
  const button = {
    disabled: false,
    textContent: "Abrir SIGA",
    addEventListener: (_: string, fn: typeof connect) => {
      connect = fn;
    },
  };
  const status = { textContent: "" };
  const assign = vi.fn();
  vm.runInNewContext(readFileSync("desktop/launcher.js", "utf8"), {
    document: { getElementById: (id: string) => (id === "connect" ? button : status) },
    fetch,
    AbortSignal,
    window: { location: { assign } },
  });
  return { button, status, assign, connect: () => connect() };
}

describe("packaged desktop launcher", () => {
  it("retains a usable local screen when offline", async () => {
    const app = launcher(vi.fn().mockRejectedValue(new Error("offline")));
    await app.connect();
    expect(app.assign).not.toHaveBeenCalled();
    expect(app.button.disabled).toBe(false);
    expect(app.status.textContent).toContain("Verifique a Internet");
  });
  it("opens only the exact school portal after transport succeeds", async () => {
    const fetch = vi.fn().mockResolvedValue({ type: "opaque" });
    const app = launcher(fetch);
    await app.connect();
    expect(fetch.mock.calls[0][0]).toBe("https://portal-siga.com");
    expect(app.assign).toHaveBeenCalledWith("https://portal-siga.com");
  });
});
