// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ subjects: [] as unknown[] }));
vi.mock("@/features/dashboard/student-competencies", () => ({
  getMyStudentCompetencies: () => Promise.resolve({ passing: 10, subjects: state.subjects }),
}));

async function renderCard() {
  const { StudentCompetenciesCard } =
    await import("@/features/dashboard/components/StudentCompetenciesCard");
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <StudentCompetenciesCard />
    </QueryClientProvider>,
  );
}

describe("cartão de competências no portal", () => {
  afterEach(cleanup);

  it("não aparece se a escola não definiu competências", async () => {
    state.subjects = [];
    const { container } = await renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toBe("");
  });

  it("mostra quantas domina e o estado de cada competência", async () => {
    state.subjects = [
      {
        subjectId: "lp",
        subjectName: "Língua Portuguesa",
        assessed: 2,
        mastered: 1,
        competencies: [
          { id: "c1", code: "C1", description: "Interpreta textos", mastered: true },
          { id: "c2", code: "C2", description: "Concordância verbal", mastered: false },
          { id: "c3", code: "C3", description: "Texto argumentativo", mastered: null },
        ],
      },
    ];
    await renderCard();
    await waitFor(() => expect(screen.getByText("1 de 2 dominada(s)")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /Língua Portuguesa/ }));
    expect(screen.getByText("Dominada")).toBeDefined();
    expect(screen.getByText("A consolidar")).toBeDefined();
    expect(screen.getByText("Por avaliar")).toBeDefined();
  });
});
