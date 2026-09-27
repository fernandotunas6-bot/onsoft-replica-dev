import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMINDER_SETTINGS,
  addDays,
  buildPublishedMessage,
  buildReminderMessage,
  isReminderHour,
  luandaNow,
  reminderChannels,
  toSmsText,
  weekdayOf,
} from "@/features/academic/lesson-messages";

describe("datas de Luanda", () => {
  it("usa o fuso de Luanda (UTC+1) para data e hora", () => {
    expect(luandaNow(new Date("2026-09-26T23:30:00Z"))).toEqual({ date: "2026-09-27", hour: 0 });
    expect(luandaNow(new Date("2026-09-26T16:10:00Z"))).toEqual({ date: "2026-09-26", hour: 17 });
  });

  it("amanhã e dia da semana", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(weekdayOf("2026-09-28")).toBe(1); // segunda
  });
});

describe("regras de envio", () => {
  it("só na hora configurada e com o lembrete activo", () => {
    const on = { ...DEFAULT_REMINDER_SETTINGS, enabled: true, sendHour: 18 };
    expect(isReminderHour(on, 18)).toBe(true);
    expect(isReminderHour(on, 17)).toBe(false);
    expect(isReminderHour(DEFAULT_REMINDER_SETTINGS, 18)).toBe(false);
  });

  it("canais escolhidos", () => {
    expect(
      reminderChannels({ ...DEFAULT_REMINDER_SETTINGS, channelEmail: true, channelSms: true }),
    ).toEqual(["in_app", "email", "sms"]);
  });
});

describe("mensagens", () => {
  const lessons = [
    {
      startsAt: "10:00:00",
      endsAt: "10:45:00",
      subjectName: "Química",
      className: "9ª B",
      room: "4",
    },
    {
      startsAt: "07:30:00",
      endsAt: "08:15:00",
      subjectName: "Física",
      className: "8ª A",
      deliveryMode: "zoom",
    },
  ];

  it("lembrete do professor: aulas por hora, com a turma", () => {
    const msg = buildReminderMessage({ lessons, date: "2026-09-28", audience: "teacher" });
    expect(msg.title).toBe("Amanhã tem 2 aulas");
    expect(msg.body).toBe(
      "Segunda-feira, 28 de setembro:\n• 07:30–08:15 · Física · 8ª A · Zoom\n• 10:00–10:45 · Química · 9ª B · Sala 4",
    );
  });

  it("lembrete do encarregado: diz de quem são as aulas e não repete a turma", () => {
    const msg = buildReminderMessage({
      lessons: lessons.slice(0, 1),
      date: "2026-09-28",
      audience: "guardian",
      studentName: "Bruno",
    });
    expect(msg.title).toBe("Aulas de amanhã de Bruno");
    expect(msg.body).toContain("• 10:00–10:45 · Química · Sala 4");
  });

  it("publicação", () => {
    expect(
      buildPublishedMessage({ className: "8ª A", audience: "student", lessonsPerWeek: 28 }).body,
    ).toBe("O horário da turma 8ª A foi publicado: 28 aulas por semana. Consulte-o no portal.");
    expect(
      buildPublishedMessage({ className: "8ª A", audience: "teacher", lessonsPerWeek: 1 }).title,
    ).toBe("Horário da 8ª A publicado");
  });

  it("SMS numa linha e limitado", () => {
    const text = toSmsText("Aulas de amanhã", "Segunda:\n• 07:30 Física\n• 08:20 Química");
    expect(text).toBe("Aulas de amanhã. Segunda:; 07:30 Física; 08:20 Química");
    expect(toSmsText("T", "x".repeat(500)).length).toBe(300);
  });
});
