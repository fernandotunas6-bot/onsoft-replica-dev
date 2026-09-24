import { describe, expect, it } from "vitest";
import { schedulePublicationReadiness } from "./publicationReadiness";
import type { ScheduleSlot } from "../types";

const slot: ScheduleSlot = {
  id: "slot-1", class_group_id: "class-1", class_group_name: "10.ª A",
  subject_id: "subject-1", subject_name: "Matemática", teacher_id: "teacher-1",
  teacher_name: "Professor A", room_id: "room-1", room_name: "Sala 1",
  weekday: 1, starts_at: "08:00:00", ends_at: "08:45:00",
  label: "Sala 1", display_label: "Matemática",
};
const base = {
  classGroupId: "class-1", slots: [slot],
  classGroups: [{ id: "class-1", name: "10.ª A", enrolled_count: 25 }],
  subjects: [{ id: "subject-1", name: "Matemática" }],
  teachers: [{ id: "teacher-1", name: "Professor A" }],
  rooms: [{ id: "room-1", name: "Sala 1", code: "S1", capacity: 30, room_type: "classroom" }],
};

describe("schedulePublicationReadiness", () => {
  it("permite publicar uma turma com aulas, disciplinas, docentes e salas válidos", () => {
    const result = schedulePublicationReadiness(base);
    expect(result.ready).toBe(true);
    expect(result.lessonCount).toBe(1);
    expect(result.teacherCount).toBe(1);
    expect(result.roomCount).toBe(1);
  });

  it("impede publicação de horário vazio", () => {
    expect(schedulePublicationReadiness({ ...base, slots: [] }).issues.map((issue) => issue.code)).toContain("empty");
  });

  it("identifica docente e sala por atribuir", () => {
    const result = schedulePublicationReadiness({ ...base, slots: [{ ...slot, teacher_id: null, room_id: null }] });
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["teacher", "room"]));
  });

  it("bloqueia salas cuja lotação é inferior aos alunos matriculados", () => {
    const result = schedulePublicationReadiness({ ...base, rooms: [{ ...base.rooms[0], capacity: 20 }] });
    expect(result.issues.map((issue) => issue.code)).toContain("capacity");
  });

  it("deteta choques de docentes mesmo entre turmas diferentes", () => {
    const second: ScheduleSlot = { ...slot, id: "slot-2", class_group_id: "class-2", class_group_name: "10.ª B", room_id: "room-2" };
    const result = schedulePublicationReadiness({ ...base, slots: [slot, second] });
    expect(result.issues.map((issue) => issue.code)).toContain("conflict");
  });

  it("não inclui aulas de outras turmas nas métricas", () => {
    const second: ScheduleSlot = { ...slot, id: "slot-2", class_group_id: "class-2", teacher_id: "teacher-2", room_id: "room-2", weekday: 2 };
    const result = schedulePublicationReadiness({ ...base, slots: [slot, second] });
    expect(result.lessonCount).toBe(1);
    expect(result.ready).toBe(true);
  });
  it("não considera colisão entre versões distintas da mesma turma", () => {
    const oldVersion: ScheduleSlot = { ...slot, id: "old", schedule_id: "version-1" };
    const newVersion: ScheduleSlot = { ...slot, id: "new", schedule_id: "version-2" };
    const result = schedulePublicationReadiness({ ...base, slots: [oldVersion, newVersion] });
    expect(result.issues.map((issue) => issue.code)).not.toContain("conflict");
  });

});
