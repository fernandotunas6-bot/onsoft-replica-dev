// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const studentTimetable = vi.fn();
const teacherTimetable = vi.fn();
vi.mock("@/features/dashboard/student-agenda", () => ({
  getMyStudentTimetable: (input: unknown) => studentTimetable(input),
}));
vi.mock("@/features/academic/timetable-lessons", () => ({
  getMyTeacherTimetable: () => teacherTimetable(),
}));
vi.mock("@/features/dashboard/components/LessonDetailDialog", () => ({
  LessonDetailDialog: ({ slotId }: { slotId: string | null }) =>
    slotId ? <div data-testid="lesson-detail">{slotId}</div> : null,
}));
vi.mock("@/features/calendar/dates", () => ({ todayInLuanda: () => "2026-10-27" }));

const lesson = (slotId: string, startsAt: string, endsAt: string, subjectName: string) => ({
  slotId,
  startsAt,
  endsAt,
  subjectName,
  teacherName: "Helena Sapalo",
  room: "Sala D101",
  className: "10ª A",
});

const week = {
  className: "10ª A",
  publishedAt: "2026-10-25T12:00:00Z",
  days: [
    { weekday: 1, lessons: [lesson("m1", "07:00", "07:45", "Física")] },
    {
      weekday: 2, // terça, «hoje»
      lessons: [
        lesson("t1", "07:00", "07:45", "Matemática"),
        lesson("t2", "08:40", "09:25", "Física"),
        lesson("t3", "09:45", "10:30", "Matemática"),
      ],
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T08:00:00Z")); // 09:00 em Luanda
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  studentTimetable.mockReset();
  teacherTimetable.mockReset();
});

async function renderCard(variant: "student" | "teacher" = "student") {
  (variant === "teacher" ? teacherTimetable : studentTimetable).mockResolvedValue(week);
  const { StudentTimetableCard } =
    await import("@/features/dashboard/components/StudentTimetableCard");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StudentTimetableCard variant={variant} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getAllByText("Matemática").length).toBe(2));
}

const column = (weekday: string) =>
  screen.getAllByText(weekday, { selector: "span" })[0]!.closest("div") as HTMLElement;

// A primeira importação do cartão compila a árvore do dashboard: lenta em máquinas fracas.
describe("horário da semana", { timeout: 30_000 }, () => {
  it("em ecrã pequeno mostra hoje e troca de dia pelo selector", async () => {
    await renderCard();
    expect(screen.getByText("4 aulas esta semana")).toBeDefined();
    const picker = screen.getByRole("group", { name: "Escolher o dia" });
    const tuesday = within(picker).getByRole("button", { name: /Terça \(hoje\): 3 aulas/ });
    expect(tuesday.getAttribute("aria-pressed")).toBe("true");
    expect(column("Terça").className).toMatch(/(^|\s)block(\s|$)/);
    expect(column("Segunda").className).toMatch(/(^|\s)hidden(\s|$)/);

    fireEvent.click(within(picker).getByRole("button", { name: /Segunda: 1 aulas/ }));
    expect(column("Segunda").className).toMatch(/(^|\s)block(\s|$)/);
    expect(column("Terça").className).toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("dá a mesma cor à mesma disciplina e outra às restantes", async () => {
    await renderCard();
    const hue = (name: RegExp) =>
      screen.getAllByRole("button", { name }).map((b) => b.style.getPropertyValue("--tone-h"));
    const math = hue(/^Matemática/);
    const physics = hue(/^Física/);
    expect(new Set(math).size).toBe(1);
    expect(new Set(physics).size).toBe(1);
    expect(math[0]).not.toBe(physics[0]);
    expect(math[0]).not.toBe("");
  });

  it("marca a aula em curso, esbate as que passaram e assinala o intervalo", async () => {
    await renderCard();
    const current = screen.getByRole("button", { name: /Física, 08:40 às 09:25/ });
    expect(current.getAttribute("aria-current")).toBe("time");
    expect(within(current).getByText("Agora")).toBeDefined();
    expect(screen.getByRole("button", { name: /Matemática, 07:00 às 07:45/ }).className).toMatch(
      /opacity-60/,
    );
    expect(
      screen.getByRole("button", { name: /Matemática, 09:45 às 10:30/ }).className,
    ).not.toMatch(/opacity-60/);
    expect(screen.getByText("Intervalo · 09:25–09:45")).toBeDefined();
    // Sem intervalo entre 07:45 e 08:40? Há 55 min: também é intervalo.
    expect(screen.getByText("Intervalo · 07:45–08:40")).toBeDefined();
  });

  it("abre o detalhe da aula ao tocar", async () => {
    await renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Física, 08:40 às 09:25/ }));
    expect(screen.getByTestId("lesson-detail").textContent).toBe("t2");
  });

  it("no professor mostra a turma em vez do professor", async () => {
    await renderCard("teacher");
    expect(screen.getByText("O meu horário")).toBeDefined();
    expect(screen.getAllByText("10ª A").length).toBeGreaterThan(0);
    expect(screen.queryByText("Helena Sapalo")).toBeNull();
  });
});
