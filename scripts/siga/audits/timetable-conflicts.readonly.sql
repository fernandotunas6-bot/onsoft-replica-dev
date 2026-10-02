-- SGA: auditoria SOMENTE LEITURA de conflitos de horários.
-- Não aplicar migrações Lovable ao projeto xodgfmxiaunpamctfeea.
-- Os resultados representam candidatos: versões alternativas de horários
-- podem coexistir sem constituir um conflito operacional.
WITH active_slots AS (
  SELECT ts.id, ts.school_id, ts.schedule_id, ts.weekday,
         ts.starts_at, ts.ends_at, ts.room_id,
         cs.class_group_id, cs.teacher_id
  FROM public.timetable_slots AS ts
  JOIN public.class_subjects AS cs
    ON cs.school_id = ts.school_id AND cs.id = ts.class_subject_id
  WHERE ts.status = 'active' AND cs.status = 'active'
), pairs AS (
  SELECT a.school_id, a.id AS first_slot_id, b.id AS second_slot_id,
         a.schedule_id AS first_schedule_id,
         b.schedule_id AS second_schedule_id,
         a.class_group_id = b.class_group_id AS same_class,
         a.teacher_id IS NOT NULL AND a.teacher_id = b.teacher_id AS same_teacher,
         a.room_id IS NOT NULL AND a.room_id = b.room_id AS same_room
  FROM active_slots a
  JOIN active_slots b ON a.school_id = b.school_id
    AND a.id < b.id
    AND a.weekday = b.weekday
    AND a.starts_at < b.ends_at
    AND b.starts_at < a.ends_at
)
SELECT school_id, first_slot_id, second_slot_id,
       first_schedule_id, second_schedule_id,
       same_class, same_teacher, same_room
FROM pairs
WHERE same_class OR same_teacher OR same_room
ORDER BY school_id, first_slot_id, second_slot_id;
