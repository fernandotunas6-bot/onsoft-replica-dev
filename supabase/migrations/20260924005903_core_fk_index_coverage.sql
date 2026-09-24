-- Core FK/index coverage for high-traffic SIGA relationships.
-- Non-destructive: creates only missing indexes; no data or tables are removed.

create index if not exists people_user_id_idx
  on public.people (user_id)
  where user_id is not null;

create index if not exists teachers_user_id_idx
  on public.teachers (user_id)
  where user_id is not null;

create index if not exists class_groups_school_delegate_student_idx
  on public.class_groups (school_id, delegate_student_id)
  where delegate_student_id is not null;

create index if not exists class_groups_school_homeroom_teacher_idx
  on public.class_groups (school_id, homeroom_teacher_id)
  where homeroom_teacher_id is not null;

create index if not exists class_subjects_school_subject_idx
  on public.class_subjects (school_id, subject_id);

create index if not exists attendance_sessions_slot_assignment_idx
  on public.attendance_sessions (school_id, timetable_slot_id, class_subject_id);

create index if not exists siga_assessment_items_lesson_plan_component_idx
  on public.siga_assessment_items (lesson_plan_component_id)
  where lesson_plan_component_id is not null;

create index if not exists timetable_slots_schedule_idx
  on public.timetable_slots (schedule_id)
  where schedule_id is not null;

create index if not exists timetable_slots_room_idx
  on public.timetable_slots (room_id)
  where room_id is not null;

create index if not exists timetable_slots_shift_idx
  on public.timetable_slots (shift_id)
  where shift_id is not null;
