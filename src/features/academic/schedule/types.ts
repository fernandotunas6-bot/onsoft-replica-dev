export type ScheduleClassGroup = {
  id: string;
  name: string;
  enrolled_count: number;
};

export type ScheduleSubject = {
  id: string;
  name: string;
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
  label: string | null;
  display_label: string;
};

export type ScheduleConflict = {
  id: string;
  message: string;
  slotIds: [string, string];
};

export type ScheduleSlotInput = {
  classGroupId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  subjectId: string;
  label: string;
};

export type ScheduleSlotUpdate = {
  slotId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  label: string;
};
