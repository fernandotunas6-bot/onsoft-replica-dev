// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let now = 0;
let supervisor: typeof import("@/lib/performance-supervisor");
const clients: QueryClient[] = [];
const detachments: Array<() => void> = [];
function attach() {
  const client = new QueryClient();
  clients.push(client);
  detachments.push(supervisor.attachPerformanceSupervisor(client));
  return client;
}
function query(client: QueryClient) {
  return client.getQueryCache().build(client, { queryKey: ["same-key"] });
}
function visibility(value: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
}
beforeEach(async () => {
  vi.resetModules();
  supervisor = await import("@/lib/performance-supervisor");
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  visibility("visible");
});
afterEach(() => {
  detachments.splice(0).forEach((detach) => detach());
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});
it("mede pedidos iniciados no instante zero", () => {
  const item = query(attach());
  item.setState({ fetchStatus: "fetching" });
  now = 500;
  item.setState({ fetchStatus: "idle", dataUpdatedAt: Date.now() });
  expect(supervisor.getPerfSnapshot()).toMatchObject({ samples: 1, avgQueryMs: 500 });
});
it("a remoção não deixa um início antigo para a mesma chave", () => {
  const client = attach();
  now = 100;
  query(client).setState({ fetchStatus: "fetching" });
  client.clear();
  now = 1000;
  const fresh = query(client);
  fresh.setState({ fetchStatus: "fetching" });
  now = 1200;
  fresh.setState({ fetchStatus: "idle", dataUpdatedAt: Date.now() });
  expect(supervisor.getPerfSnapshot()).toMatchObject({ samples: 1, avgQueryMs: 200 });
});
it("caches distintas não misturam pedidos com a mesma chave", () => {
  const first = query(attach());
  const second = query(attach());
  now = 100;
  first.setState({ fetchStatus: "fetching" });
  now = 200;
  second.setState({ fetchStatus: "fetching" });
  now = 500;
  first.setState({ fetchStatus: "idle", dataUpdatedAt: Date.now() });
  now = 700;
  second.setState({ fetchStatus: "idle", dataUpdatedAt: Date.now() });
  expect(supervisor.getPerfSnapshot()).toMatchObject({ samples: 2, avgQueryMs: 450 });
});
it("descarta medições interrompidas por visibilidade ou pausa de rede", () => {
  const item = query(attach());
  now = 100;
  item.setState({ fetchStatus: "fetching" });
  visibility("hidden");
  visibility("visible");
  now = 900;
  item.setState({ fetchStatus: "idle", dataUpdatedAt: Date.now() });
  expect(supervisor.getPerfSnapshot().samples).toBe(0);
  item.setState({ fetchStatus: "fetching" });
  item.setState({ fetchStatus: "paused" });
  now = 1900;
  item.setState({ fetchStatus: "fetching" });
  now = 2100;
  item.setState({ fetchStatus: "idle", dataUpdatedAt: Date.now() });
  expect(supervisor.getPerfSnapshot()).toMatchObject({ samples: 1, avgQueryMs: 200 });
});
it("desmontar remove os observadores e deixa de registar amostras", () => {
  const remove = vi.spyOn(document, "removeEventListener");
  const item = query(attach());
  now = 100;
  item.setState({ fetchStatus: "fetching" });
  detachments[0]();
  now = 600;
  item.setState({ fetchStatus: "idle", dataUpdatedAt: Date.now() });
  expect(supervisor.getPerfSnapshot().samples).toBe(0);
  expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
});
