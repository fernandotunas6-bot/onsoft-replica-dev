// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  currentAccountMock,
  resetCurrentAccount,
  setCurrentAccount,
  supabaseClientMock,
  routeComponentOf,
} from "../routes/_harness";

const state = vi.hoisted(() => ({ commit: vi.fn(), warm: vi.fn() }));
vi.mock("@tanstack/react-router", async () =>
  (await import("../routes/_harness")).reactRouterMock(),
);
vi.mock("@/components/layout/AppShell", async () =>
  (await import("../routes/_harness")).appShellMock(),
);
vi.mock("@/integrations/supabase/client", async () => supabaseClientMock());
vi.mock("@/features/auth/use-current-account", () => currentAccountMock());
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ school: null, selectedYearLabel: "Ano Lectivo 2026" }),
}));
vi.mock("@/features/integrations/use-installed-integrations", () => ({
  useInstalledIntegrations: () => ({ hasCapability: () => false }),
}));
vi.mock("@/features/intelligence/entity-focus-context", () => ({
  useDeclareEntityFocus: () => {},
}));
vi.mock("@/features/dashboard/server", () => ({
  getDashboardOverview: () => new Promise(() => {}),
}));
vi.mock("@/lib/warm-charts", () => ({ warmDashboardCharts: state.warm }));
vi.mock("@/features/dashboard/portals/AdminPortalDashboard", () => ({
  AdminPortalDashboard: ({ now, greeting }: { now: Date | null; greeting: string }) => {
    useEffect(() => {
      state.commit({ now, greeting });
    });
    return null;
  },
}));
vi.mock("@/features/dashboard/portals/StudentPortalDashboard", () => ({
  StudentPortalDashboard: () => null,
}));
vi.mock("@/features/dashboard/portals/GuardianPortalDashboard", () => ({
  GuardianPortalDashboard: () => null,
}));
vi.mock("@/features/dashboard/portals/TeacherPortalDashboard", () => ({
  TeacherPortalDashboard: () => null,
}));

let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 19, 10, 15));
  vi.clearAllMocks();
  resetCurrentAccount();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});
async function mount() {
  const { Route } = await import("@/routes/index");
  const Page = routeComponentOf({ Route });
  const view = render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  await act(() => vi.advanceTimersByTimeAsync(0));
  return view;
}
async function tick(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}
function latest() {
  return state.commit.mock.calls.at(-1)?.[0] as { now: Date; greeting: string };
}
it("não redesenha o portal administrativo 60 vezes num minuto sem mudança visível", async () => {
  await mount();
  state.commit.mockClear();
  for (let second = 0; second < 60; second++) await tick(1000);
  expect(state.commit).not.toHaveBeenCalled();
});
it.each(["Aluno", "Professor", "Encarregado"] as const)(
  "não aquece gráficos administrativos para %s",
  async (role) => {
    setCurrentAccount({ role });
    await mount();
    expect(state.warm).not.toHaveBeenCalled();
  },
);
it("preserva as saudações ao meio-dia e às 19h, e a data à meia-noite", async () => {
  vi.setSystemTime(new Date(2026, 9, 19, 11, 59, 59));
  await mount();
  expect(latest().greeting).toBe("Bom dia");
  await tick(1000);
  expect(latest().greeting).toBe("Boa tarde");
  vi.setSystemTime(new Date(2026, 9, 19, 18, 59, 59));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick(1000);
  expect(latest().greeting).toBe("Boa noite");
  vi.setSystemTime(new Date(2026, 9, 19, 23, 59, 59));
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick(1000);
  expect(latest().now.getDate()).toBe(20);
  expect(latest().greeting).toBe("Bom dia");
});
