// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.setConfig({ testTimeout: 20_000 });

const server = {
  listOrganizationScopes: vi.fn(),
  previewClassOrganization: vi.fn(),
  applyClassOrganization: vi.fn(),
};
vi.mock("@/features/academic/class-organization-server", () => ({
  listOrganizationScopes: (a: unknown) => server.listOrganizationScopes(a),
  previewClassOrganization: (a: unknown) => server.previewClassOrganization(a),
  applyClassOrganization: (a: unknown) => server.applyClassOrganization(a),
}));

const { ClassOrganizationView } =
  await import("@/features/academic/components/ClassOrganizationPage");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const line = (n: number, from: string, to: string, status: string, age: number) => ({
  enrollmentId: `e${n}`,
  studentId: `s${n}`,
  studentNumber: `126000${n}`,
  name: `Aluno ${n}`,
  birthDate: "2013-05-01",
  age,
  fromClassId: `c${from}`,
  fromLetter: from,
  toClassId: `c${to}`,
  toLetter: to,
  status,
});

describe("organizar turmas", () => {
  it("escolhe a classe, mostra as listas com o ID do aluno e aplica depois de confirmar", async () => {
    server.listOrganizationScopes.mockResolvedValue({
      year: { id: "y1", name: "2026/2027" },
      scopes: [
        {
          gradeLevelId: "00000000-0000-0000-0000-0000000000c7",
          gradeLevelName: "7.ª Classe",
          programName: "Ensino Geral",
          shift: "morning",
          shiftLabel: "Manhã",
          classes: 2,
          students: 3,
        },
      ],
    });
    server.previewClassOrganization.mockResolvedValue({
      classes: [
        {
          id: "cA",
          letter: "A",
          code: "7A-M",
          name: "7ª A — Manhã",
          capacity: 2,
          current: 1,
          proposed: 2,
          youngest: 12,
          oldest: 13,
        },
        {
          id: "cB",
          letter: "B",
          code: "7B-M",
          name: "7ª B — Manhã",
          capacity: 2,
          current: 2,
          proposed: 1,
          youngest: 14,
          oldest: 14,
        },
      ],
      lines: [
        line(2, "B", "A", "move", 12),
        line(3, "A", "A", "records", 13),
        line(1, "B", "B", "same", 14),
      ],
      moves: [{ enrollmentId: "e2", studentId: "s2", from: "cB", to: "cA" }],
      blockers: [],
      warnings: ["1 aluno(s) já têm notas, presenças ou entregas nesta turma e ficam onde estão."],
      signature: "0a1b2c3d",
    });
    server.applyClassOrganization.mockResolvedValue({ moved: 1, failed: [], blocked: [] });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ClassOrganizationView />
      </QueryClientProvider>,
    );

    const select = await screen.findByLabelText(/Classe e turno/);
    await waitFor(() => expect(select.textContent).toContain("7.ª Classe · Manhã — 2 turma(s)"));
    // A lista diz o estado de cada classe antes de escolher; a proposta já fica feita.
    await waitFor(() => expect(select.textContent).toContain("· 1 por mudar"));
    expect(screen.getByText(/0 de 1 já ordenadas/)).toBeTruthy();
    fireEvent.change(select, { target: { value: "00000000-0000-0000-0000-0000000000c7|morning" } });

    const turmaA = await screen.findByRole("region", { name: "Turma A" });
    expect(within(turmaA).getByText("1260002")).toBeTruthy();
    expect(turmaA.textContent).toContain("Com notas — fica");
    expect(screen.getByText(/ficam onde estão/)).toBeTruthy();

    expect(server.previewClassOrganization).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Aplicar" }));
    await waitFor(() =>
      expect(server.applyClassOrganization).toHaveBeenCalledWith({
        data: {
          gradeLevelId: "00000000-0000-0000-0000-0000000000c7",
          shift: "morning",
          signature: "0a1b2c3d",
        },
      }),
    );
  });
});
