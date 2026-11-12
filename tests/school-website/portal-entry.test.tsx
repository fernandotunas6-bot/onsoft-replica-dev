/** @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
const mocks = vi.hoisted(() => ({
  hint: "escola-b" as string | undefined,
  switchSchool: vi.fn(),
  schoolId: "school-a",
  schools: [{ schoolId: "school-b", schoolSlug: "escola-b", isActive: true }],
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useSearch: () => ({ escola: mocks.hint }),
  }),
}));
vi.mock("@/routes/index", () => ({ Dashboard: () => <p>Painel autenticado</p> }));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({
    schools: mocks.schools,
    schoolId: mocks.schoolId,
    setActiveSchoolId: mocks.switchSchool,
    profile: { isPending: false },
  }),
}));
import { Route } from "@/routes/portal";

// Em cache fria a avaliação dos módulos e a primeira renderização consomem o
// orçamento de 5s por omissão, e o custo cai em quem correr primeiro. Mesmo
// limite já usado nos ficheiros de tests/routes.
vi.setConfig({ testTimeout: 20_000 });
const Portal = (Route as unknown as { component: ComponentType }).component;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hint = "escola-b";
  mocks.schoolId = "school-a";
  mocks.schools = [{ schoolId: "school-b", schoolSlug: "escola-b", isActive: true }];
});
afterEach(cleanup);
describe("entrada no portal a partir do website escolar", () => {
  it("só escolhe a escola quando a conta tem uma membership activa", () => {
    render(<Portal />);
    expect(mocks.switchSchool).toHaveBeenCalledWith("school-b");
    expect(screen.queryByText("Painel autenticado")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });
  it("um parâmetro de outra escola nunca abre o painel da escola anterior", () => {
    mocks.schools = [];
    render(<Portal />);
    expect(screen.getByRole("heading").textContent).toMatch(/não tem acesso/);
    expect(screen.queryByText("Painel autenticado")).toBeNull();
    expect(mocks.switchSchool).not.toHaveBeenCalled();
  });
  it("uma conta já na escola correcta abre o mesmo dashboard do SIGA", () => {
    mocks.schoolId = "school-b";
    render(<Portal />);
    expect(screen.getByText("Painel autenticado")).toBeTruthy();
    expect(mocks.switchSchool).not.toHaveBeenCalled();
  });
});
