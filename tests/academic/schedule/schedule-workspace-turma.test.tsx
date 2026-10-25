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

const classGroups = [
  { id: TURMA_A, name: "10.ª A", enrolled_count: 30 },
  { id: TURMA_B, name: "10.ª B", enrolled_count: 28 },
];

afterEach(cleanup);

function props(initialClassGroupId?: string): ComponentProps<typeof ScheduleWorkspace> {
  return {
    activeYearLabel: "2026/2027",
    canManage: false,
    scheduleAvailable: true,
    classGroups,
    subjects: [],
    slots: [],
    virtualRooms: [],
    onCreateSlot: vi.fn(),
    onUpdateSlot: vi.fn(),
    onDeleteSlot: vi.fn(),
    initialClassGroupId,
  };
}

function renderWorkspace(initialClassGroupId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ScheduleWorkspace {...props(initialClassGroupId)} />
    </QueryClientProvider>,
  );
  return {
    rerender: (next?: string) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <ScheduleWorkspace {...props(next)} />
        </QueryClientProvider>,
      ),
  };
}

const title = (name: string) => screen.queryByText(`Horário semanal — Turma ${name}`);

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
