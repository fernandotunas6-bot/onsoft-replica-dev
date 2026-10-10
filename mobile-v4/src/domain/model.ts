import type { ChatInbox, ChatHistory, ChatCursor } from "./institutional-chat";
import type { StudentFinance } from "./finance";
import type { AcademicGradebooks } from "./gradebooks";
import type { AcademicResults } from "./results";
import type { AcademicAttendance, AttendanceRange } from "./attendance";
import type { AcademicCatalog } from "./catalog";
import type { TeacherDay } from "./teacher-day";
import type { ScoreEntry, TeacherAssessments } from "./assessments";
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
  /** Institutional image URL; absent until supplied by the authorised school API. */
  schoolLogoUrl?: string | null;
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
export interface TeacherAttendance {
  lessonId: string;
  userId: string;
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
  teacherAttendance?: TeacherAttendance[];
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
  | { type: "scores"; itemId: string; entries: ScoreEntry[] }
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
  subscribeSessionChanged?(listener: () => void): () => void;
  session(signal?: AbortSignal): Promise<Session | null>;
  academicCatalog?(ctx: Context, signal?: AbortSignal): Promise<AcademicCatalog>;
  subscribeChatChanged?(ctx: Context, listener: () => void): () => void;
  chatCapabilities?(ctx: Context, signal?: AbortSignal): Promise<{ writes: boolean }>;
  chatCommand?(
    ctx: Context,
    requestId: string,
    command: import("./institutional-chat").ChatCommand,
    signal?: AbortSignal,
  ): Promise<import("./institutional-chat").ChatReceipt>;
  chatAttachment?(ctx: Context, messageId: string, signal?: AbortSignal): Promise<{ url: string }>;
  chatContacts?(ctx: Context, signal?: AbortSignal): Promise<{ id: string; name: string }[]>;
  notifications?(
    ctx: Context,
    signal?: AbortSignal,
    before?: import("./notifications").NotificationCursor,
  ): Promise<import("./notifications").NotificationInbox>;
  markNotificationsRead?(
    ctx: Context,
    target: import("./notifications").NotificationReadTarget,
    signal?: AbortSignal,
  ): Promise<import("./notifications").NotificationReadReceipt>;
  chatInbox?(ctx: Context, signal?: AbortSignal): Promise<ChatInbox>;
  chatHistory?(
    ctx: Context,
    conversationId: string,
    before?: ChatCursor,
    signal?: AbortSignal,
  ): Promise<ChatHistory>;
  studentFinance?(ctx: Context, signal?: AbortSignal): Promise<StudentFinance>;
  academicGradebooks?(
    ctx: Context,
    catalog: AcademicCatalog,
    signal?: AbortSignal,
  ): Promise<AcademicGradebooks>;
  academicResults?(
    ctx: Context,
    catalog: AcademicCatalog,
    signal?: AbortSignal,
  ): Promise<AcademicResults>;
  academicAttendance?(
    ctx: Context,
    range: AttendanceRange,
    catalog: AcademicCatalog,
    signal?: AbortSignal,
  ): Promise<AcademicAttendance>;
  teacherDay?(ctx: Context, catalog: AcademicCatalog, signal?: AbortSignal): Promise<TeacherDay>;
  recordAttendance?(
    ctx: Context,
    catalog: AcademicCatalog,
    day: TeacherDay,
    sessionId: string,
    entries: { studentId: string; status: AttendanceStatus }[],
    signal?: AbortSignal,
  ): Promise<void>;
  teacherAssessments?(
    ctx: Context,
    catalog: AcademicCatalog,
    signal?: AbortSignal,
  ): Promise<TeacherAssessments>;
  recordScores?(
    ctx: Context,
    catalog: AcademicCatalog,
    assessments: TeacherAssessments,
    itemId: string,
    entries: ScoreEntry[],
    signal?: AbortSignal,
  ): Promise<void>;
  workspace(ctx: Context, signal?: AbortSignal): Promise<Workspace>;
  execute(ctx: Context, command: Command, signal?: AbortSignal): Promise<void>;
  signOut(): Promise<void>;
}
