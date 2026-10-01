// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

function launcher(fetch: ReturnType<typeof vi.fn>, invoke?: ReturnType<typeof vi.fn>) {
  document.documentElement.innerHTML = readFileSync("desktop/index.html", "utf8").replace(
    /<!doctype html>/i,
    "",
  );
  const assign = vi.fn();
  const open = vi.fn();
  const clipboard = { writeText: vi.fn().mockRejectedValue(new Error("unavailable")) };
  vm.runInNewContext(readFileSync("desktop/launcher.js", "utf8"), {
    document,
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    navigator: { clipboard },
    localStorage: { getItem: () => null, setItem: vi.fn() },
    window: {
      location: { assign },
      open,
      matchMedia: () => ({ matches: false }),
      __TAURI__: invoke ? { core: { invoke } } : undefined,
    },
  });
  const element = (id: string) => document.getElementById(id)!;
  const click = (id: string) => element(id).dispatchEvent(new MouseEvent("click"));
  return { assign, open, clipboard, element, click };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("packaged desktop launcher", () => {
  it("retains a usable local screen when offline", async () => {
    const app = launcher(vi.fn().mockRejectedValue(new Error("offline")));
    app.click("connect");
    await vi.waitFor(() =>
      expect(app.element("status").textContent).toContain("Verifique a Internet"),
    );
    expect(app.assign).not.toHaveBeenCalled();
    expect((app.element("connect") as HTMLButtonElement).disabled).toBe(false);
  });
  it("opens only the exact school portal after transport succeeds", async () => {
    const fetch = vi.fn().mockResolvedValue({ type: "opaque" });
    const app = launcher(fetch);
    app.click("connect");
    await vi.waitFor(() => expect(app.assign).toHaveBeenCalledWith("https://portal-siga.com"));
    expect(fetch.mock.calls[0][0]).toBe("https://portal-siga.com");
  });
  it("cancels and ignores a late result without navigating", async () => {
    let resolve: (value: unknown) => void = () => {};
    const fetch = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const app = launcher(fetch);
    app.click("connect");
    app.click("connect");
    expect(fetch).toHaveBeenCalledTimes(1);
    app.click("cancel");
    resolve({ type: "opaque" });
    await Promise.resolve();
    await Promise.resolve();
    expect(app.element("connection-title").textContent).toBe("Verificação cancelada");
    expect(app.assign).not.toHaveBeenCalled();
  });
  it("discards an old cancelled operation when a new check has started", async () => {
    const resolve: Array<(value: unknown) => void> = [];
    const fetch = vi.fn(
      () =>
        new Promise((done) => {
          resolve.push(done);
        }),
    );
    const app = launcher(fetch);
    app.click("connect");
    app.click("cancel");
    app.click("diagnose");
    resolve[0]({ type: "opaque" });
    await Promise.resolve();
    await Promise.resolve();
    expect((app.element("connect") as HTMLButtonElement).disabled).toBe(true);
    resolve[1]({ type: "opaque" });
    await vi.waitFor(() =>
      expect(app.element("connection-title").textContent).toBe("Ligação disponível"),
    );
    expect(app.assign).not.toHaveBeenCalled();
  });
  it("reports timeout and re-enables controls", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const app = launcher(fetch);
    app.click("connect");
    await vi.advanceTimersByTimeAsync(8000);
    expect(app.element("connection-title").textContent).toContain("não respondeu a tempo");
    expect((app.element("connect") as HTMLButtonElement).disabled).toBe(false);
    expect(app.assign).not.toHaveBeenCalled();
  });
  it("diagnoses native hardware without opening the portal", async () => {
    const invoke = vi.fn().mockResolvedValue({
      version: "1.0.0",
      os_type: "windows",
      arch: "x86_64",
      daemon_online: false,
      daemon_message: "Daemon SIGA não iniciado",
    });
    const app = launcher(vi.fn().mockResolvedValue({}), invoke);
    app.click("diagnose");
    await vi.waitFor(() =>
      expect(app.element("daemon-detail").textContent).toContain("não iniciado"),
    );
    expect(invoke).toHaveBeenCalledWith("get_desktop_diagnostics");
    expect(app.assign).not.toHaveBeenCalled();
  });
  it("does not fall back to browser pop-ups after a native opener failure", async () => {
    const app = launcher(vi.fn(), vi.fn().mockRejectedValue("denied"));
    app.click("browser");
    await vi.waitFor(() =>
      expect(app.element("connection-title").textContent).toContain("Não foi possível abrir"),
    );
    expect(app.open).not.toHaveBeenCalled();
  });
  it("offers a manual copy when clipboard access is unavailable", async () => {
    const app = launcher(vi.fn());
    app.click("copy");
    await vi.waitFor(() => expect(app.element("report").hidden).toBe(false));
    expect(app.element("report").textContent).toContain("Versão: 1.0.0");
    expect(app.element("copy-status").textContent).toContain("Seleccione e copie");
  });
  it("changes theme without affecting the connection state", () => {
    const app = launcher(vi.fn());
    app.click("theme");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(app.element("connection-title").textContent).toBe("Ligação por verificar");
  });
});
