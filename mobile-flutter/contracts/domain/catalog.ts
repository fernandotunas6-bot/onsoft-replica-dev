import type { Role } from "./model";

/** Canonical read contract. A timetable slot is not an attended lesson.
 * Nullable fields preserve missing institutional data without demo defaults.
 */
export interface AcademicCatalog {
  schoolId: string;
  role: Role;
  classes: AcademicClass[];
  timetable: AcademicSlot[];
  tasks: AcademicTask[];
}
export interface AcademicClass {
  classSubjectId: string;
  classGroupId: string;
  academicYearId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacher: { id: string; name: string; userId: string | null } | null;
  students: { studentId: string; enrollmentId: string; name: string; userId: string | null }[];
}
export interface AcademicSlot {
  slotId: string;
  classSubjectId: string;
  scheduleId: string | null;
  publication: "published" | "legacy";
  validFrom: string | null;
  validTo: string | null;
  /** ISO weekday: Monday=1, Sunday=7, as stored in Sga. */
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
}
export interface AcademicTask {
  id: string;
  classSubjectId: string;
  slotId: string | null;
  kind: string;
  title: string;
  instructions: string | null;
  due: string | null;
}
