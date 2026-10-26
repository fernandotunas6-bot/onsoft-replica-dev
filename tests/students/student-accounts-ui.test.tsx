// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.setConfig({ testTimeout: 20_000 });

const server = {
  listStudentAccounts: vi.fn(),
  createStudentAccounts: vi.fn(),
  resetStudentPassword: vi.fn(),
  completeFirstPasswordChange: vi.fn(),
  setStudentNumberLogin: vi.fn(),
};
vi.mock("@/features/students/student-accounts-server", () => ({
  listStudentAccounts: () => server.listStudentAccounts(),
  createStudentAccounts: (a: unknown) => server.createStudentAccounts(a),
  resetStudentPassword: (a: unknown) => server.resetStudentPassword(a),
}));
vi.mock("@/features/access/student-access-server", () => ({
  setStudentNumberLogin: (a: unknown) => server.setStudentNumberLogin(a),
}));
vi.mock("@/features/auth/first-password-server", () => ({
  completeFirstPasswordChange: (a: unknown) => server.completeFirstPasswordChange(a),
}));
const refreshSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { refreshSession: () => refreshSession(), signOut: vi.fn() } },
}));

const { StudentAccountsView } = await import("@/features/students/components/StudentAccountsPage");
const { FirstPasswordScreen } = await import("@/features/auth/FirstPasswordScreen");

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

const line = (n: number, hasAccount: boolean, classGroupId = "c7a") => ({
  studentId: `00000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`,
  name: `Aluno ${n}`,
  studentNumber: `12600${String(n).padStart(2, "0")}`,
  classGroupId,
  classLabel: classGroupId === "c7a" ? "7ª A — Manhã (7A-M)" : "8ª A — Manhã (8A-M)",
  hasAccount,
  hasBi: false,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("acessos dos alunos", () => {
  it("cria as contas em falta da turma em lotes e mostra as fichas para imprimir", async () => {
    const students = [
      ...Array.from({ length: 12 }, (_, i) => line(i + 1, false)),
      line(20, true),
      line(21, false, "c8a"),
    ];
    server.listStudentAccounts.mockResolvedValue({
      yearName: "2026/2027",
      schoolCode: "SIGA-AO-000001",
      numberLoginEnabled: false,
      isAdministrator: true,
      students,
    });
    server.createStudentAccounts.mockImplementation(
      ({ data }: { data: { studentIds: string[] } }) =>
        Promise.resolve({
          issued: data.studentIds.map((id) => {
            const s = students.find((x) => x.studentId === id)!;
            return {
              studentId: id,
              name: s.name,
              studentNumber: s.studentNumber,
              password: "KMPT-4827-ra",
            };
          }),
          failed: [],
        }),
    );
    wrap(<StudentAccountsView />);

    expect(await screen.findByText(/os alunos só entram pelo BI/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Turma"), { target: { value: "c7a" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar contas em falta (12)" }));

    const slips = await screen.findByRole("list", { name: "Fichas de acesso" });
    // 12 contas: um lote de 10 e outro de 2; o aluno com conta e o da 8ª ficam de fora.
    expect(server.createStudentAccounts).toHaveBeenCalledTimes(2);
    expect(server.createStudentAccounts.mock.calls[1]![0].data.studentIds).toHaveLength(2);
    expect(within(slips).getAllByRole("listitem")).toHaveLength(12);
    expect(slips.textContent).toContain("KMPT-4827-ra");
    expect(slips.textContent).toContain("1260001");
  });

  it("nova senha de quem já tem conta entra nas fichas; o Administrador liga o nº de aluno", async () => {
    server.listStudentAccounts.mockResolvedValue({
      yearName: "2026/2027",
      schoolCode: "SIGA-AO-000001",
      numberLoginEnabled: false,
      isAdministrator: true,
      students: [line(20, true)],
    });
    server.resetStudentPassword.mockResolvedValue({
      studentId: line(20, true).studentId,
      name: "Aluno 20",
      studentNumber: "1260020",
      password: "ABCD-2345-xy",
    });
    server.setStudentNumberLogin.mockResolvedValue({ student_number_login: true });
    wrap(<StudentAccountsView />);

    fireEvent.click(await screen.findByRole("button", { name: "Nova senha" }));
    const slips = await screen.findByRole("list", { name: "Fichas de acesso" });
    expect(slips.textContent).toContain("ABCD-2345-xy");
    fireEvent.click(screen.getByRole("button", { name: "Ligar" }));
    await waitFor(() =>
      expect(server.setStudentNumberLogin).toHaveBeenCalledWith({ data: { enabled: true } }),
    );
  });
});

describe("primeiro acesso", () => {
  it("só guarda uma senha dentro da política, igual nas duas caixas, e renova a sessão", async () => {
    server.completeFirstPasswordChange.mockResolvedValue({ ok: true });
    wrap(<FirstPasswordScreen name="Ana Tchipa" />);
    expect(screen.getByText("Bem-vindo, Ana")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "fraca" } });
    fireEvent.change(screen.getByLabelText("Repita a senha"), { target: { value: "fraca" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar e entrar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("requisitos");

    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "Kalunga2026" } });
    fireEvent.change(screen.getByLabelText("Repita a senha"), { target: { value: "Kalunga2027" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar e entrar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("não são iguais");

    fireEvent.change(screen.getByLabelText("Repita a senha"), { target: { value: "Kalunga2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar e entrar" }));
    await waitFor(() =>
      expect(server.completeFirstPasswordChange).toHaveBeenCalledWith({
        data: { password: "Kalunga2026" },
      }),
    );
    await waitFor(() => expect(refreshSession).toHaveBeenCalled());
  });
});
