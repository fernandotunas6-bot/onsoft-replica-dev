import { describe, expect, it } from "vitest";
import type { ScheduleSlot } from "@/features/academic/schedule/types";
import {
  classTimetableQuality,
  freeRooms,
  lessonWindows,
  roomOccupancy,
  substituteCandidates,
  teacherLoads,
} from "@/features/academic/schedule/utils/insights";
import {
  firstOccurrence,
  fileSlug,
  timetableCsvColumns,
  timetableIcs,
} from "@/features/academic/schedule/utils/exporters";
import {
  defaultWindows,
  proposeTimetable,
  windowsForShift,
} from "@/features/academic/schedule/utils/autoSchedule";

let seq = 0;
function slot(overrides: Partial<ScheduleSlot>): ScheduleSlot {
  seq += 1;
  return {
    id: `slot-${seq}`,
    class_group_id: "10a",
    class_group_name: "10ª A",
    weekday: 1,
    starts_at: "07:00",
    ends_at: "07:45",
    subject_id: "mat",
    subject_name: "Matemática",
    teacher_id: "ana",
    teacher_name: "Ana Sapalo",
    room_id: "r101",
    room_name: "Sala D101",
    label: "Sala D101",
    display_label: "Matemática",
    ...overrides,
  };
}

const rooms = [
  { id: "r101", name: "Sala D101", code: "D101", capacity: 40, room_type: "standard" },
  { id: "r102", name: "Sala D102", code: "D102", capacity: 30, room_type: "standard" },
  { id: "lab", name: "Laboratório", code: "LAB", capacity: 25, room_type: "biology_lab" },
];
const teachers = [
  { id: "ana", name: "Ana Sapalo", max_weekly_hours: 2 },
  { id: "rui", name: "Rui Ndala" },
  { id: "eva", name: "Eva Lumbo" },
];

describe("carga dos professores", () => {
  it("conta aulas, furos, sequência mais longa e o limite semanal", () => {
    const slots = [
      slot({ starts_at: "07:00", ends_at: "07:45" }),
      slot({ starts_at: "07:50", ends_at: "08:35" }),
      // Intervalo de 20 min não é furo: a sequência continua.
      slot({ starts_at: "08:55", ends_at: "09:40" }),
      // 50 min sem aula: furo.
      slot({ starts_at: "10:30", ends_at: "11:15" }),
      slot({ weekday: 3, starts_at: "07:00", ends_at: "07:45" }),
      slot({ teacher_id: "rui", teacher_name: "Rui Ndala", subject_id: "fis" }),
    ];
    const [ana, rui] = teacherLoads(slots, teachers);
    expect(ana).toMatchObject({
      name: "Ana Sapalo",
      lessons: 5,
      minutes: 225,
      days: 2,
      perDay: { 1: 4, 3: 1 },
      longestRun: 3,
      gaps: 1,
      gapMinutes: 50,
      overLimit: true, // 3h45 > 2h
    });
    expect(rui).toMatchObject({ lessons: 1, overLimit: false, maxWeekly: null });
    expect(teacherLoads(slots, teachers).some((t) => t.teacherId === "eva")).toBe(false);
  });
});

describe("precisão temporal nos recursos e exportações", () => {
  it("conserva segundos nas janelas e detecta ocupação parcial da sala", () => {
    const rows = [slot({ starts_at: "08:00:15", ends_at: "09:00:30" })];
    expect(lessonWindows(rows)).toEqual([{ startsAt: "08:00:15", endsAt: "09:00:30" }]);
    expect(
      freeRooms({
        slots: rows,
        rooms,
        weekday: 1,
        startsAt: "09:00:00",
        endsAt: "10:00:00",
        minCapacity: 1,
      }).some((r) => r.id === "r101"),
    ).toBe(false);
    expect(teacherLoads(rows, teachers)[0]?.minutes).toBeCloseTo(60.25);
  });
  it("não trunca os segundos ao exportar CSV ou ICS", () => {
    const row = slot({ weekday: 3, starts_at: "08:40:15", ends_at: "09:25:30" });
    const columns = timetableCsvColumns(new Map());
    expect(columns.find((c) => c.label === "Hora de Início")?.value(row)).toBe("08:40:15");
    const ics = timetableIcs([row], {
      calendarName: "Teste",
      from: "2026-10-26",
      until: "2026-10-30",
    });
    expect(ics).toContain("DTSTART:20261028T074015Z");
    expect(ics).toContain("DTEND:20261028T082530Z");
  });
});

describe("qualidade do horário da turma", () => {
  it("sem avisos dá 100", () => {
    const slots = [1, 2, 3].flatMap((weekday) => [
      slot({ weekday, subject_id: "mat", subject_name: "Matemática" }),
      slot({
        weekday,
        starts_at: "07:50",
        ends_at: "08:35",
        subject_id: "fis",
        subject_name: "Física",
      }),
    ]);
    expect(classTimetableQuality(slots)).toMatchObject({ score: 100, issues: [] });
  });

  it("aponta furos, disciplina três vezes no dia, dias desequilibrados e concentração", () => {
    const slots = [
      slot({ starts_at: "07:00", ends_at: "07:45" }),
      slot({ starts_at: "07:50", ends_at: "08:35" }),
      slot({ starts_at: "08:40", ends_at: "09:25" }),
      slot({ starts_at: "11:00", ends_at: "11:45", subject_id: "fis", subject_name: "Física" }),
      slot({ weekday: 2, subject_id: "fis", subject_name: "Física" }),
    ];
    const { score, issues } = classTimetableQuality(slots);
    expect(issues.map((issue) => issue.code).sort()).toEqual([
      "gap",
      "subject_clustered",
      "subject_day_overload",
      "unbalanced_days",
    ]);
    expect(issues.find((i) => i.code === "subject_day_overload")?.message).toBe(
      "Matemática: 3 aulas na segunda.",
    );
    expect(score).toBe(100 - 8 - 10 - 6 - 5);
  });
});

describe("salas", () => {
  const slots = [
    slot({ room_id: "r101" }),
    slot({ weekday: 2, room_id: null, room_name: null, label: "sala d102" }),
    slot({ weekday: 3, room_id: null, room_name: null, label: "A definir" }),
  ];

  it("ocupação pela ligação ao cadastro ou pelo nome, sem contar «A definir»", () => {
    const occupancy = roomOccupancy(slots, rooms);
    expect(occupancy.map((r) => [r.name, r.lessons])).toEqual([
      ["Sala D101", 1],
      ["Sala D102", 1],
      ["Laboratório", 0],
    ]);
    expect(occupancy[0]!.share).toBeCloseTo(1 / 3);
    expect(occupancy[0]!.busiestWeekday).toBe(1);
  });

  it("salas livres: as que cabem a turma primeiro, da mais justa", () => {
    const free = freeRooms({
      slots,
      rooms,
      weekday: 1,
      startsAt: "07:30",
      endsAt: "08:15",
      minCapacity: 28,
    });
    expect(free.map((r) => [r.id, r.fits])).toEqual([
      ["r102", true],
      ["lab", false],
    ]);
  });

  it("janelas de aula distintas, por ordem", () => {
    expect(
      lessonWindows([slot({ starts_at: "07:50", ends_at: "08:35" }), slot({}), slot({})]),
    ).toEqual([
      { startsAt: "07:00", endsAt: "07:45" },
      { startsAt: "07:50", endsAt: "08:35" },
    ]);
  });
});

describe("substitutos", () => {
  it("só professores livres, primeiro quem conhece a disciplina e a turma e já está na escola", () => {
    const target = slot({ weekday: 2, starts_at: "08:40", ends_at: "09:25" });
    const slots = [
      target,
      // Rui: dá Matemática noutra turma e tem aula logo antes.
      slot({
        weekday: 2,
        starts_at: "07:50",
        ends_at: "08:35",
        teacher_id: "rui",
        class_group_id: "10b",
      }),
      // Eva: ocupada no mesmo tempo.
      slot({
        weekday: 2,
        starts_at: "08:40",
        ends_at: "09:25",
        teacher_id: "eva",
        class_group_id: "7a",
      }),
    ];
    const candidates = substituteCandidates({ slots, teachers, target });
    expect(candidates.map((c) => c.teacherId)).toEqual(["rui"]);
    expect(candidates[0]).toMatchObject({
      knowsSubject: true,
      knowsClass: false,
      adjacent: true,
      lessonsThatDay: 1,
    });
  });
});

describe("exportar", () => {
  it("CSV com as colunas do modelo de importação e o código da turma", () => {
    const columns = timetableCsvColumns(new Map([["10a", "DH26-10A"]]));
    expect(columns.map((c) => c.label)).toEqual([
      "Turma",
      "Disciplina",
      "Professor (Nº Agente ou BI)",
      "Dia da Semana",
      "Hora de Início",
      "Hora de Fim",
      "Sala",
    ]);
    const row = slot({ weekday: 4, starts_at: "13:50:00", ends_at: "14:35:00" });
    expect(columns.map((c) => c.value(row))).toEqual([
      "DH26-10A",
      "Matemática",
      "Ana Sapalo",
      "Quinta-feira",
      "13:50",
      "14:35",
      "Sala D101",
    ]);
  });

  it("iCalendar: cada aula repete todas as semanas até ao fim do ano, à hora de Luanda", () => {
    expect(firstOccurrence("2026-10-28", 1)).toBe("2026-11-02"); // quarta → segunda seguinte
    expect(firstOccurrence("2026-10-26", 1)).toBe("2026-10-26");
    const ics = timetableIcs([slot({ weekday: 3, starts_at: "08:40", ends_at: "09:25" })], {
      calendarName: "Horário 10ª A",
      from: "2026-10-26",
      until: "2027-07-31",
    });
    expect(ics).toContain("DTSTART:20261028T074000Z");
    expect(ics).toContain("DTEND:20261028T082500Z");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20270731T225959Z");
    expect(ics).toContain("LOCATION:Sala D101");
    expect(ics).toContain("X-WR-CALNAME:Horário 10ª A");
  });

  it("nome de ficheiro sem acentos nem espaços", () => {
    expect(fileSlug("Turma 10ª A · Ciências")).toBe("turma-10a-a-ciencias");
  });
});

describe("proposta automática", () => {
  const classSubjects = [
    { class_group_id: "10a", subject_id: "mat", weekly_periods: 4, teacher_id: "ana" },
    { class_group_id: "10a", subject_id: "fis", weekly_periods: 3, teacher_id: "rui" },
    { class_group_id: "10a", subject_id: "qui", weekly_periods: 2, teacher_id: null },
  ];
  const subjects = [
    { id: "mat", name: "Matemática" },
    { id: "fis", name: "Física" },
    { id: "qui", name: "Química" },
  ];

  it("grelha por omissão do turno: 45 min, mudança de 5 e intervalo de 20", () => {
    expect(defaultWindows("afternoon").slice(0, 4)).toEqual([
      { startsAt: "13:00", endsAt: "13:45" },
      { startsAt: "13:50", endsAt: "14:35" },
      { startsAt: "14:40", endsAt: "15:25" },
      { startsAt: "15:45", endsAt: "16:30" },
    ]);
    expect(windowsForShift([], "morning")).toEqual([]);
  });

  it("preenche só o que falta, sem conflitos, até 2 por dia e explica o que não coube", () => {
    // Já existe 1 aula de Matemática; Rui está ocupado à segunda de manhã toda.
    const busyRui = defaultWindows("morning").map((w) =>
      slot({
        weekday: 1,
        starts_at: w.startsAt,
        ends_at: w.endsAt,
        teacher_id: "rui",
        class_group_id: "7a",
      }),
    );
    const existing = [slot({ weekday: 1, starts_at: "07:00", ends_at: "07:45" })];
    const { placements, unplaced } = proposeTimetable({
      classGroupId: "10a",
      windows: defaultWindows("morning"),
      weekdays: [1, 2, 3, 4, 5],
      rooms: [
        { id: "r101", name: "Sala 1", code: "1", capacity: 40, room_type: "standard" },
        { id: "r102", name: "Sala 2", code: "2", capacity: 40, room_type: "standard" },
      ],
      shift: "morning",
      classSubjects,
      subjects,
      teachers: teachers.map((t) => (t.id === "ana" ? { ...t, max_weekly_hours: 4 } : t)),
      slots: [...existing, ...busyRui],
    });
    const count = (id: string) => placements.filter((p) => p.subjectId === id).length;
    expect(count("mat")).toBe(3);
    expect(count("fis")).toBe(3);
    expect(placements.some((p) => p.subjectId === "fis" && p.weekday === 1)).toBe(false);
    for (const id of ["mat", "fis"])
      for (const day of [1, 2, 3, 4, 5]) {
        const existingThatDay = existing.filter(
          (s) => s.subject_id === id && s.weekday === day,
        ).length;
        expect(
          placements.filter((p) => p.subjectId === id && p.weekday === day).length +
            existingThatDay,
        ).toBeLessThanOrEqual(2);
      }
    // Nada no mesmo tempo da turma nem do professor.
    const keys = placements.map((p) => `${p.weekday}-${p.startsAt}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("1-07:00");
    expect(unplaced).toEqual([
      expect.objectContaining({
        subjectId: "qui",
        missing: 2,
        reason: "Sem professor atribuído à disciplina nesta turma.",
      }),
    ]);
  });

  it("diz quando o professor não tem tempos livres", () => {
    const allBusy = [1, 2, 3, 4, 5].flatMap((weekday) =>
      defaultWindows("morning").map((w) =>
        slot({
          weekday,
          starts_at: w.startsAt,
          ends_at: w.endsAt,
          teacher_id: "rui",
          class_group_id: "7a",
        }),
      ),
    );
    const { unplaced } = proposeTimetable({
      classGroupId: "10a",
      windows: defaultWindows("morning"),
      weekdays: [1, 2, 3, 4, 5],
      rooms: [
        { id: "r101", name: "Sala 1", code: "1", capacity: 40, room_type: "standard" },
        { id: "r102", name: "Sala 2", code: "2", capacity: 40, room_type: "standard" },
      ],
      shift: "morning",
      classSubjects: classSubjects.slice(1, 2),
      subjects,
      teachers,
      slots: allBusy,
    });
    expect(unplaced[0]).toMatchObject({
      subjectId: "fis",
      missing: 3,
      reason: "Rui Ndala não tem tempos livres nesta grelha.",
    });
  });
});
