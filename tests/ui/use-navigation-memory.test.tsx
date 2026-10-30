// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { navMemoryOwner, toggleFavoriteNav, touchRecentNav } from "@/lib/navigation-memory";
import { useNavigationMemory } from "@/features/auth/use-navigation-memory";

/**
 * Recentes e favoritos no `AppShell` e na paleta de comandos: da escola activa,
 * e só os destinos que a conta ainda pode abrir.
 */

const state = vi.hoisted(() => ({
  pathname: "/",
  role: "Secretaria",
  schoolId: "school-a",
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (value: unknown) => unknown }) =>
    select({ location: { pathname: state.pathname, search: {} } }),
}));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({
    id: "user-1",
    email: "conta@escola.ao",
    role: state.role,
    grants: {},
    schoolId: state.schoolId,
  }),
}));
vi.mock("@/features/saas/tenant-context", () => ({ useTenant: () => ({ activePlan: null }) }));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  state.pathname = "/";
  state.role = "Secretaria";
  state.schoolId = "school-a";
});

describe("useNavigationMemory", () => {
  it("mostra os recentes e favoritos da escola activa, não os da outra", () => {
    toggleFavoriteNav(navMemoryOwner("user-1", "school-a"), { path: "/alunos", label: "Alunos" });
    toggleFavoriteNav(navMemoryOwner("user-1", "school-b"), {
      path: "/calendario",
      label: "Calendário",
    });
    const { result, rerender } = renderHook(() => useNavigationMemory());
    expect(result.current.favorites.map((item) => item.path)).toEqual(["/alunos"]);

    state.schoolId = "school-b";
    rerender();
    expect(result.current.favorites.map((item) => item.path)).toEqual(["/calendario"]);
  });

  it("a página aberta entra nos recentes da escola activa", () => {
    state.pathname = "/alunos";
    const { result } = renderHook(() => useNavigationMemory());
    expect(result.current.recents.map((item) => item.path)).toEqual(["/alunos"]);
  });

  it("um destino que a conta deixou de poder abrir não se oferece", () => {
    const owner = navMemoryOwner("user-1", "school-a");
    touchRecentNav(owner, { path: "/configuracoes", label: "Definições" });
    toggleFavoriteNav(owner, { path: "/configuracoes", label: "Definições" });
    toggleFavoriteNav(owner, { path: "/alunos", label: "Alunos" });
    state.role = "Encarregado";
    const { result } = renderHook(() => useNavigationMemory());
    expect(result.current.recents.map((item) => item.path)).not.toContain("/configuracoes");
    expect(result.current.favorites.map((item) => item.path)).toEqual(["/alunos"]);
  });
});
