import type { Role } from "./model";
export interface AttendanceRange {
  from: string;
  to: string;
}
export type StudentAttendanceStatus =
  | "present"
  | "absent"
  | "excused"
  | "late"
  | "early_exit"
  | "not_registered";
export type TeacherLessonStatus = "scheduled" | "confirmed" | "rejected" | "cancelled";
export interface AcademicAttendance extends AttendanceRange {
  schoolId: string;
  role: Role;
  sessions: {
    id: string;
    classSubjectId: string;
    date: string;
    startsAt: string | null;
    endsAt: string | null;
    status: "pending" | "completed" | "cancelled";
    records: { studentId: string; status: StudentAttendanceStatus }[];
  }[];
  teacherLessons: {
    id: string;
    classSubjectId: string;
    date: string;
    startsAt: string;
    endsAt: string;
    status: TeacherLessonStatus;
  }[];
}
