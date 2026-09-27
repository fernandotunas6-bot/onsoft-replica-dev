// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildSubjectYearReport } from "@/features/academic/student-grade-report";

const term = (mt: number) => ({ mac: mt, npp: null, npt: mt, mt, provisional: false });

vi.mock("@/features/academic/student-grades", () => ({
  getMyStudentGrades: () =>
    Promise.resolve({
      years: [
        {
          academicYearId: "y1",
          name: "2025/2026",
          className: "10ª A",
          isCurrent: false,
          termCount: 3,
          average: 11.5,
          subjects: [
            buildSubjectYearReport({
              subjectId: "mat",
              subjectName: "Matemática",
              terms: [term(11), term(12), term(12)],
              termCount: 3,
              passing: 10,
            }),
          ],
          officialResult: { outcome: "Transitou", finalAverage: 12 },
        },
      ],
    }),
}));

describe("cartão de notas do aluno", () => {
  it("mostra o resultado oficial registado no histórico", async () => {
    const { StudentGradesCard } = await import("@/features/dashboard/components/StudentGradesCard");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StudentGradesCard />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Transitou")).toBeDefined());
    expect(screen.getByText(/Resultado oficial/)).toBeDefined();
    expect(screen.getByText("(12.0)")).toBeDefined();
  });
});
