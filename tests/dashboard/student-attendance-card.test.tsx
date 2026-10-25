// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const historyMock = vi.fn();
vi.mock("@/features/pedagogica/attendance-server", () => ({
  getStudentAttendanceHistory: (input: unknown) => historyMock(input),
}));
vi.mock("@/features/pedagogica/components/AttendanceJustificationModal", () => ({
  SubmitAttendanceJustificationModal: () => null,
}));

afterEach(() => {
  cleanup();
  historyMock.mockReset();
});

async function renderCard(studentId?: string | null) {
  historyMock.mockResolvedValue({
    records: [
      {
        id: "r1",
        session_id: "s1",
        subject_name: "Matemática",
        date: "2026-10-20",
        time: "08:00:00",
        status: "absent",
        notes: null,
      },
      {
        id: "r2",
        session_id: "s2",
        subject_name: "Física",
        date: "2026-10-21",
        time: "",
        status: "present",
        notes: null,
      },
    ],
    stats: { total: 2, present: 1, absent: 1, excused: 0, late: 0, rate: 50 },
  });
  const { StudentAttendanceCard } =
    await import("@/features/dashboard/components/StudentAttendanceCard");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StudentAttendanceCard studentId={studentId} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText("Matemática")).toBeDefined());
}

describe("cartão de presenças do aluno", () => {
  it("lista o histórico com a assiduidade e deixa justificar a falta", async () => {
    await renderCard("a0000000-0000-4000-8000-000000000001");
    expect(screen.getByText("Física")).toBeDefined();
    expect(screen.getByText(/Assiduidade 50%/)).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Justificar" })).toHaveLength(1);
    expect(historyMock).toHaveBeenCalledWith({
      data: { studentId: "a0000000-0000-4000-8000-000000000001" },
    });
  });

  it("sem aluno identificado não oferece a justificação", async () => {
    await renderCard(null);
    expect(screen.queryByRole("button", { name: "Justificar" })).toBeNull();
    expect(historyMock).toHaveBeenCalledWith({ data: {} });
  });
});
