import type { AcademicCatalog } from "./catalog";
import type { Context } from "./model";

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const name = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const nullableText = (v: unknown) => v === null || typeof v === "string";
const nullableId = (v: unknown) => v === null || uuid(v);
const date = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(v + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
};
const time = (v: unknown): v is string =>
  typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(v);
const seconds = (v: string) => {
  const [h, m, s = "0"] = v.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
};
const keys = (v: Record<string, unknown>, fields: string[]) =>
  Object.keys(v).length === fields.length && fields.every((field) => field in v);

/** Reject malformed or overbroad responses; never repair them with demo values. */
export function parseAcademicCatalog(value: unknown, ctx: Context): AcademicCatalog {
  const invalid = () => {
    throw new Error("Contrato académico canónico inválido.");
  };
  if (
    !object(value) ||
    !keys(value, ["schoolId", "role", "classes", "timetable", "tasks"]) ||
    value.schoolId !== ctx.schoolId ||
    value.role !== ctx.role ||
    !Array.isArray(value.classes) ||
    !Array.isArray(value.timetable) ||
    !Array.isArray(value.tasks)
  )
    return invalid();
  const classIds = new Set<string>();
  for (const group of value.classes) {
    if (
      !object(group) ||
      !keys(group, [
        "classSubjectId",
        "classGroupId",
        "academicYearId",
        "className",
        "subjectId",
        "subjectName",
        "teacher",
        "students",
      ]) ||
      !uuid(group.classSubjectId) ||
      classIds.has(group.classSubjectId) ||
      !uuid(group.classGroupId) ||
      !uuid(group.academicYearId) ||
      !uuid(group.subjectId) ||
      !name(group.className) ||
      !name(group.subjectName) ||
      !Array.isArray(group.students)
    )
      return invalid();
    classIds.add(group.classSubjectId);
    const teacher = group.teacher;
    if (
      teacher !== null &&
      (!object(teacher) ||
        !keys(teacher, ["id", "name", "userId"]) ||
        !uuid(teacher.id) ||
        !name(teacher.name) ||
        !nullableId(teacher.userId))
    )
      return invalid();
    if (ctx.role === "professor" && (!object(teacher) || teacher.userId !== ctx.userId))
      return invalid();
    const enrollments = new Set<string>();
    for (const student of group.students) {
      if (
        !object(student) ||
        !keys(student, ["studentId", "enrollmentId", "name", "userId"]) ||
        !uuid(student.studentId) ||
        !uuid(student.enrollmentId) ||
        !name(student.name) ||
        !nullableId(student.userId) ||
        enrollments.has(student.enrollmentId) ||
        (ctx.role === "aluno" && student.userId !== ctx.userId)
      )
        return invalid();
      enrollments.add(student.enrollmentId);
    }
    if (ctx.role === "aluno" && group.students.length === 0) return invalid();
  }
  const slots = new Map<string, string>();
  for (const slot of value.timetable) {
    if (
      !object(slot) ||
      !keys(slot, [
        "slotId",
        "classSubjectId",
        "scheduleId",
        "publication",
        "validFrom",
        "validTo",
        "weekday",
        "startsAt",
        "endsAt",
        "room",
      ]) ||
      !uuid(slot.slotId) ||
      slots.has(slot.slotId) ||
      !uuid(slot.classSubjectId) ||
      !classIds.has(slot.classSubjectId) ||
      !nullableText(slot.room) ||
      typeof slot.weekday !== "number" ||
      !Number.isInteger(slot.weekday) ||
      slot.weekday < 1 ||
      slot.weekday > 7 ||
      !time(slot.startsAt) ||
      !time(slot.endsAt) ||
      seconds(slot.endsAt) <= seconds(slot.startsAt)
    )
      return invalid();
    if (slot.publication === "published") {
      if (
        !uuid(slot.scheduleId) ||
        (slot.validFrom !== null && !date(slot.validFrom)) ||
        (slot.validTo !== null &&
          (!date(slot.validTo) ||
            (typeof slot.validFrom === "string" && slot.validTo < slot.validFrom)))
      )
        return invalid();
    } else if (
      slot.publication !== "legacy" ||
      slot.scheduleId !== null ||
      slot.validFrom !== null ||
      slot.validTo !== null
    )
      return invalid();
    slots.set(slot.slotId, slot.classSubjectId);
  }
  const tasks = new Set<string>();
  for (const task of value.tasks) {
    if (
      !object(task) ||
      !keys(task, ["id", "classSubjectId", "slotId", "kind", "title", "instructions", "due"]) ||
      !uuid(task.id) ||
      tasks.has(task.id) ||
      !uuid(task.classSubjectId) ||
      !classIds.has(task.classSubjectId) ||
      !nullableId(task.slotId) ||
      (task.slotId !== null && slots.get(task.slotId as string) !== task.classSubjectId) ||
      typeof task.kind !== "string" ||
      !["tpc", "trabalho", "leitura", "projecto", "pesquisa", "outra"].includes(task.kind) ||
      !name(task.title) ||
      !nullableText(task.instructions) ||
      (task.due !== null && !date(task.due))
    )
      return invalid();
    tasks.add(task.id);
  }
  return value as unknown as AcademicCatalog;
}
