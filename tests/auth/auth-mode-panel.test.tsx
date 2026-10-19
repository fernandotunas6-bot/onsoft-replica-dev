// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "@/components/auth/AuthGate";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));
vi.mock("@/components/auth/AuthBackgroundVideo", () => ({ AuthBackgroundVideo: () => null }));
vi.mock("@/components/auth/AuthHeroSlides", () => ({ AuthHeroSlides: () => null }));
vi.mock("@/components/auth/AuthCaptcha", () => ({ AuthCaptcha: () => null }));

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
});
afterEach(cleanup);

describe("login e registo no mesmo painel", () => {
  it("troca por links, mantém o painel e os dados do login, e move o foco para o formulário activo", async () => {
    const { container } = render(<AuthGate sessionHint={false}>Área da escola</AuthGate>);
    await screen.findByRole("heading", { name: "Iniciar sessão" });
    const panel = container.querySelector("[data-auth-panel]");
    const email = screen.getByLabelText("Email ou Nº de BI / NIF") as HTMLInputElement;
    const password = screen.getByLabelText("Senha", { exact: true }) as HTMLInputElement;
    fireEvent.change(email, { target: { value: "teste@example.ao" } });
    fireEvent.change(password, { target: { value: "Senha-local-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(password.type).toBe("text");

    fireEvent.click(screen.getByRole("link", { name: "Criar conta", exact: true }));
    expect(screen.getByRole("heading", { name: "Criar conta SIGA Plus" })).toBeTruthy();
    expect(container.querySelector("[data-auth-panel]")).toBe(panel);
    expect(document.activeElement).toBe(screen.getByLabelText("Nome completo"));
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByAltText(/SIGA Plus/i)).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Iniciar sessão", exact: true }));
    await waitFor(() => expect(document.activeElement).toBe(email));
    expect(email.value).toBe("teste@example.ao");
    expect(password.value).toBe("Senha-local-123");
    expect(password.type).toBe("password");
    expect(container.querySelector("[data-auth-panel]")).toBe(panel);
  });

  it("mantém os campos e métodos de autenticação no registo", () => {
    render(<AuthGate sessionHint={false}>Área da escola</AuthGate>);
    fireEvent.click(screen.getByRole("link", { name: "Criar conta", exact: true }));
    const form = screen.getByRole("button", { name: "Criar conta", exact: true }).closest("form");
    expect(form?.querySelectorAll("input[required]")).toHaveLength(4);
    expect(screen.getByLabelText("Confirmar senha").getAttribute("autocomplete")).toBe(
      "new-password",
    );
    expect(screen.getByRole("button", { name: "Continuar com Google" })).toBeTruthy();
    expect(screen.getByText(/Criar conta não dá acesso a nenhuma escola/)).toBeTruthy();
    expect(screen.queryByText("Área da escola")).toBeNull();
  });
});
