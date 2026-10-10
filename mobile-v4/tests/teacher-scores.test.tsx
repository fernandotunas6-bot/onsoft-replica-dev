import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AcademicCatalog } from "../src/domain/catalog";
import type { Context, Gateway } from "../src/domain/model";
import {
  parseScoreInput,
  parseTeacherAssessments,
  type TeacherAssessments,
} from "../src/domain/assessments";
import { TeacherScores } from "../src/components/TeacherScores";
import { ApiError, ApiGateway } from "../src/services/api";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const teacher: Context = { schoolId: id(1), userId: id(3), role: "professor" };
const seen = "2026-10-10T08:00:00.000Z";
function catalog(): AcademicCatalog {
  return {
    schoolId: teacher.schoolId,
    role: "professor",
    classes: [
      {
        classSubjectId: id(4),
        classGroupId: id(5),
        academicYearId: id(6),
        subjectId: id(7),
        className: "10.ª A",
        subjectName: "Matemática",
        teacher: { id: id(8), userId: teacher.userId, name: "Docente" },
        students: [
          { studentId: id(9), userId: null, enrollmentId: id(10), name: "Ana" },
          { studentId: id(11), userId: null, enrollmentId: id(12), name: "Bruno" },
        ],
      },
    ],
    timetable: [],
    tasks: [],
  };
}
function raw() {
  return {
    schoolId: teacher.schoolId,
    items: [
      {
        id: id(20),
        classSubjectId: id(4),
        term: 1,
        name: "Teste 1",
        kind: "test",
        assessedOn: "2026-10-01",
        maxScore: 10,
        scores: [{ enrollmentId: id(10), score: 7, updatedAt: seen }],
      },
    ],
  };
}
const data = (): TeacherAssessments => parseTeacherAssessments(raw(), teacher, catalog());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("contrato e campo de nota", () => {
  it.each(["school", "class", "term", "duplicate", "score"])("recusa %s", (kind) => {
    const d = raw() as unknown as { schoolId: string; items: Record<string, unknown>[] };
    if (kind === "school") d.schoolId = id(30);
    if (kind === "class") d.items[0].classSubjectId = id(30);
    if (kind === "term") d.items[0].term = 4;
    if (kind === "duplicate") d.items.push(d.items[0]);
    if (kind === "score")
      d.items[0].scores = [{ enrollmentId: id(10), score: "7", updatedAt: seen }];
    expect(() => parseTeacherAssessments(d, teacher, catalog())).toThrow("Contrato das avaliações");
  });
  it("lê vírgula, apaga com vazio e recusa acima da cotação", () => {
    expect(parseScoreInput("8,5", 10)).toBe(8.5);
    expect(parseScoreInput(" ", 10)).toBeNull();
    expect(parseScoreInput("11", 10)).toBeUndefined();
    expect(parseScoreInput("abc", null)).toBeUndefined();
    expect(parseScoreInput("20", null)).toBe(20);
  });
});

describe("gateway das notas", () => {
  it("envia só alunos da turma, abaixo da cotação, com a versão vista", async () => {
    const fetch = vi.fn();
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    fetch.mockResolvedValueOnce(
      json({
        userId: teacher.userId,
        name: "Docente",
        memberships: [
          {
            schoolId: teacher.schoolId,
            schoolName: "Escola",
            active: true,
            roles: ["professor"],
            permissions: ["academic.read", "grades.write"],
          },
        ],
      }),
    );
    fetch.mockResolvedValueOnce(json(raw()));
    fetch.mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const api = new ApiGateway("/api/mobile-v4", { accessToken: async () => "jwt" });
    await api.session();
    const list = await api.teacherAssessments(teacher, catalog());
    expect(fetch.mock.calls[1][0]).toBe(
      `/api/mobile-v4/schools/${teacher.schoolId}/assessments?role=professor`,
    );
    await expect(
      api.recordScores(teacher, catalog(), list, id(20), [
        { enrollmentId: id(10), score: 11, expectedUpdatedAt: seen },
      ]),
    ).rejects.toThrow("acima da cotação");
    await expect(
      api.recordScores(teacher, catalog(), list, id(20), [
        { enrollmentId: id(99), score: 5, expectedUpdatedAt: null },
      ]),
    ).rejects.toThrow("fora da turma");
    const entries = [{ enrollmentId: id(10), score: 9, expectedUpdatedAt: seen }];
    await api.recordScores(teacher, catalog(), list, id(20), entries);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({
      role: "professor",
      command: { type: "scores", itemId: id(20), entries },
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("ecrã de notas", () => {
  function fake(recordScores: Gateway["recordScores"]): Gateway {
    return {
      session: vi.fn(),
      workspace: vi.fn(),
      execute: vi.fn(),
      signOut: vi.fn(),
      teacherAssessments: vi.fn().mockResolvedValue(data()),
      recordScores,
    };
  }
  it("grava só as notas mudadas, com a versão que o professor viu", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const gateway = fake(record);
    render(<TeacherScores catalog={catalog()} ctx={teacher} gateway={gateway} />);
    fireEvent.click(await screen.findByRole("button", { name: "Lançar" }));
    const [ana, bruno] = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(ana.value).toBe("7");
    fireEvent.change(bruno, { target: { value: "11" } });
    expect(screen.getByText("Nota inválida (0 a 10).")).toBeTruthy();
    fireEvent.change(bruno, { target: { value: "8,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Gravar 1 nota(s)" }));
    await screen.findByText("1 nota(s) gravada(s).");
    expect(record).toHaveBeenCalledWith(teacher, catalog(), data(), id(20), [
      { enrollmentId: id(12), score: 8.5, expectedUpdatedAt: null },
    ]);
  });
  it("conflito: avisa e volta a ler", async () => {
    const gateway = fake(vi.fn().mockRejectedValue(new ApiError(409, "conflito")));
    render(<TeacherScores catalog={catalog()} ctx={teacher} gateway={gateway} />);
    fireEvent.click(await screen.findByRole("button", { name: "Lançar" }));
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Gravar 1 nota(s)" }));
    expect((await screen.findByRole("alert")).textContent).toContain("mudaram entretanto");
    expect(gateway.teacherAssessments).toHaveBeenCalledTimes(2);
  });
});
