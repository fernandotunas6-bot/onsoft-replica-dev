// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTeacherNavList } from "@/features/intelligence/teacher-context-lookup";

/** Os professores para confirmar `?professor=` só se pedem a quem gere o Pedagógico. */

const state = vi.hoisted(() => ({
  role: "Secretaria",
  grants: {} as Record<string, string>,
  listTeachers: vi.fn(async () => [{ id: "t1", full_name: "João Mendes" }]),
}));

vi.mock("@/features/people/server", () => ({ listTeachers: state.listTeachers }));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({ role: state.role, grants: state.grants, schoolId: "school-a" }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  state.role = "Secretaria";
  state.grants = {};
  state.listTeachers.mockClear();
});

describe("useTeacherNavList", () => {
  it("pede a lista quando a URL traz um professor e a conta gere o Pedagógico", async () => {
    const { result } = renderHook(() => useTeacherNavList({ enabled: true }), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(state.listTeachers).toHaveBeenCalledTimes(1);
  });

  it("sem professor na URL, nada é pedido", () => {
    const { result } = renderHook(() => useTeacherNavList({ enabled: false }), { wrapper });
    expect(result.current).toEqual([]);
    expect(state.listTeachers).not.toHaveBeenCalled();
  });

  it("o professor e quem só lê o Pedagógico não a pedem", () => {
    state.role = "Professor";
    renderHook(() => useTeacherNavList({ enabled: true }), { wrapper });
    state.role = "Secretaria";
    state.grants = { pedagogica: "Leitura" };
    renderHook(() => useTeacherNavList({ enabled: true }), { wrapper });
    expect(state.listTeachers).not.toHaveBeenCalled();
  });
});
