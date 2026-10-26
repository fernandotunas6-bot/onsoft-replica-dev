// @vitest-environment jsdom
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

// O Link da disciplina, sem router: um <a> com o destino e a pesquisa.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a
      href={`${to.replace("$subjectId", params?.subjectId ?? "")}${
        search && Object.keys(search).length ? `?${new URLSearchParams(search)}` : ""
      }`}
      {...rest}
    >
      {children}
    </a>
  ),
}));

describe("cartão de notas do aluno", () => {
  afterEach(cleanup);

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

  it("cada disciplina abre a sua página; a barra fica verde a partir da aprovação", async () => {
    const { StudentGradesCard } = await import("@/features/dashboard/components/StudentGradesCard");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StudentGradesCard studentId="00000000-0000-0000-0000-0000000000c1" />
      </QueryClientProvider>,
    );
    const link = await screen.findByRole("link", { name: "Matemática" });
    expect(link.getAttribute("href")).toBe(
      "/pedagogica/disciplinas/mat?aluno=00000000-0000-0000-0000-0000000000c1",
    );
    const meter = screen.getByRole("meter");
    expect(meter.querySelector("[data-tone]")!.getAttribute("data-tone")).toBe("pass");
  });
});
