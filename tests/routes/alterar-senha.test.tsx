// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, waitFor, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";

vi.setConfig({ testTimeout: 25_000 });

vi.mock("@tanstack/react-router", async () => {
  const harness = await import("./_harness");
  return harness.reactRouterMock();
});

vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock(),
);

vi.mock("@/components/auth/AuthGate", () => ({
  useAuthSession: () => ({ user: { id: "user-123", email: "teste@escola.ao" } }),
}));

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/alterar-senha");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/alterar-senha", () => {
  it("monta a página de alterar senha com o formulário correto", async () => {
    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alterar Senha" })).toBeDefined();
      expect(screen.getByText(/Não partilhe a sua senha/)).toBeDefined();
    });

    const oldPasswordInput = screen.getByLabelText("Senha actual");
    expect(oldPasswordInput).toBeDefined();
    expect(screen.getByLabelText("Nova senha")).toBeDefined();
    expect(screen.getByLabelText("Confirmar nova senha")).toBeDefined();
    expect(screen.getByRole("button", { name: "Actualizar senha" })).toBeDefined();
  });
});
