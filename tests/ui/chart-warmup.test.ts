// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  idle: [] as Array<() => void>,
  loaded: vi.fn(),
  fail: false,
  wait: undefined as Promise<void> | undefined,
}));
vi.mock("@/lib/preload", async (original) => ({
  ...(await original<typeof import("@/lib/preload")>()),
  onIdle: (callback: () => void) => state.idle.push(callback),
}));
let warm: typeof import("@/lib/warm-charts");
async function flush() {
  state.idle.splice(0).forEach((callback) => callback());
  await vi.dynamicImportSettled();
}
function connection(value: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, "connection", { configurable: true, value });
}
beforeEach(async () => {
  vi.resetModules();
  state.idle = [];
  state.loaded.mockClear();
  state.fail = false;
  state.wait = undefined;
  // resetModules não limpa os exports de factories mockadas: cada ensaio precisa
  // de um módulo novo, incluindo o que simula uma falha de import.
  for (const [path, name] of [
    ["@/features/dashboard/DashboardCharts", "dashboard"],
    ["@/features/academic/PedagogicaNotasCharts", "pedagogica"],
    ["@/features/finance/FinanceiroCashChart", "cash"],
    ["@/features/finance/RelatoriosFinanceirosCategoryCharts", "categories"],
    ["@/features/academic/RelatoriosAcademicosCharts", "reports"],
  ]) {
    vi.doMock(path, async () => {
      state.loaded(name);
      if (name === "dashboard") {
        if (state.fail) throw new Error("Rede indisponível");
        await state.wait;
      }
      return {};
    });
  }
  connection(undefined);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  warm = await import("@/lib/warm-charts");
});
afterEach(() => connection(undefined));
it("junta 100 intenções financeiras e não volta a agendar depois de carregar", async () => {
  for (let index = 0; index < 100; index++) warm.warmFinanceCharts();
  expect(state.idle).toHaveLength(1);
  await flush();
  expect(state.loaded.mock.calls.map(([name]) => name).sort()).toEqual(["cash", "categories"]);
  warm.warmFinanceCharts();
  expect(state.idle).toHaveLength(0);
});
it("não agenda outra carga enquanto o import ainda está em curso", async () => {
  let release = () => {};
  state.wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  warm.warmDashboardCharts();
  state.idle.shift()!();
  await vi.waitFor(() => expect(state.loaded).toHaveBeenCalledWith("dashboard"));
  for (let index = 0; index < 100; index++) warm.warmDashboardCharts();
  expect(state.idle).toHaveLength(0);
  release();
  await vi.dynamicImportSettled();
  warm.warmDashboardCharts();
  expect(state.idle).toHaveLength(0);
});
it.each([{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }])(
  "não antecipa gráficos com ligação limitada: %j",
  async (limited) => {
    connection(limited);
    warm.warmDashboardCharts();
    expect(state.idle).toHaveLength(0);
    connection(undefined);
    warm.warmDashboardCharts();
    await flush();
    expect(state.loaded).toHaveBeenCalledWith("dashboard");
  },
);
it("reavalia ligação e visibilidade antes de começar o import", async () => {
  warm.warmReportCharts();
  connection({ saveData: true });
  await flush();
  expect(state.loaded).not.toHaveBeenCalled();
  connection(undefined);
  warm.warmReportCharts();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  await flush();
  expect(state.loaded).not.toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  warm.warmReportCharts();
  await flush();
  expect(state.loaded).toHaveBeenCalledWith("reports");
});
it("não agenda em segundo plano e conserva os quatro grupos independentes", async () => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  warm.warmPedagogicaCharts();
  expect(state.idle).toHaveLength(0);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  warm.warmDashboardCharts();
  warm.warmPedagogicaCharts();
  warm.warmFinanceCharts();
  warm.warmReportCharts();
  expect(state.idle).toHaveLength(4);
  await flush();
  expect(state.loaded).toHaveBeenCalledTimes(5);
});
it("uma falha especulativa não rejeita sem tratamento nem bloqueia nova intenção", async () => {
  state.fail = true;
  warm.warmDashboardCharts();
  await flush();
  warm.warmDashboardCharts();
  expect(state.idle).toHaveLength(1);
  state.idle = [];
});
