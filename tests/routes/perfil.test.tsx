// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, resetRouteLocation, routeComponentOf } from "./_harness";

vi.setConfig({ testTimeout: 25_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

vi.mock("@/components/ui/tabs", async () => {
  const React = await import("react");
  const TabsContext = React.createContext<{
    value: string;
    onValueChange: (val: string) => void;
  }>({ value: "", onValueChange: () => {} });

  return {
    Tabs: ({
      value,
      defaultValue,
      onValueChange,
      children,
      className,
    }: {
      value?: string;
      defaultValue?: string;
      onValueChange?: (val: string) => void;
      children?: React.ReactNode;
      className?: string;
    }) => {
      const [internalVal, setInternalVal] = React.useState(defaultValue ?? "");
      const current = value !== undefined ? value : internalVal;
      const handleChange = onValueChange ?? setInternalVal;
      return (
        <TabsContext.Provider value={{ value: current, onValueChange: handleChange }}>
          <div className={className}>{children}</div>
        </TabsContext.Provider>
      );
    },
    TabsList: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div role="tablist" className={className}>
        {children}
      </div>
    ),
    TabsTrigger: ({
      value,
      children,
      className,
    }: {
      value: string;
      children?: React.ReactNode;
      className?: string;
    }) => {
      const ctx = React.useContext(TabsContext);
      const active = ctx.value === value;
      return (
        <button
          type="button"
          role="tab"
          aria-selected={active}
          data-state={active ? "active" : "inactive"}
          className={className}
          onClick={() => ctx.onValueChange(value)}
        >
          {children}
        </button>
      );
    },
    TabsContent: ({
      value,
      children,
      className,
    }: {
      value: string;
      children?: React.ReactNode;
      className?: string;
    }) => {
      const ctx = React.useContext(TabsContext);
      if (ctx.value !== value) return null;
      return (
        <div role="tabpanel" className={className}>
          {children}
        </div>
      );
    },
  };
});

const mockSetActiveSchoolId = vi.fn();

const mockCurrentUser = {
  id: "user-123",
  email: "admin@escola-exemplo.ao",
  name: "Valentino Canguele",
  role: "Diretor Geral",
  schoolId: "school-1",
  schoolName: "Colégio Exemplo Luanda",
  avatarUrl: null,
  schools: [
    {
      membershipId: "mem-1",
      schoolId: "school-1",
      schoolName: "Colégio Exemplo Luanda",
      roleName: "Diretor Geral",
      appRole: "admin",
      status: "active",
    },
    {
      membershipId: "mem-2",
      schoolId: "school-2",
      schoolName: "Instituto Politécnico Kilamba",
      roleName: "Professor Coordenador",
      appRole: "teacher",
      status: "active",
    },
  ],
  setActiveSchoolId: mockSetActiveSchoolId,
};

vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => mockCurrentUser,
}));

vi.mock("@/features/auth/ProfileSettingsPanel", () => ({
  ProfileSettingsPanel: () => <div data-testid="profile-settings-panel">Painel Perfil Mock</div>,
}));

vi.mock("@/features/auth/PasswordChangeForm", () => ({
  PasswordChangeForm: () => <div data-testid="password-change-form">Form Alterar Senha Mock</div>,
}));

vi.mock("@/features/auth/EmailChangeForm", () => ({
  EmailChangeForm: () => <div data-testid="email-change-form">Form Alterar Email Mock</div>,
}));

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/perfil");
  return routeComponentOf(mod);
}

beforeEach(() => {
  mockSetActiveSchoolId.mockClear();
  resetRouteLocation();
});

afterEach(() => {
  cleanup();
});

describe("/perfil", () => {
  it("monta o ecrã de perfil com cabeçalho e abas principais", async () => {
    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByRole("heading", { name: "Minha Conta & Perfil" })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Perfil/ })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Instituições/ })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Segurança/ })).toBeDefined();
    expect(screen.getByTestId("profile-settings-panel")).toBeDefined();
  });

  it("lista as instituições associadas e permite alternar de escola activa", async () => {
    const Page = await loadPage();
    renderRoute(Page);

    const tabInstituicoes = screen.getByRole("tab", { name: /Instituições/ });
    fireEvent.click(tabInstituicoes);

    await waitFor(() => {
      expect(screen.getByText("Colégio Exemplo Luanda")).toBeDefined();
      expect(screen.getByText("Instituto Politécnico Kilamba")).toBeDefined();
      expect(screen.getByText("Sessão Actual")).toBeDefined();
    });

    const switchButton = screen.getByRole("button", { name: /Alternar para esta escola/ });
    expect(switchButton).toBeDefined();
    fireEvent.click(switchButton);

    expect(mockSetActiveSchoolId).toHaveBeenCalledWith("school-2");
  });

  it("mostra o formulário de segurança na aba correspondente", async () => {
    const Page = await loadPage();
    renderRoute(Page);

    const tabSeguranca = screen.getByRole("tab", { name: /Segurança/ });
    fireEvent.click(tabSeguranca);

    await waitFor(() => {
      expect(screen.getByTestId("password-change-form")).toBeDefined();
      expect(screen.getByTestId("email-change-form")).toBeDefined();
    });
  });

  it("disponibiliza convite para criar nova escola que aponta para o ecossistema WEB", async () => {
    const Page = await loadPage();
    renderRoute(Page);

    const tabInstituicoes = screen.getByRole("tab", { name: /Instituições/ });
    fireEvent.click(tabInstituicoes);

    await waitFor(() => {
      const createLink = screen.getByRole("link", { name: /Criar Escola/ });
      const href = createLink.getAttribute("href") ?? "";
      expect(href.includes("/start")).toBe(true);
    });
  });
});
