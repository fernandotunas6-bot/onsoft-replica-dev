import { describe, expect, it } from "vitest";
import {
  evaluateLessonAttendance,
  previewPayroll,
  type ScheduledLesson,
  type AttendanceEvent,
} from "./attendanceEngine";

const lesson: ScheduledLesson = {
  id: "lesson-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  classGroupId: "class-1",
  startsAt: "2026-09-24T08:00:00+01:00",
  endsAt: "2026-09-24T09:00:00+01:00",
};
const policy = { graceMinutes: 5, minimumPresencePercent: 80, requireVerifiedQr: true };
const event = (
  kind: AttendanceEvent["kind"],
  time: string,
  id: string = kind,
): AttendanceEvent => ({
  id,
  lessonId: lesson.id,
  teacherId: lesson.teacherId,
  schoolId: lesson.schoolId,
  kind,
  occurredAt: "2026-09-24T" + time + "+01:00",
  evidence: "lesson_qr",
  verified: true,
});
const payroll = {
  currency: "AOA" as const,
  monthlyBaseCents: 22000000,
  monthlyContractMinutes: 22 * 8 * 60,
  deductionEnabled: true,
  approvedByHr: true,
  expectedLessonCount: 1,
  expectedLessonIds: ["lesson-1"],
  expectedLessonMinutes: { "lesson-1": 60 },
};

describe("presença docente e apuramento mensal", () => {
  it("confirma aula completa com QR de entrada e saída", () => {
    const result = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:00:00"), event("check_out", "09:00:00")],
      policy,
    );
    expect(result.status).toBe("present");
    expect(result.verifiedMinutes).toBe(60);
    expect(result.evidenceIds).toHaveLength(2);
  });
  it("regista atraso além da tolerância", () => {
    const result = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:10:00"), event("check_out", "09:00:00")],
      policy,
    );
    expect(result.status).toBe("late");
    expect(result.lateMinutes).toBe(10);
  });
  it("não converte saída em falta sem revisão", () => {
    const result = evaluateLessonAttendance(lesson, [event("check_in", "08:00:00")], policy);
    expect(result.status).toBe("pending_review");
    expect(previewPayroll([result], payroll).proposedDeductionCents).toBe(0);
  });
  it("ignora QR de outra escola, outro docente e evento não validado", () => {
    const events = [event("check_in", "08:00:00"), event("check_out", "09:00:00")];
    expect(
      evaluateLessonAttendance(lesson, [{ ...events[0], schoolId: "other" }, events[1]], policy)
        .status,
    ).toBe("pending_review");
    expect(
      evaluateLessonAttendance(lesson, [{ ...events[0], teacherId: "other" }, events[1]], policy)
        .status,
    ).toBe("pending_review");
    expect(
      evaluateLessonAttendance(lesson, [{ ...events[0], verified: false }, events[1]], policy)
        .status,
    ).toBe("pending_review");
  });
  it("coloca em revisão valores sem tipo válido recebidos da API", () => {
    const checkIn = event("check_in", "08:00:00");
    const checkOut = event("check_out", "09:00:00");
    const invalid = [
      { ...checkIn, verified: "true" } as unknown as AttendanceEvent,
      { ...checkIn, evidence: "unknown" } as unknown as AttendanceEvent,
      { ...checkIn, kind: "entry" } as unknown as AttendanceEvent,
    ];
    for (const bad of invalid) {
      const result = evaluateLessonAttendance(lesson, [bad, checkOut], {
        ...policy,
        requireVerifiedQr: false,
      });
      expect(result.status).toBe("pending_review");
      expect(previewPayroll([result], payroll).proposedDeductionCents).toBe(0);
    }
    expect(evaluateLessonAttendance(lesson, [checkIn, checkOut], policy).status).toBe("present");
  });

  it("não aceita leitura de catraca como confirmação de aula quando QR é obrigatório", () => {
    const events = [event("check_in", "08:00:00"), event("check_out", "09:00:00")].map((e) => ({
      ...e,
      evidence: "gate" as const,
    }));
    expect(evaluateLessonAttendance(lesson, events, policy).status).toBe("pending_review");
  });
  it("não gera descontos por aulas canceladas ou justificadas", () => {
    expect(evaluateLessonAttendance({ ...lesson, cancelled: true }, [], policy).status).toBe(
      "excused",
    );
    expect(evaluateLessonAttendance(lesson, [], policy, true).status).toBe("excused");
  });
  it("apresenta desconto apenas após aprovação do RH", () => {
    const partial = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:30:00"), event("check_out", "09:00:00")],
      policy,
    );
    expect(partial.status).toBe("partial");
    expect(
      previewPayroll([partial], { ...payroll, approvedByHr: false }).proposedDeductionCents,
    ).toBe(0);
    expect(previewPayroll([partial], payroll).proposedDeductionCents).toBe(62500);
  });
  it("suspende todos os descontos enquanto existir outra aula por confirmar", () => {
    const partial = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:30:00"), event("check_out", "09:00:00")],
      policy,
    );
    const pending = evaluateLessonAttendance({ ...lesson, id: "lesson-2" }, [], policy);
    const preview = previewPayroll([partial, pending], {
      ...payroll,
      expectedLessonCount: 2,
      expectedLessonIds: ["lesson-1", "lesson-2"],
      expectedLessonMinutes: { "lesson-1": 60, "lesson-2": 60 },
    });
    expect(preview.unverifiedMinutes).toBe(60);
    expect(preview.proposedDeductionCents).toBe(0);
    expect(preview.requiresHrApproval).toBe(true);
  });

  it("exige revisão de scans duplicados e saída anterior à entrada", () => {
    const duplicate = evaluateLessonAttendance(
      lesson,
      [
        event("check_in", "08:00:00", "in-1"),
        event("check_in", "08:01:00", "in-2"),
        event("check_out", "09:00:00"),
      ],
      policy,
    );
    expect(duplicate.status).toBe("pending_review");
    const reversed = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:30:00"), event("check_out", "08:20:00")],
      policy,
    );
    expect(reversed.status).toBe("pending_review");
  });
  it("não aceita leitura fora da janela e permite chegada tardia durante a aula", () => {
    expect(
      evaluateLessonAttendance(
        lesson,
        [event("check_in", "07:00:00"), event("check_out", "09:00:00")],
        policy,
      ).status,
    ).toBe("pending_review");
    expect(
      evaluateLessonAttendance(
        lesson,
        [event("check_in", "08:30:00"), event("check_out", "09:00:00")],
        policy,
      ).status,
    ).toBe("partial");
  });
  it("recusa aulas com duração superior a 24 horas", () => {
    expect(() =>
      evaluateLessonAttendance({ ...lesson, endsAt: "2026-09-26T09:00:00+01:00" }, [], policy),
    ).toThrow(/24 horas/);
  });

  it("impede reutilização da mesma leitura QR em aulas diferentes", () => {
    const first = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:00:00", "qr-in"), event("check_out", "09:00:00", "qr-out")],
      policy,
    );
    const second = { ...first, lessonId: "lesson-2" };
    const twoLessons = {
      ...payroll,
      expectedLessonCount: 2,
      expectedLessonIds: ["lesson-1", "lesson-2"],
      expectedLessonMinutes: { "lesson-1": 60, "lesson-2": 60 },
    };
    expect(() => previewPayroll([first, second], twoLessons)).toThrow(/mesma evidência/);
    expect(() => previewPayroll([{ ...first, evidenceIds: ["qr-in", "qr-in"] }], payroll)).toThrow(
      /mesma evidência/,
    );
  });

  it("impede dupla contabilização da mesma aula no salário", () => {
    const confirmed = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:00:00"), event("check_out", "09:00:00")],
      policy,
    );
    expect(() => previewPayroll([confirmed, confirmed], payroll)).toThrow(/duplicadas/);
  });
  it("rejeita minutos impossíveis e presença pendente com tempo confirmado", () => {
    const confirmed = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:00:00"), event("check_out", "09:00:00")],
      policy,
    );
    expect(() => previewPayroll([{ ...confirmed, verifiedMinutes: 61 }], payroll)).toThrow(
      /inconsistente/,
    );
    expect(() => previewPayroll([{ ...confirmed, status: "pending_review" }], payroll)).toThrow(
      /inconsistente/,
    );
  });

  it("não calcula descontos se faltar uma aula do horário publicado", () => {
    const partial = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:30:00"), event("check_out", "09:00:00")],
      policy,
    );
    expect(
      previewPayroll([partial], { ...payroll, expectedLessonCount: 2 }).proposedDeductionCents,
    ).toBe(0);
    expect(
      previewPayroll([partial], { ...payroll, expectedLessonCount: 2 }).requiresHrApproval,
    ).toBe(true);
    expect(
      previewPayroll([partial], { ...payroll, expectedLessonCount: undefined })
        .proposedDeductionCents,
    ).toBe(0);
  });

  it("não permite substituir uma aula oficial por outra mantendo a mesma contagem", () => {
    const partial = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:30:00"), event("check_out", "09:00:00")],
      policy,
    );
    const wrongRoster = previewPayroll([partial], {
      ...payroll,
      expectedLessonIds: ["different-lesson"],
    });
    expect(wrongRoster.proposedDeductionCents).toBe(0);
    expect(wrongRoster.requiresHrApproval).toBe(true);
    expect(
      previewPayroll([partial], { ...payroll, expectedLessonIds: undefined })
        .proposedDeductionCents,
    ).toBe(0);
  });

  it("impede alteração silenciosa da duração de uma aula oficial", () => {
    const partial = evaluateLessonAttendance(
      lesson,
      [event("check_in", "08:30:00"), event("check_out", "09:00:00")],
      policy,
    );
    expect(() => previewPayroll([{ ...partial, scheduledMinutes: 90 }], payroll)).toThrow(
      /horário oficial/,
    );
    expect(
      previewPayroll([partial], { ...payroll, expectedLessonMinutes: undefined })
        .proposedDeductionCents,
    ).toBe(0);
  });

  it("coloca em revisão evidência QR com data inválida sem interromper o mês", () => {
    const invalid = event("check_in", "08:00:00");
    const result = evaluateLessonAttendance(
      lesson,
      [{ ...invalid, occurredAt: "data-corrompida" }, event("check_out", "09:00:00")],
      policy,
    );
    expect(result.status).toBe("pending_review");
    expect(result.evidenceIds).toHaveLength(2);
    expect(previewPayroll([result], payroll).proposedDeductionCents).toBe(0);
  });

  it("recusa estados desconhecidos vindos da API antes do desconto", () => {
    const invalid = {
      lessonId: "lesson-1",
      status: "confirmada" as "present",
      scheduledMinutes: 60,
      verifiedMinutes: 0,
      lateMinutes: 0,
      evidenceIds: [],
      reasons: [],
    };
    expect(() => previewPayroll([invalid], payroll)).toThrow(/Estado de presença inválido/);
  });

  it("arredonda descontos em cêntimos sem perder precisão monetária", () => {
    const partial = {
      lessonId: "lesson-1",
      status: "partial" as const,
      scheduledMinutes: 2,
      verifiedMinutes: 1,
      lateMinutes: 0,
      evidenceIds: ["scan-in", "scan-out"],
      reasons: [],
    };
    const result = previewPayroll([partial], {
      ...payroll,
      monthlyBaseCents: Number.MAX_SAFE_INTEGER,
      monthlyContractMinutes: 2,
      expectedLessonMinutes: { "lesson-1": 2 },
    });
    expect(result.proposedDeductionCents).toBe(4503599627370496);
    expect(result.payableBaseCents).toBe(4503599627370495);
  });
  it("não desconta mais do que o salário base quando aulas excedem a carga contratual", () => {
    const partial = {
      lessonId: "lesson-1",
      status: "absent" as const,
      scheduledMinutes: 120,
      verifiedMinutes: 0,
      lateMinutes: 0,
      evidenceIds: [],
      reasons: [],
    };
    const result = previewPayroll([partial], {
      ...payroll,
      monthlyBaseCents: 101,
      monthlyContractMinutes: 60,
      expectedLessonMinutes: { "lesson-1": 120 },
    });
    expect(result.proposedDeductionCents).toBe(101);
    expect(result.payableBaseCents).toBe(0);
  });

  it("rejeita datas civis impossíveis nos horários e coloca QR inválido em revisão", () => {
    expect(() =>
      evaluateLessonAttendance({ ...lesson, startsAt: "2026-09-31T08:00:00+01:00" }, [], policy),
    ).toThrow(/Data inválida/);
    const invalid = evaluateLessonAttendance(
      lesson,
      [
        { ...event("check_in", "08:00:00"), occurredAt: "2026-02-29T08:00:00+01:00" },
        event("check_out", "09:00:00"),
      ],
      policy,
    );
    expect(invalid.status).toBe("pending_review");
    expect(previewPayroll([invalid], payroll).proposedDeductionCents).toBe(0);
  });

  it("rejeita datas sem fuso e carga horária mensal zero", () => {
    expect(() =>
      evaluateLessonAttendance({ ...lesson, startsAt: "2026-09-24T08:00:00" }, [], policy),
    ).toThrow(/fuso/);
    expect(() => previewPayroll([], { ...payroll, monthlyContractMinutes: 0 })).toThrow();
  });
});
