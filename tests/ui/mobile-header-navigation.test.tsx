// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MobileHeader } from "@/components/mobile/MobileHeader";

const navigation = vi.hoisted(() => ({
  canGoBack: false,
  pathname: "/alunos/exemplo",
  back: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useCanGoBack: () => navigation.canGoBack,
  useRouter: () => ({ history: { back: navigation.back }, navigate: navigation.navigate }),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: navigation.pathname } }),
}));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({ name: "Utilizador", initials: "U" }),
}));
vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: { name: "Escola de demonstração" },
    selectedYearLabel: "2026",
  }),
}));
vi.mock("@/components/ui/user-avatar", () => ({ UserAvatar: () => null }));

function renderHeader(onOpenContext = vi.fn()) {
  render(
    <MobileHeader
      title="Ficha do aluno"
      moduleLabel="Secretaria"
      fallbackTo="/alunos"
      onOpenContext={onOpenContext}
      onOpenSearch={vi.fn()}
      onOpenNotifications={vi.fn()}
      onOpenAccount={vi.fn()}
    />,
  );
}

beforeEach(() => {
  navigation.canGoBack = false;
  navigation.pathname = "/alunos/exemplo";
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("voltar dentro do SIGA", () => {
  it("usa a rota de recurso quando a entrada veio de outro site, mesmo com histórico no navegador", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(3);
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(navigation.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/alunos" });
    expect(navigation.back).not.toHaveBeenCalled();
  });

  it("regressa à página anterior quando o router tem uma entrada interna anterior", () => {
    navigation.canGoBack = true;
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(navigation.back).toHaveBeenCalledOnce();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it("permite alterar escola, ano e período sem abandonar uma página interna", () => {
    const onOpenContext = vi.fn();
    renderHeader(onOpenContext);
    fireEvent.click(screen.getByRole("button", { name: "Alterar escola, ano lectivo ou período" }));
    expect(onOpenContext).toHaveBeenCalledOnce();
    expect(navigation.back).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe("acessibilidade do cabeçalho compacto", () => {
  it("mantém escola e módulo visíveis nas páginas internas", () => {
    renderHeader();
    expect(screen.getByText("Escola de demonstração · Secretaria")).toBeTruthy();
    const trigger = screen.getByRole("button", { name: "Alterar escola, ano lectivo ou período" });
    expect(
      document.getElementById(trigger.getAttribute("aria-describedby")!)?.textContent,
    ).toContain("Escola de demonstração");
  });
  it("mantém a pesquisa, notificações e conta alcançáveis pelo teclado", () => {
    renderHeader();
    for (const name of ["Pesquisar no SIGA", "Notificações", "Abrir painel da conta"]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("focus-visible:ring-2");
    }
  });

  it.each(["/", "/portal"])("abre o contexto em %s sem perder o acesso à escola", (pathname) => {
    navigation.pathname = pathname;
    const openContext = vi.fn();
    renderHeader(openContext);
    const button = screen.getByRole("button", {
      name: "Alterar escola, ano lectivo ou período",
    });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(button);
    expect(openContext).toHaveBeenCalledOnce();
    expect(screen.getByText(/Utilizador/)).toBeTruthy();
  });
});
