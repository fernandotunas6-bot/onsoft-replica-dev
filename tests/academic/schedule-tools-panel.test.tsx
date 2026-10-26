// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ScheduleSlot } from "@/features/academic/schedule/types";

const csv = vi.fn();
vi.mock("@/lib/export-csv", () => ({ exportCsv: (...args: unknown[]) => csv(...args) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/calendar/dates", async (original) => ({
  ...(await original<object>()),
  todayInLuanda: () => "2026-10-26",
}));

afterEach(() => {
  cleanup();
  csv.mockReset();
});

let seq = 0;
const slot = (overrides: Partial<ScheduleSlot>): ScheduleSlot => ({
  id: `s${++seq}`,
  class_group_id: "10a",
  class_group_name: "10ª A",
  weekday: 1,
  starts_at: "07:00",
  ends_at: "07:45",
  subject_id: "mat",
  subject_name: "Matemática",
  teacher_id: "ana",
  teacher_name: "Ana Sapalo",
  room_id: "r101",
  room_name: "Sala D101",
  label: "Sala D101",
  display_label: "Matemática",
  ...overrides,
});

const slots = [
  slot({}),
  slot({
    starts_at: "07:50",
    ends_at: "08:35",
    subject_id: "fis",
    subject_name: "Física",
    teacher_id: "rui",
    teacher_name: "Rui Ndala",
  }),
  slot({
    class_group_id: "7a",
    class_group_name: "7ª A",
    room_id: "r102",
    room_name: "Sala D102",
    teacher_id: "eva",
    teacher_name: "Eva Lumbo",
  }),
];

async function renderPanel(onApply = vi.fn().mockResolvedValue({ created: 2, failed: [] })) {
  const { ScheduleToolsPanel } = await import("@/features/academic/schedule/ScheduleToolsPanel");
  render(
    <ScheduleToolsPanel
      slots={slots}
      visibleSlots={slots.filter((s) => s.class_group_id === "10a")}
      viewLabel="10ª A"
      classGroups={[
        { id: "10a", name: "10ª A", code: "DH26-10A", enrolled_count: 25, shift: "morning" },
        { id: "7a", name: "7ª A", code: "DH26-7A", enrolled_count: 20, shift: "morning" },
      ]}
      subjects={[
        { id: "mat", name: "Matemática" },
        { id: "fis", name: "Física" },
      ]}
      classSubjects={[
        { class_group_id: "10a", subject_id: "mat", weekly_periods: 2, teacher_id: "ana" },
        { class_group_id: "10a", subject_id: "fis", weekly_periods: 2, teacher_id: "rui" },
      ]}
      rooms={[
        { id: "r101", name: "Sala D101", code: "D101", capacity: 40, room_type: "standard" },
        { id: "r102", name: "Sala D102", code: "D102", capacity: 30, room_type: "standard" },
        { id: "lab", name: "Laboratório", code: "LAB", capacity: 20, room_type: "biology_lab" },
      ]}
      teachers={[
        { id: "ana", name: "Ana Sapalo" },
        { id: "rui", name: "Rui Ndala" },
        { id: "eva", name: "Eva Lumbo" },
      ]}
      selectedClassGroupId="10a"
      canManage
      yearEndsOn="2027-07-31"
      onApplyProposal={onApply}
    />,
  );
  return onApply;
}

const openTab = (name: RegExp) => {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
};

describe("ferramentas do horário", { timeout: 30_000 }, () => {
  it("mostra a qualidade da turma, a carga dos professores e a ocupação das salas", async () => {
    await renderPanel();
    expect(screen.getByText("100/100")).toBeDefined();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Ana Sapalo")).toBeDefined();
    expect(within(table).getByText("Rui Ndala")).toBeDefined();
    expect(screen.getByRole("meter", { name: "Ocupação de Sala D101" })).toBeDefined();
  });

  it("encontra salas livres que cabem a turma e substitutos livres", async () => {
    await renderPanel();
    openTab(/Disponibilidade/);
    const free = await screen.findByRole("list", { name: "Salas livres neste tempo" });
    // Segunda 07:00: D101 e D102 ocupadas; o laboratório (20) não cabe 25 alunos.
    expect(
      within(free)
        .getByText(/Laboratório/)
        .getAttribute("title"),
    ).toContain("não cabe a turma");
    expect(within(free).queryByText(/Sala D101/)).toBeNull();

    const ranked = screen.getByRole("list", { name: "Professores livres, do mais indicado" });
    // A aula das 07:00 de Ana: Rui está livre e conhece a turma; Eva está ocupada.
    expect(within(ranked).getByText("Rui Ndala")).toBeDefined();
    expect(within(ranked).getByText("conhece a turma")).toBeDefined();
    expect(within(ranked).queryByText("Eva Lumbo")).toBeNull();
  });

  it("exporta CSV com as colunas do modelo de importação", async () => {
    await renderPanel();
    openTab(/Exportar/);
    fireEvent.click(await screen.findByRole("button", { name: /CSV/ }));
    const [fileName, columns, rows] = csv.mock.calls[0]!;
    expect(fileName).toBe("horario-10a-a");
    expect((columns as Array<{ label: string }>)[0]!.label).toBe("Turma");
    expect(rows).toHaveLength(2);
  });

  it("gera a proposta, mostra-a e só grava ao aplicar", async () => {
    const onApply = await renderPanel();
    openTab(/Proposta automática/);
    fireEvent.click(await screen.findByRole("button", { name: /Gerar proposta/ }));
    const proposed = await screen.findByRole("list", { name: "Aulas propostas" });
    expect(within(proposed).getAllByRole("listitem")).toHaveLength(2);
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar 2 aulas" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    const lessons = onApply.mock.calls[0]![0] as Array<{ subjectId: string; classGroupId: string }>;
    expect(lessons.map((l) => l.subjectId).sort()).toEqual(["fis", "mat"]);
    expect(lessons.every((l) => l.classGroupId === "10a")).toBe(true);
  });
});
