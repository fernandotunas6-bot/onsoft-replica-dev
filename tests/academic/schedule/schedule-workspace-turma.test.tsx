// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { ScheduleWorkspace } from "@/features/academic/schedule/ScheduleWorkspace";

/**
 * `/pedagogica?tab=horarios&turma=<id>` (menu da turma, SIGA Context Engine): o
 * horário abre na turma da URL, e outra turma na URL volta a mudá-lo.
 */

vi.setConfig({ testTimeout: 20_000 });

const TURMA_A = "11111111-1111-4111-8111-111111111111";
const TURMA_B = "22222222-2222-4222-8222-222222222222";
const OUTRA_ESCOLA = "99999999-9999-4999-8999-999999999999";
const PROF_JOAO = "66666666-6666-4666-8666-666666666666";
const PROF_RITA = "77777777-7777-4777-8777-777777777777";

const classGroups = [
  { id: TURMA_A, name: "10.ª A", enrolled_count: 30 },
  { id: TURMA_B, name: "10.ª B", enrolled_count: 28 },
];
const teachers = [
  { id: PROF_JOAO, name: "João Mendes" },
  { id: PROF_RITA, name: "Rita Lopes" },
];

afterEach(cleanup);

type Url = { turma?: string; professor?: string };

function props(url: string | Url = {}): ComponentProps<typeof ScheduleWorkspace> {
  const { turma, professor } = typeof url === "string" ? { turma: url } : url;
  return {
    activeYearLabel: "2026/2027",
    canManage: false,
    scheduleAvailable: true,
    classGroups,
    teachers,
    subjects: [],
    slots: [],
    virtualRooms: [],
    onCreateSlot: vi.fn(),
    onUpdateSlot: vi.fn(),
    onDeleteSlot: vi.fn(),
    initialClassGroupId: turma,
    initialTeacherId: professor,
  };
}

function renderWorkspace(initial?: string | Url) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ScheduleWorkspace {...props(initial)} />
    </QueryClientProvider>,
  );
  return {
    rerender: (next?: string | Url) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <ScheduleWorkspace {...props(next)} />
        </QueryClientProvider>,
      ),
  };
}

const title = (name: string) => screen.queryByText(`Horário semanal — Turma ${name}`);
const teacherTitle = (name: string) => screen.queryByText(`Horário pessoal — Prof. ${name}`);

describe("horário da turma pela URL", () => {
  it("sem turma na URL, abre a primeira, como antes", () => {
    renderWorkspace();
    expect(title("10.ª A")).not.toBeNull();
  });

  it("abre na turma da URL", () => {
    renderWorkspace(TURMA_B);
    expect(title("10.ª B")).not.toBeNull();
    expect(title("10.ª A")).toBeNull();
  });

  it("outra turma na URL muda o horário aberto", () => {
    const view = renderWorkspace(TURMA_A);
    expect(title("10.ª A")).not.toBeNull();
    view.rerender(TURMA_B);
    expect(title("10.ª B")).not.toBeNull();
  });

  it("uma turma que a conta não tem abre a primeira, sem erro", () => {
    renderWorkspace(OUTRA_ESCOLA);
    expect(title("10.ª A")).not.toBeNull();
  });
});

describe("horário do professor pela URL", () => {
  it("abre na vista do professor da URL", () => {
    renderWorkspace({ professor: PROF_RITA });
    expect(teacherTitle("Rita Lopes")).not.toBeNull();
  });

  it("outro professor na URL muda o horário aberto", () => {
    const view = renderWorkspace({ professor: PROF_JOAO });
    expect(teacherTitle("João Mendes")).not.toBeNull();
    view.rerender({ professor: PROF_RITA });
    expect(teacherTitle("Rita Lopes")).not.toBeNull();
  });

  it("a turma da URL manda sobre o professor", () => {
    renderWorkspace({ turma: TURMA_B, professor: PROF_RITA });
    expect(title("10.ª B")).not.toBeNull();
  });
});
