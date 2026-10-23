// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentPropsWithRef } from "react";
import { MoreHub } from "@/components/mobile/MoreHub";
const state = vi.hoisted(() => ({
  pathname: "/faturas",
  search: {} as Record<string, unknown>,
  role: "Administrador",
  schoolId: "school-a",
}));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({
    role: state.role,
    grants: {},
    schoolId: state.schoolId,
    schoolName: "Escola de demonstração",
  }),
}));
vi.mock("@/features/saas/tenant-context", () => ({ useTenant: () => ({ activePlan: null }) }));
vi.mock("@/features/auth/use-sign-out", () => ({
  useSignOut: () => ({ signOut: vi.fn(), signingOut: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: state.pathname, search: state.search } }),
  Link: ({
    to,
    search,
    ...props
  }: ComponentPropsWithRef<"a"> & { to: string; search?: unknown }) => (
    <a
      {...props}
      href={to}
      data-search={JSON.stringify(search)}
      onClick={(event) => {
        event.preventDefault();
        props.onClick?.(event);
      }}
    />
  ),
}));
afterEach(() => {
  cleanup();
  state.pathname = "/faturas";
  state.role = "Administrador";
  state.schoolId = "school-a";
  state.search = {};
});
describe("menu mobile contextual", () => {
  it("mostra o módulo activo, permite mudar de área e fecha ao escolher um destino", () => {
    const close = vi.fn();
    render(<MoreHub open onOpenChange={close} />);
    expect(
      screen.getByRole("link", { name: "Faturas e Recibos" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByRole("link", { name: "Relatórios Financeiros" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Matricular Aluno" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    expect(screen.queryByRole("link", { name: "Faturas e Recibos" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Secretaria" }));
    fireEvent.click(screen.getByRole("link", { name: "Matricular Aluno" }));
    expect(close).toHaveBeenCalledWith(false);
  });
  it("pesquisa noutras áreas sem perder os parâmetros de navegação", async () => {
    render(<MoreHub open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Matricular" } });
    const link = await screen.findByRole("link", { name: "Matricular Aluno" });
    expect(JSON.parse(link.getAttribute("data-search")!)).toEqual({ action: "matricular" });
  });
  it("retira áreas administrativas e repõe o contexto ao mudar de perfil", async () => {
    const view = render(<MoreHub open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Todas as áreas" }));
    state.role = "Aluno";
    state.pathname = "/pedagogica";
    state.search = { tab: "presencas" };
    view.rerender(<MoreHub open onOpenChange={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Secretaria" })).toBeNull());
    expect(screen.queryByRole("link", { name: "Configurações da Escola" })).toBeNull();
    expect(screen.getByRole("link", { name: "Frequência" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
});
