import { describe, expect, it } from "vitest";
import {
  blockKey,
  cellKey,
  diffPlacements,
  normalizeCellKey,
  subjectWeight,
  suggestTimetable,
  validatePlacements,
  type EngineDemand,
  type EngineInput,
  type EnginePlacement,
} from "@/features/academic/timetable/engine";

const blocks = [
  { number: 1, startsAt: "07:30", endsAt: "08:15" },
  { number: 2, startsAt: "08:15", endsAt: "09:00" },
  { number: 3, startsAt: "09:00", endsAt: "09:45" },
  { number: 4, startsAt: "10:00", endsAt: "10:45" },
  { number: 5, startsAt: "10:45", endsAt: "11:30" },
  { number: 6, startsAt: "11:30", endsAt: "12:15" },
];
const weekdays = [1, 2, 3, 4, 5];

function demand(
  id: string,
  name: string,
  weeklyPeriods: number,
  teacherId: string | null = `t-${id}`,
): EngineDemand {
  return {
    classSubjectId: id,
    subjectId: `s-${id}`,
    subjectName: name,
    teacherId,
    teacherName: teacherId ? `Prof. ${id}` : null,
    weeklyPeriods,
  };
}

const baseDemands = [
  demand("mat", "Matemática", 5),
  demand("lp", "Língua Portuguesa", 5),
  demand("fis", "Física", 4),
  demand("hist", "História", 3),
  demand("geo", "Geografia", 3),
  demand("edf", "Educação Física", 2),
  demand("ing", "Inglês", 3),
];

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    classGroupId: "10A",
    roomId: "room-1",
    roomLabel: "Sala 1",
    weekdays,
    blocks,
    demands: baseDemands,
    teacherBusy: {},
    roomBusy: {},
    ...overrides,
  };
}

function hasNoInternalConflicts(placements: EnginePlacement[]) {
  const seen = new Set<string>();
  for (const p of placements) {
    const k = blockKey(p.weekday, p.block);
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

describe("motor de horários", () => {
  it("coloca toda a carga semanal sem sobrepor tempos", () => {
    const result = suggestTimetable(baseInput());
    const required = baseDemands.reduce((s, d) => s + d.weeklyPeriods, 0);
    expect(result.placements).toHaveLength(required);
    expect(result.unplaced).toEqual([]);
    expect(hasNoInternalConflicts(result.placements)).toBe(true);
    expect(result.metrics.filled).toBe(required);
    expect(result.metrics.conflicts).toBe(0);
    expect(result.metrics.score).toBeGreaterThanOrEqual(85);
  });

  it("é determinístico para a mesma semente", () => {
    const a = suggestTimetable(baseInput());
    const b = suggestTimetable(baseInput());
    expect(a.placements).toEqual(b.placements);
  });

  it("nunca coloca um professor onde já está ocupado noutra turma", () => {
    const busy = ["1:07:30", "1:08:15", "2:07:30:00", "3:10:00", "4:07:30", "5:07:30"];
    const result = suggestTimetable(baseInput({ teacherBusy: { "t-mat": busy } }));
    const busySet = new Set(busy.map(normalizeCellKey));
    for (const p of result.placements.filter((x) => x.classSubjectId === "mat")) {
      expect(busySet.has(cellKey(p.weekday, p.startsAt))).toBe(false);
    }
    expect(result.unplaced).toEqual([]);
  });

  it("respeita a sala ocupada por outra turma", () => {
    const result = suggestTimetable(
      baseInput({ roomBusy: { "room-1": ["1:07:30", "1:08:15", "1:09:00"] } }),
    );
    const monday = result.placements.filter((p) => p.weekday === 1 && p.block <= 3);
    expect(monday).toEqual([]);
  });

  it("distribui a mesma disciplina pela semana (máximo 2 por dia)", () => {
    const result = suggestTimetable(baseInput());
    for (const [, days] of Object.entries(result.metrics.spread)) {
      for (const n of Object.values(days)) expect(n).toBeLessThanOrEqual(2);
    }
    // Matemática tem 5 tempos: tem de aparecer em pelo menos 3 dias distintos.
    expect(Object.keys(result.metrics.spread.mat ?? {}).length).toBeGreaterThanOrEqual(3);
  });

  it("coloca disciplinas pesadas mais cedo do que as leves, em média", () => {
    const result = suggestTimetable(baseInput());
    const avgBlock = (id: string) => {
      const ps = result.placements.filter((p) => p.classSubjectId === id);
      return ps.reduce((s, p) => s + p.block, 0) / ps.length;
    };
    expect(avgBlock("mat")).toBeLessThan(avgBlock("edf"));
  });

  it("reporta tempos por colocar quando o professor não tem disponibilidade", () => {
    const allCells = weekdays.flatMap((w) => blocks.map((b) => cellKey(w, b.startsAt)));
    const result = suggestTimetable(baseInput({ teacherBusy: { "t-hist": allCells } }));
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0]).toMatchObject({ classSubjectId: "hist", missing: 3 });
    expect(result.unplaced[0]!.reason).toMatch(/professor/i);
    expect(result.placements.filter((p) => p.classSubjectId === "hist")).toEqual([]);
  });

  it("respeita as janelas de disponibilidade do professor", () => {
    const result = suggestTimetable(
      baseInput({
        teacherAvailability: {
          "t-ing": [
            { weekday: 1, startsAt: "07:30", endsAt: "09:00", available: true },
            { weekday: 2, startsAt: "07:30", endsAt: "09:00", available: true },
            { weekday: 3, startsAt: "07:30", endsAt: "09:00", available: true },
          ],
        },
      }),
    );
    for (const p of result.placements.filter((x) => x.classSubjectId === "ing")) {
      expect([1, 2, 3]).toContain(p.weekday);
      expect(p.block).toBeLessThanOrEqual(2);
    }
  });

  it("mantém as células fixadas pelo utilizador", () => {
    const pinned: EnginePlacement[] = [
      {
        classSubjectId: "edf",
        weekday: 5,
        block: 6,
        startsAt: "11:30",
        endsAt: "12:15",
        roomId: "room-1",
        room: "Sala 1",
      },
      {
        classSubjectId: "edf",
        weekday: 3,
        block: 6,
        startsAt: "11:30",
        endsAt: "12:15",
        roomId: "room-1",
        room: "Sala 1",
      },
    ];
    const result = suggestTimetable(baseInput({ pinned }));
    const edf = result.placements.filter((p) => p.classSubjectId === "edf");
    expect(edf).toHaveLength(2);
    expect(edf.map((p) => blockKey(p.weekday, p.block)).sort()).toEqual(["3:6", "5:6"]);
    expect(edf.every((p) => p.pinned)).toBe(true);
  });

  it("no período seguinte mantém a maior parte do modelo anterior e explica o que mudou", () => {
    const first = suggestTimetable(baseInput());
    // Segundo período: o professor de Matemática passa a estar ocupado num tempo onde tinha aula.
    const matSlot = first.placements.find((p) => p.classSubjectId === "mat")!;
    const busyCell = cellKey(matSlot.weekday, matSlot.startsAt);
    const second = suggestTimetable(
      baseInput({
        previous: first.placements,
        teacherBusy: { "t-mat": [busyCell] },
        options: { continuityWeight: 20 },
      }),
    );
    expect(second.unplaced).toEqual([]);
    expect(second.metrics.continuity).toBeGreaterThanOrEqual(80);
    const moved = second.changes.filter((c) => c.kind === "moved");
    expect(moved.length).toBeGreaterThanOrEqual(1);
    const matMove = moved.find((c) => c.classSubjectId === "mat");
    expect(matMove?.reason).toMatch(/passou a ter aula noutra turma/);
    expect(second.explanations[0]).toMatch(/Continuidade de \d+%/);
  });

  it("quando a carga diminui, retira tempos e mantém os restantes", () => {
    const first = suggestTimetable(baseInput());
    const reduced = baseDemands.map((d) =>
      d.classSubjectId === "geo" ? { ...d, weeklyPeriods: 2 } : d,
    );
    const second = suggestTimetable(
      baseInput({
        demands: reduced,
        previous: first.placements,
        options: { continuityWeight: 20 },
      }),
    );
    expect(second.placements.filter((p) => p.classSubjectId === "geo")).toHaveLength(2);
    expect(second.changes.some((c) => c.kind === "removed" && c.classSubjectId === "geo")).toBe(
      true,
    );
  });

  it("assinala quando uma disciplina deixou de existir na turma", () => {
    const first = suggestTimetable(baseInput());
    const without = baseDemands.filter((d) => d.classSubjectId !== "ing");
    const second = suggestTimetable(baseInput({ demands: without, previous: first.placements }));
    const removed = second.changes.filter(
      (c) => c.kind === "removed" && c.classSubjectId === "ing",
    );
    expect(removed.length).toBe(3);
    expect(removed[0]!.reason).toMatch(/já não faz parte/);
  });

  it("não usa células bloqueadas", () => {
    const result = suggestTimetable(baseInput({ blockedCells: ["1:1", "1:2", "5:6"] }));
    const used = new Set(result.placements.map((p) => blockKey(p.weekday, p.block)));
    expect(used.has("1:1")).toBe(false);
    expect(used.has("1:2")).toBe(false);
    expect(used.has("5:6")).toBe(false);
    expect(result.metrics.capacity).toBe(27);
  });
});

describe("diff e validação", () => {
  const demandById = new Map(baseDemands.map((d) => [d.classSubjectId, d]));
  const p = (id: string, weekday: number, block: number): EnginePlacement => ({
    classSubjectId: id,
    weekday,
    block,
    startsAt: blocks[block - 1]!.startsAt,
    endsAt: blocks[block - 1]!.endsAt,
    roomId: "room-1",
    room: "Sala 1",
  });

  it("classifica mantidos, movidos, novos e retirados", () => {
    const prev = [p("mat", 1, 1), p("mat", 2, 1), p("lp", 1, 2)];
    const next = [p("mat", 1, 1), p("mat", 3, 1), p("hist", 1, 2)];
    const changes = diffPlacements(prev, next, demandById);
    expect(changes.filter((c) => c.kind === "kept")).toHaveLength(1);
    expect(changes.filter((c) => c.kind === "moved")).toHaveLength(1);
    expect(changes.filter((c) => c.kind === "removed").map((c) => c.classSubjectId)).toEqual([
      "lp",
    ]);
    expect(changes.filter((c) => c.kind === "added").map((c) => c.classSubjectId)).toEqual([
      "hist",
    ]);
  });

  it("detecta conflitos numa grelha editada à mão", () => {
    const issues = validatePlacements({ ...baseInput(), teacherBusy: { "t-mat": ["1:07:30"] } }, [
      p("mat", 1, 1),
      p("lp", 1, 1),
      p("fis", 2, 1),
    ]);
    expect(issues.some((i) => i.message.includes("já tem aula noutra turma"))).toBe(true);
    expect(issues.some((i) => i.message.includes("Duas disciplinas"))).toBe(true);
  });

  it("avisa quando há mais tempos marcados do que a carga", () => {
    const issues = validatePlacements(baseInput(), [
      p("edf", 1, 1),
      p("edf", 2, 1),
      p("edf", 3, 1),
    ]);
    expect(issues.find((i) => i.message.startsWith("Educação Física"))?.message).toMatch(
      /3 tempos/,
    );
  });

  it("pesa disciplinas por nome", () => {
    expect(subjectWeight("Matemática")).toBe(1);
    expect(subjectWeight("Educação Física")).toBe(0);
    expect(subjectWeight("Física")).toBe(1);
    expect(subjectWeight("História")).toBeCloseTo(0.55);
  });
});
