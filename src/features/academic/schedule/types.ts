export type ScheduleClassGroup = {
  id: string;
  name: string;
  enrolled_count: number;
  capacity?: number | null;
};

export type ScheduleSubject = {
  id: string;
  name: string;
  code?: string;
  color?: string | null;
  weekly_hours?: number;
};

export type ScheduleRoom = {
  id: string;
  name: string;
  code: string;
  capacity: number | null;
  room_type: string;
  resources?: string[];
};

export type ScheduleTeacher = {
  id: string;
  name: string;
  max_weekly_hours?: number;
};

export type ScheduleSlot = {
  id: string;
  class_group_id: string | null;
  class_group_name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  subject_id: string | null;
  subject_name: string | null;
  teacher_id: string | null;
  teacher_name?: string | null;
  room_id?: string | null;
  room_name?: string | null;
  label: string | null;
  display_label: string;
  shift_id?: string | null;
  schedule_id?: string | null;
  color?: string | null;
  notes?: string | null;
};

export type ScheduleConflict = {
  id: string;
  message: string;
  slotIds: [string, string] | [string];
  kind?: "turma" | "docente" | "sala" | "capacidade" | "disponibilidade";
  severity?: "blocker" | "warning";
};

export type ScheduleSlotInput = {
  classGroupId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  subjectId: string;
  teacherId?: string | null;
  roomId?: string | null;
  shiftId?: string | null;
  scheduleId?: string | null;
  label?: string;
  notes?: string;
};

export type ScheduleSlotUpdate = {
  slotId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  subjectId?: string;
  teacherId?: string | null;
  roomId?: string | null;
  shiftId?: string | null;
  scheduleId?: string | null;
  label?: string;
  notes?: string;
};
