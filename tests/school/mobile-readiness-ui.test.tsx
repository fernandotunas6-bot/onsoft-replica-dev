// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { buildMobileReadiness } from "@/features/school/mobile-readiness";
import { ReadinessContent } from "@/features/school/MobileReadinessContent";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    search,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
  }) => {
    const path = Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to);
    const query = search ? "?" + new URLSearchParams(search).toString() : "";
    return (
      <a href={path + query} {...(rest as object)}>
        {children}
      </a>
    );
  },
}));
afterEach(cleanup);

const readiness = buildMobileReadiness({
  activeYears: ["2026/2027"],
  students: [
    {
      id: "s1",
      name: "Ana Lopes",
      hasAccount: false,
      hasRole: false,
      recordActive: true,
      email: "missing",
      invitePending: false,
      classGroupIds: ["g1"],
    },
  ],
  teachers: [],
  classGroups: [
    {
      id: "g1",
      name: "10.ª A",
      students: 1,
      subjects: 0,
      subjectsWithoutTeacher: 0,
      subjectsWithoutTimetable: 0,
    },
  ],
});

describe("página de prontidão do Mobile", () => {
  it("mostra quantos estão prontos e leva a cada caso a resolver", () => {
    render(<ReadinessContent readiness={readiness} />);
    expect(screen.getByText("Alunos prontos").parentElement!.textContent).toContain("0 de 1");
    const missing = screen.getAllByText("Sem e-mail na ficha")[0]!.closest("li")!;
    expect(within(missing).getByRole("link", { name: "Ana Lopes" }).getAttribute("href")).toBe(
      "/alunos/s1",
    );
    expect(
      within(missing)
        .getByRole("link", { name: /Abrir fichas/ })
        .getAttribute("href"),
    ).toBe("/alunos");
    const turma = screen.getByText("Turmas sem disciplinas").closest("li")!;
    expect(
      within(turma)
        .getByRole("link", { name: /10\.ª A/ })
        .getAttribute("href"),
    ).toBe("/pedagogica?tab=disciplinas&turma=g1");
    // O que está resolvido não oferece acção.
    const ok = screen.getAllByText("Por convidar")[0]!.closest("li")!;
    expect(within(ok).queryByRole("link")).toBeNull();
  });
  it("sem ano lectivo activo, diz isso em vez de listas vazias", () => {
    render(<ReadinessContent readiness={{ ...readiness, activeYears: [] }} />);
    expect(screen.getByText("Sem ano lectivo activo")).toBeTruthy();
    expect(screen.queryByText("Alunos prontos")).toBeNull();
  });
});
