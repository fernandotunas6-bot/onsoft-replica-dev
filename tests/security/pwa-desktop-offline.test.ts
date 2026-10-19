import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/** Service worker com uma CacheStorage em memória (nome → URL → Response). */
function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (request: string | { url: string }) =>
    typeof request === "string" ? request : request.url;
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      put: async (request: string, response: Response) => void store.set(keyOf(request), response),
      match: async (request: string) => store.get(keyOf(request))?.clone(),
      add: async () => undefined,
    };
  };
  const caches = {
    open: vi.fn(open),
    match: vi.fn(async (request: string, options?: { cacheName?: string }) => {
      const names = options?.cacheName ? [options.cacheName] : [...stores.keys()];
      for (const name of names) {
        const hit = stores.get(name)?.get(keyOf(request));
        if (hit) return hit.clone();
      }
      return undefined;
    }),
    keys: async () => [...stores.keys()],
  };
  const fetch = vi.fn(
    async () => new Response("<html>SIGA</html>", { headers: { "Content-Type": "text/html" } }),
  );
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      location: { origin: "https://portal-siga.com" },
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler),
    },
    caches,
    fetch,
    URL,
    Response,
  });
  const message = async (data: unknown) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.get("message")!({ data, waitUntil: (promise: Promise<unknown>) => (done = promise) });
    await done;
  };
  const navigate = async (url: string) => {
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: { method: "GET", mode: "navigate", url },
      respondWith: (value: Promise<Response>) => (response = value),
    });
    return response!;
  };
  return { stores, fetch, message, navigate };
}

const pagesStore = (w: ReturnType<typeof worker>) =>
  [...w.stores.entries()].find(([name]) => name.startsWith("siga-pages-"))?.[1];

describe("páginas sem rede na app desktop", () => {
  it("no navegador, sem a marca do desktop, nenhuma página fica guardada", async () => {
    const w = worker();
    await (await w.navigate("https://portal-siga.com/pedagogica")).text();
    expect(pagesStore(w)?.has("https://portal-siga.com/pedagogica") ?? false).toBe(false);
    await w.message({ type: "SIGA_WARM_PAGES", paths: ["/tesouraria"] });
    expect(w.fetch).toHaveBeenCalledTimes(1);
  });

  it("na app desktop guarda a página aberta e serve-a sem rede", async () => {
    const w = worker();
    await w.message({ type: "SIGA_DESKTOP_OFFLINE" });
    await (await w.navigate("https://portal-siga.com/pedagogica?turma=1")).text();
    expect(pagesStore(w)?.has("https://portal-siga.com/pedagogica")).toBe(true);

    w.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const offline = await w.navigate("https://portal-siga.com/pedagogica");
    expect(await offline.text()).toBe("<html>SIGA</html>");
  });

  it("pré-carrega só caminhos do próprio portal", async () => {
    const w = worker();
    await w.message({
      type: "SIGA_DESKTOP_OFFLINE",
      paths: ["/tesouraria", "//evil.example/x", "https://evil.example/", 42],
    });
    expect(w.fetch).toHaveBeenCalledTimes(1);
    expect(pagesStore(w)?.has("https://portal-siga.com/tesouraria")).toBe(true);
  });

  it("não guarda respostas que não são HTML nem erros", async () => {
    const w = worker();
    await w.message({ type: "SIGA_DESKTOP_OFFLINE" });
    w.fetch.mockResolvedValueOnce(
      new Response("{}", { headers: { "Content-Type": "application/json" } }),
    );
    await (await w.navigate("https://portal-siga.com/api")).text();
    w.fetch.mockResolvedValueOnce(
      new Response("erro", { status: 500, headers: { "Content-Type": "text/html" } }),
    );
    await (await w.navigate("https://portal-siga.com/alunos")).text();
    expect(pagesStore(w)?.has("https://portal-siga.com/api")).toBe(false);
    expect(pagesStore(w)?.has("https://portal-siga.com/alunos")).toBe(false);
  });
});
