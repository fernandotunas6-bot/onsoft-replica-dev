import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const put = vi.fn();
  const caches = {
    open: vi.fn(async () => ({ put })),
    match: vi.fn(async () => undefined),
  };
  const fetch = vi.fn(async () => new Response("personal data"));
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      location: { origin: "https://school.example" },
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler),
    },
    caches,
    fetch,
    URL,
    Response,
  });
  return { handlers, caches, fetch, put };
}

describe("privacy on shared PWA devices", () => {
  it("never stores authenticated navigation HTML", async () => {
    const w = worker();
    const respondWith = vi.fn();
    w.handlers.get("fetch")!({
      request: { method: "GET", mode: "navigate", url: "https://school.example/alunos" },
      respondWith,
    });
    expect(await respondWith.mock.calls[0]![0]).toBeInstanceOf(Response);
    expect(w.caches.open).not.toHaveBeenCalled();
    expect(w.put).not.toHaveBeenCalled();
  });

  it("does not intercept private or external student photos", () => {
    const w = worker();
    for (const url of [
      "https://school.example/api/photos/student",
      "https://project.supabase.co/storage/v1/object/sign/student-photos/photo",
    ]) {
      const respondWith = vi.fn();
      w.handlers.get("fetch")!({
        request: { method: "GET", destination: "image", url },
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    }
  });

  it("respects no-store even for an asset URL", async () => {
    const w = worker();
    w.fetch.mockResolvedValue(
      new Response("private", { headers: { "Cache-Control": "no-store" } }),
    );
    const respondWith = vi.fn();
    w.handlers.get("fetch")!({
      request: {
        method: "GET",
        destination: "script",
        url: "https://school.example/assets/app.js",
      },
      respondWith,
    });
    await respondWith.mock.calls[0]![0];
    expect(w.put).not.toHaveBeenCalled();
  });
});
