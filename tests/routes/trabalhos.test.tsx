// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetCurrentAccount,
  resetRouteLocation,
  routeComponentOf,
  setCurrentAccount,
  setRouteSearch,
} from "./_harness";

/**
 * `/pedagogica/trabalhos` (SIGA Context Engine): os trabalhos da turma ou da
 * disciplina da URL, como o servidor os devolve à conta.
 */

vi.setConfig({ testTimeout: 25_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock({ role: "Professor" }),
);

const listClassTasksMock = vi.fn();
vi.mock("@/features/academic/timetable-lessons", () => ({
  listClassTasks: (args: unknown) => listClassTasksMock(args),
}));

const TURMA = "11111111-1111-4111-8111-111111111111";
const MAT = "22222222-2222-4222-8222-222222222222";

const task = (id: string, title: string, dueOn: string | null, subjectName = "Matemática") => ({
  id,
  kind: "trabalho",
  title,
  description: null,
  dueOn,
  subjectId: MAT,
  subjectName,
  classGroupId: TURMA,
  className: null as string | null,
});

let Page: ComponentType;

beforeAll(async () => {
  Page = routeComponentOf(await import("@/routes/pedagogica_.trabalhos"));
}, 60_000);

beforeEach(() => {
  listClassTasksMock.mockResolvedValue({
    available: true,
    open: [task("t1", "Frações equivalentes", "2026-10-30")],
    closed: [task("t2", "Leitura do capítulo 3", "2026-10-01", "Língua Portuguesa")],
  });
});

afterEach(() => {
  cleanup();
  listClassTasksMock.mockReset();
  resetRouteLocation();
  resetCurrentAccount();
});

describe("/pedagogica/trabalhos", () => {
  it("mostra os trabalhos da turma em curso e de prazo terminado, com a disciplina", async () => {
    setRouteSearch({ turma: TURMA });
    renderRoute(Page);
    await waitFor(() => expect(screen.getByText("Frações equivalentes")).toBeDefined());
    expect(listClassTasksMock).toHaveBeenCalledWith({ data: { classGroupId: TURMA } });
    expect(screen.getByRole("region", { name: "Em curso" })).toBeDefined();
    expect(screen.getByRole("region", { name: "Prazo terminado" })).toBeDefined();
    expect(screen.getByText("Trabalho · Língua Portuguesa")).toBeDefined();
    expect(screen.getByText("Entrega até 30/10/2026")).toBeDefined();
  });

  it("com disciplina, pede só essa e não repete o nome dela em cada trabalho", async () => {
    setRouteSearch({ turma: TURMA, disciplina: MAT });
    renderRoute(Page);
    await waitFor(() => expect(screen.getByText("Frações equivalentes")).toBeDefined());
    expect(listClassTasksMock).toHaveBeenCalledWith({
      data: { classGroupId: TURMA, subjectId: MAT },
    });
    expect(screen.queryByText("Trabalho · Matemática")).toBeNull();
  });

  it("sem trabalhos, leva ao horário da turma, onde se criam", async () => {
    listClassTasksMock.mockResolvedValue({ available: true, open: [], closed: [] });
    setRouteSearch({ turma: TURMA });
    renderRoute(Page);
    await waitFor(() =>
      expect(screen.getByText("Ainda não há trabalhos nesta turma")).toBeDefined(),
    );
    expect(screen.getByRole("link", { name: "Abrir o horário da turma" })).toBeDefined();
  });

  it("de um professor, pede os trabalhos dele e diz a turma de cada um", async () => {
    const PROF = "66666666-6666-4666-8666-666666666666";
    listClassTasksMock.mockResolvedValue({
      available: true,
      open: [{ ...task("t1", "Frações equivalentes", "2026-10-30"), className: "10.ª A" }],
      closed: [],
    });
    setCurrentAccount({ role: "Secretaria" });
    setRouteSearch({ professor: PROF });
    renderRoute(Page);
    await waitFor(() => expect(screen.getByText("Frações equivalentes")).toBeDefined());
    expect(listClassTasksMock).toHaveBeenCalledWith({ data: { teacherId: PROF } });
    expect(screen.getByText("Trabalho · 10.ª A · Matemática")).toBeDefined();
    expect(screen.getByRole("link", { name: "horário do professor" })).toBeDefined();
  });

  it("sem turma na URL pede para escolher uma, sem chamar o servidor", () => {
    renderRoute(Page);
    expect(screen.getByText("Escolha uma turma")).toBeDefined();
    expect(listClassTasksMock).not.toHaveBeenCalled();
  });

  it("o encarregado não pede os trabalhos da turma", () => {
    setCurrentAccount({ role: "Encarregado" });
    setRouteSearch({ turma: TURMA });
    renderRoute(Page);
    expect(screen.getByText("Sem acesso aos trabalhos da turma")).toBeDefined();
    expect(listClassTasksMock).not.toHaveBeenCalled();
  });
});
