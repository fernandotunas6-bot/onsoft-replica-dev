// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const lookup = vi.hoisted(() => vi.fn());
vi.mock("@/features/students/enrollment-student-search", () => ({
  searchEnrollmentStudents: lookup,
}));
import { EnrollmentEntryDialog } from "@/features/students/EnrollmentEntryDialog";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function mount() {
  const onCreate = vi.fn();
  const onSelect = vi.fn();
  render(
    <EnrollmentEntryDialog open onOpenChange={() => {}} onCreate={onCreate} onSelect={onSelect} />,
  );
  return { onCreate, onSelect };
}
describe("Entrada da matrícula", () => {
  it("oferece caminhos explícitos sem abrir os dados pessoais", () => {
    const { onCreate } = mount();
    expect(screen.getByRole("button", { name: /Procurar aluno existente/ })).toBeTruthy();
    expect(screen.queryByLabelText("Nome completo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Criar novo aluno/ }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(lookup).not.toHaveBeenCalled();
  });
  it("procura no servidor e selecciona a ficha sem criar aluno", async () => {
    const student = {
      id: "s1",
      full_name: "Ana Maria",
      registration_number: "1260001",
      student_status: "active",
    };
    lookup.mockResolvedValue([student]);
    const { onSelect, onCreate } = mount();
    fireEvent.click(screen.getByRole("button", { name: /Procurar aluno existente/ }));
    fireEvent.change(screen.getByLabelText("Procurar aluno"), { target: { value: "1260001" } });
    await screen.findByRole("button", { name: "Seleccionar Ana Maria" });
    expect(lookup).toHaveBeenCalledWith({ data: { query: "1260001" } });
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar Ana Maria" }));
    expect(onSelect).toHaveBeenCalledWith(student);
    expect(onCreate).not.toHaveBeenCalled();
  });
  it("distingue erro de pesquisa sem resultados e permite repetir", async () => {
    lookup.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce([]);
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Procurar aluno existente/ }));
    fireEvent.change(screen.getByLabelText("Procurar aluno"), { target: { value: "Ana" } });
    await screen.findByRole("alert");
    expect(screen.queryByText(/Nenhum aluno encontrado/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText(/Nenhum aluno encontrado/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("ignora uma resposta antiga depois de mudar a pesquisa", async () => {
    let oldResolve!: (value: unknown[]) => void;
    lookup
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            oldResolve = resolve;
          }),
      )
      .mockResolvedValueOnce([]);
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Procurar aluno existente/ }));
    fireEvent.change(screen.getByLabelText("Procurar aluno"), { target: { value: "Antigo" } });
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Procurar aluno"), { target: { value: "Novo" } });
    oldResolve([{ id: "old", full_name: "Resposta Antiga" }]);
    await screen.findByText(/Nenhum aluno encontrado/);
    expect(screen.queryByText("Resposta Antiga")).toBeNull();
  });
});
