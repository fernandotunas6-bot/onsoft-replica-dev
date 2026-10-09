export type Role = "professor" | "aluno";
export type Permission =
  | "academic.read"
  | "attendance.write"
  | "grades.write"
  | "tasks.write"
  | "submissions.write"
  | "messages.write"
  | "documents.request";
export interface Membership {
  schoolId: string;
  schoolName: string;
  roles: Role[];
  permissions: Permission[];
  active: boolean;
}
export interface Session {
  userId: string;
  name: string;
  memberships: Membership[];
  mode: "demo" | "api";
}
export interface Context {
  userId: string;
  schoolId: string;
  role: Role;
}
export interface Student {
  id: string;
  name: string;
  userId: string;
}
export interface ClassGroup {
  id: string;
  name: string;
  subject: string;
  teacherUserId: string;
  students: Student[];
}
export interface Lesson {
  id: string;
  classId: string;
  date: string;
  time: string;
  room: string;
  topic: string;
}
export interface Grade {
  studentId: string;
  classId: string;
  value: number;
  published: boolean;
  periodOpen: boolean;
  revision: number;
}
export type AttendanceStatus = "presente" | "ausente" | "justificada";
export interface Attendance {
  lessonId: string;
  studentId: string;
  status: AttendanceStatus;
}
export interface Task {
  id: string;
  classId: string;
  title: string;
  instructions: string;
  due: string;
  published: boolean;
}
export interface Submission {
  taskId: string;
  studentId: string;
  text: string;
  submittedAt: string;
}
export interface Plan {
  lessonId: string;
  objectives: string;
  materials: string;
}
export interface Message {
  id: string;
  from: string;
  to: string;
  text: string;
  sentAt: string;
}
export interface DocumentRequest {
  id: string;
  studentId: string;
  type: string;
  status: "solicitado";
}
export interface Workspace {
  schoolId: string;
  classes: ClassGroup[];
  lessons: Lesson[];
  grades: Grade[];
  attendance: Attendance[];
  tasks: Task[];
  submissions: Submission[];
  plans: Plan[];
  messages: Message[];
  announcements: string[];
  documents: DocumentRequest[];
}
export type Command =
  | {
      type: "attendance";
      lessonId: string;
      entries: { studentId: string; status: AttendanceStatus }[];
    }
  | {
      type: "grade";
      classId: string;
      studentId: string;
      value: number;
      published: boolean;
      expectedRevision: number;
    }
  | { type: "plan"; lessonId: string; objectives: string; materials: string }
  | {
      type: "task";
      classId: string;
      title: string;
      instructions: string;
      due: string;
    }
  | { type: "submission"; taskId: string; text: string }
  | { type: "message"; to: string; text: string }
  | { type: "document"; documentType: string };
export interface Gateway {
  session(signal?: AbortSignal): Promise<Session | null>;
  workspace(ctx: Context, signal?: AbortSignal): Promise<Workspace>;
  execute(ctx: Context, command: Command, signal?: AbortSignal): Promise<void>;
  signOut(): Promise<void>;
}
