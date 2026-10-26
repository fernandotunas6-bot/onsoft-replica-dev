import { describe, expect, it } from "vitest";
import {
  isMissingPresenceColumn,
  luandaTimeOf,
  readTeacherPresence,
  teacherCheckinWindow,
  teacherLateMinutes,
  teacherPresenceState,
} from "@/features/pedagogica/teacher-presence";
import { pickLessonSession, pickLessonSlot } from "@/features/pedagogica/attendance-server";

const today = "2026-10-26";
const lesson = { lessonDate: today, startsAt: "08:00:00", endsAt: "08:45:00", today };

describe("janela da confirmação do professor", () => {
  it("abre 15 minutos antes do início e fecha no fim da aula", () => {
    expect(teacherCheckinWindow({ ...lesson, nowTime: "07:44" })).toBe("too_early");
    expect(teacherCheckinWindow({ ...lesson, nowTime: "07:45" })).toBe("open");
    expect(teacherCheckinWindow({ ...lesson, nowTime: "08:30" })).toBe("open");
    expect(teacherCheckinWindow({ ...lesson, nowTime: "08:45" })).toBe("closed");
  });

  it("só no dia da aula", () => {
    expect(teacherCheckinWindow({ ...lesson, lessonDate: "2026-10-27", nowTime: "08:00" })).toBe(
      "other_day",
    );
    expect(teacherCheckinWindow({ ...lesson, lessonDate: "2026-10-25", nowTime: "08:00" })).toBe(
      "closed",
    );
  });

  it("aula sem hora aceita durante o dia", () => {
    expect(
      teacherCheckinWindow({ ...lesson, startsAt: null, endsAt: null, nowTime: "16:00" }),
    ).toBe("open");
  });
});

describe("atraso", () => {
  it("conta os minutos depois do início, nunca negativo", () => {
    expect(teacherLateMinutes("08:00:00", "07:50")).toBe(0);
    expect(teacherLateMinutes("08:00:00", "08:00")).toBe(0);
    expect(teacherLateMinutes("08:00:00", "08:12")).toBe(12);
    expect(teacherLateMinutes(null, "08:12")).toBe(0);
  });
});

describe("estado da presença", () => {
  const base = { ...lesson, sessionStatus: "pending", checkedInAt: null, lateMinutes: null };

  it("confirmado a horas (até 5 min) e atrasado depois", () => {
    const checked = { ...base, checkedInAt: "2026-10-26T07:02:00Z", nowTime: "08:10" };
    expect(teacherPresenceState({ ...checked, lateMinutes: 2 })).toBe("confirmed");
    expect(teacherPresenceState({ ...checked, lateMinutes: 5 })).toBe("confirmed");
    expect(teacherPresenceState({ ...checked, lateMinutes: 6 })).toBe("late");
  });

  it("sem confirmação: antes, durante e depois da aula", () => {
    expect(teacherPresenceState({ ...base, nowTime: "07:50" })).toBe("upcoming");
    expect(teacherPresenceState({ ...base, nowTime: "08:10" })).toBe("awaiting");
    expect(teacherPresenceState({ ...base, nowTime: "09:00" })).toBe("missing");
    expect(teacherPresenceState({ ...base, today: "2026-10-27", nowTime: "07:00" })).toBe(
      "missing",
    );
    expect(teacherPresenceState({ ...base, today: "2026-10-25", nowTime: "09:00" })).toBe(
      "upcoming",
    );
  });

  it("chamada feita sem hora de entrada (antes desta funcionalidade) e aula cancelada", () => {
    expect(teacherPresenceState({ ...base, sessionStatus: "completed", nowTime: "10:00" })).toBe(
      "call_only",
    );
    expect(teacherPresenceState({ ...base, sessionStatus: "cancelled", nowTime: "08:10" })).toBe(
      "cancelled",
    );
  });
});

describe("colunas da presença", () => {
  it("sabe se a migração já correu pela presença da coluna na linha", () => {
    expect(readTeacherPresence({ id: "x" }).enabled).toBe(false);
    const read = readTeacherPresence({
      teacher_checked_in_at: "2026-10-26T07:03:00Z",
      teacher_checkin_method: "qr",
      teacher_late_minutes: 3,
    });
    expect(read.enabled).toBe(true);
    expect(read.fields.teacher_checkin_method).toBe("qr");
    expect(read.fields.teacher_late_minutes).toBe(3);
    expect(
      readTeacherPresence({ teacher_checked_in_at: null, teacher_checkin_method: "x" }).fields
        .teacher_checkin_method,
    ).toBeNull();
  });

  it("reconhece a coluna em falta", () => {
    expect(isMissingPresenceColumn({ code: "42703" })).toBe(true);
    expect(isMissingPresenceColumn({ code: "PGRST204" })).toBe(true);
    expect(isMissingPresenceColumn({ code: "23505" })).toBe(false);
    expect(isMissingPresenceColumn(null)).toBe(false);
  });

  it("mostra a hora em Luanda (UTC+1)", () => {
    expect(luandaTimeOf("2026-10-26T07:03:00Z")).toBe("08:03");
    expect(luandaTimeOf(null)).toBe("");
  });
});

describe("dois tempos da mesma disciplina no mesmo dia", () => {
  const first = { id: "a", status: "pending", starts_at: "08:00:00", ends_at: "08:45:00" };
  const second = { id: "b", status: "pending", starts_at: "10:00:00", ends_at: "10:45:00" };

  it("escolhe a sessão em curso, depois a próxima por fazer", () => {
    expect(pickLessonSession([second, first], "08:10")?.id).toBe("a");
    expect(pickLessonSession([first, second], "09:00")?.id).toBe("b");
    expect(pickLessonSession([{ ...first, status: "completed" }, second], "07:00")?.id).toBe("b");
  });

  it("sem hora (outro dia): a primeira por fazer; tudo feito: a última", () => {
    expect(pickLessonSession([second, first], null)?.id).toBe("a");
    expect(
      pickLessonSession(
        [
          { ...first, status: "completed" },
          { ...second, status: "completed" },
        ],
        "12:00",
      )?.id,
    ).toBe("b");
    expect(pickLessonSession([], "08:00")).toBeNull();
  });

  it("liga a sessão nova ao tempo em curso, ao próximo ou ao primeiro", () => {
    const slots = [
      { id: "s2", starts_at: "10:00:00", ends_at: "10:45:00" },
      { id: "s1", starts_at: "08:00:00", ends_at: "08:45:00" },
    ];
    expect(pickLessonSlot(slots, "08:20")?.id).toBe("s1");
    expect(pickLessonSlot(slots, "09:00")?.id).toBe("s2");
    expect(pickLessonSlot(slots, "12:00")?.id).toBe("s2");
    expect(pickLessonSlot(slots, null)?.id).toBe("s1");
    expect(pickLessonSlot([], "08:00")).toBeNull();
  });
});
