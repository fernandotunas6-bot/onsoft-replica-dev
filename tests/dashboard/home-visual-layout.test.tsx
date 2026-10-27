// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Users } from "lucide-react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search: _search,
    children,
    ...rest
  }: {
    to: string;
    search?: Record<string, unknown>;
    children: ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { QuickActions } from "@/components/mobile/QuickActions";
import { AdminHomeFocus } from "@/features/dashboard/components/AdminHomeFocus";

afterEach(cleanup);

describe("Início operacional responsivo", () => {
  it("mostra prioridades verificadas em formato compacto no mobile", () => {
    render(
      <AdminHomeFocus
        compact
        loading={false}
        unavailable={false}
        items={[
          {
            id: "applications",
            title: "Candidaturas por confirmar",
            detail: "Abrir as matrículas",
            count: 3,
            to: "/alunos",
          },
        ]}
      />,
    );
    const section = screen.getByRole("region", { name: "O que merece atenção" });
    expect(section.className).toContain("md:hidden");
    expect(
      screen.getByRole("link", { name: /3.*Candidaturas por confirmar/ }).getAttribute("href"),
    ).toBe("/alunos");
  });

  it("não transforma indisponibilidade numa contagem fictícia", () => {
    render(<AdminHomeFocus compact loading={false} unavailable items={[]} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Não foi possível consultar os indicadores",
    );
    expect(screen.queryByText("0")).toBeNull();
  });

  it("mostra só acções permitidas com apresentação compacta e foco de teclado", () => {
    render(
      <QuickActions
        compact
        className="md:grid-cols-3"
        actions={[
          { label: "Nova matrícula", to: "/alunos", icon: Users },
          { label: "Receber pagamento", to: "/faturas", icon: Users, hidden: true },
        ]}
      />,
    );
    const action = screen.getByRole("link", { name: "Nova matrícula" });
    expect(action.className).toContain("flex-row");
    expect(action.className).toContain("focus-visible:ring-2");
    expect(screen.queryByText("Receber pagamento")).toBeNull();
  });
});
