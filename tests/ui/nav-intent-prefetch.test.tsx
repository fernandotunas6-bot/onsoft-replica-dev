// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavLinkRow } from "@/components/layout/NavItem";

const state = vi.hoisted(() => ({
  prefetch: vi.fn(),
  schoolId: "school-A",
  selectedYearId: "year-A",
}));
vi.mock("@/lib/route-data-prefetch", () => ({ prefetchRouteData: state.prefetch }));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: { id: state.schoolId },
    selectedYearId: state.selectedYearId,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    to,
  }: {
    children: ReactNode;
    to: string;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  }) => (
    <a
      href={to}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {children}
    </a>
  ),
}));
let client: QueryClient;
function view(to = "/pedagogica") {
  return (
    <QueryClientProvider client={client}>
      <NavLinkRow to={to} label="Área pedagógica" />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.schoolId = "school-A";
  state.selectedYearId = "year-A";
  client = new QueryClient();
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});

describe("intenção de navegação sem trabalho no primeiro toque", () => {
  it("um item reutilizado para outro destino cancela a intenção anterior", async () => {
    const { rerender } = render(view());
    fireEvent.mouseEnter(screen.getByRole("link"));
    rerender(view("/alunos"));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.prefetch).not.toHaveBeenCalled();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/alunos");
  });
  it("passar rapidamente nos itens não lança pedidos", async () => {
    render(view());
    const link = screen.getByRole("link");
    fireEvent.mouseEnter(link);
    await act(() => vi.advanceTimersByTimeAsync(79));
    fireEvent.mouseLeave(link);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.prefetch).not.toHaveBeenCalled();
  });

  it("uma intenção estável aquece o contexto certo sem alterar o destino", async () => {
    render(view());
    const link = screen.getByRole("link");
    fireEvent.mouseEnter(link);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(link.getAttribute("href")).toBe("/pedagogica");
    expect(state.prefetch).toHaveBeenCalledWith(client, "/pedagogica", {
      schoolId: "school-A",
      academicYearId: "year-A",
      search: undefined,
    });
  });

  it("o teclado aquece e perder o foco cancela uma intenção ainda pendente", async () => {
    render(view());
    const link = screen.getByRole("link");
    fireEvent.focus(link);
    fireEvent.blur(link);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.prefetch).not.toHaveBeenCalled();
    fireEvent.focus(link);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.prefetch).toHaveBeenCalledOnce();
  });

  it("trocar de escola ou ano cancela a intenção anterior", async () => {
    const { rerender } = render(view());
    fireEvent.mouseEnter(screen.getByRole("link"));
    state.schoolId = "school-B";
    state.selectedYearId = "year-B";
    rerender(view());
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.prefetch).not.toHaveBeenCalled();
    fireEvent.mouseEnter(screen.getByRole("link"));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.prefetch).toHaveBeenCalledWith(client, "/pedagogica", {
      schoolId: "school-B",
      academicYearId: "year-B",
      search: undefined,
    });
  });

  it("desmontar ou poupar dados não deixa um pedido atrasado", async () => {
    const { unmount } = render(view());
    fireEvent.mouseEnter(screen.getByRole("link"));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.prefetch).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    render(view());
    fireEvent.focus(screen.getByRole("link"));
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(state.prefetch).not.toHaveBeenCalled();
  });
});
