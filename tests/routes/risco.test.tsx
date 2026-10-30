// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetCurrentAccount,
  resetRouteLocation,
  routeComponentOf,
  setRouteSearch,
} from "./_harness";

/**
 * `/pedagogica/risco?turma=` (menu da turma): os alertas e a análise abrem na
 * turma da URL; sem ela, ou com uma que a escola não devolve, na primeira.
 */

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock(),
);
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ selectedYearId: null }),
}));
vi.mock("@/features/ai-assist/ai-assist.functions", () => ({ analyzeStudentRisk: vi.fn() }));
vi.mock("@/features/ai-assist/risk-followup.functions", () => ({ saveRiskAnalysis: vi.fn() }));
vi.mock("@/features/ai-assist/RiskFollowup", () => ({
  RiskFollowup: () => null,
  riskCasesKey: ["risk", "cases"],
}));
const earlyWarnings = vi.fn();
vi.mock("@/features/academic/EarlyWarningsPanel", () => ({
  EarlyWarningsPanel: (props: { classGroupId: string }) => {
    earlyWarnings(props.classGroupId);
    return null;
  },
}));

const TURMA_A = "11111111-1111-4111-8111-111111111111";
const TURMA_B = "22222222-2222-4222-8222-222222222222";
vi.mock("@/features/academic/server", () => ({
  listPedagogicalWorkspace: async () => ({
    classGroups: [
      { id: TURMA_A, name: "10ª A" },
      { id: TURMA_B, name: "10ª B" },
    ],
    termGrades: [],
  }),
}));

let Page: ComponentType;

beforeAll(async () => {
  Page = routeComponentOf(await import("@/routes/pedagogica_.risco"));
}, 60_000);

afterEach(() => {
  cleanup();
  earlyWarnings.mockClear();
  resetRouteLocation();
  resetCurrentAccount();
});

describe("/pedagogica/risco?turma=", () => {
  it("abre na turma da URL", async () => {
    setRouteSearch({ turma: TURMA_B });
    renderRoute(Page);
    const select = (await screen.findByLabelText("Turma")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(TURMA_B));
    expect(earlyWarnings).toHaveBeenLastCalledWith(TURMA_B);
  });

  it("sem turma, ou com uma que a escola não devolve, abre na primeira", async () => {
    setRouteSearch({ turma: "33333333-3333-4333-8333-333333333333" });
    renderRoute(Page);
    const select = (await screen.findByLabelText("Turma")) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(TURMA_A));
  });
});
