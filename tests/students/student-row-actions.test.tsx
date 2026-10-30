// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationRole, ModuleGrantMap } from "@/features/auth/access-policy";
import { StudentRowActions } from "@/features/students/components/StudentRowActions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/export-pdf-loader", () => ({ exportPdfTable: vi.fn() }));

const student = {
  id: "st-1",
  registration_number: "1260001",
  full_name: "Ana Tchipa",
  email: null,
  class_name: "7ª A",
  grade_name: "7.ª classe",
  student_status: "active",
};

function openMenu(role: ApplicationRole, grants: ModuleGrantMap = {}) {
  render(<StudentRowActions student={student} role={role} grants={grants} />);
  const trigger = screen.getByRole("button", { name: "Mais acções para Ana Tchipa" });
  // O jsdom não tem PointerEvent: abrir pelo teclado, como o Radix também aceita.
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.getByRole("menu");
}

afterEach(cleanup);

describe("menu ••• do aluno: «Recuperar senha» só a quem abre Acessos dos alunos", () => {
  it("a Secretaria vê a opção", () => {
    openMenu("Secretaria");
    expect(screen.getByRole("menuitem", { name: /Recuperar \/ redefinir senha/ })).toBeTruthy();
  });

  it("o encarregado não vê uma opção que o servidor recusa", () => {
    openMenu("Encarregado");
    expect(screen.getByRole("menuitem", { name: /Ver perfil/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Recuperar \/ redefinir senha/ })).toBeNull();
  });

  it("«Nenhum» em Pessoas também a retira", () => {
    openMenu("Secretaria", { pessoas: "Nenhum" });
    expect(screen.queryByRole("menuitem", { name: /Recuperar \/ redefinir senha/ })).toBeNull();
  });
});
