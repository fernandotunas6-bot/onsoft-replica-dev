// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MobileHeader } from "@/components/mobile/MobileHeader";

const navigation = vi.hoisted(() => ({
  canGoBack: false,
  back: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useCanGoBack: () => navigation.canGoBack,
  useRouter: () => ({ history: { back: navigation.back }, navigate: navigation.navigate }),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/alunos/exemplo" } }),
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
