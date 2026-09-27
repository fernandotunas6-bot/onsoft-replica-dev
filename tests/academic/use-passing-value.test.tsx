// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  rule: null as number | null,
  settings: null as number | null,
}));

vi.mock("@/features/academic/assessment-models", () => ({
  getActivePassingValue: () => Promise.resolve({ passingValue: state.rule }),
}));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: state.settings == null ? null : { passing_grade: state.settings },
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

async function passingWith(rule: number | null, settings: number | null) {
  state.rule = rule;
  state.settings = settings;
  const { usePassingValue } = await import("@/features/academic/use-passing-value");
  const { result } = renderHook(() => usePassingValue(), { wrapper });
  return result;
}

describe("nota de aprovação nos ecrãs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("o modelo de avaliação em vigor manda", async () => {
    const result = await passingWith(12, 10);
    await waitFor(() => expect(result.current).toBe(12));
  });

  it("sem modelo, usa a das Definições da escola", async () => {
    const result = await passingWith(null, 9.5);
    await waitFor(() => expect(result.current).toBe(9.5));
  });

  it("sem nenhuma, usa a da escala angolana", async () => {
    const result = await passingWith(null, null);
    await waitFor(() => expect(result.current).toBe(10));
  });
});
