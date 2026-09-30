-- Sala física da turma. Até aqui o formulário "Sala" gravava o campus
-- (`class_groups.campus_id`) e a turma não tinha ligação a `rooms`.
-- Opcional: uma turma pode não ter sala fixa. Apagar a sala só limpa a ligação.
-- Idempotente. `normalize_class_group` não bloqueia a mudança de sala (só de campus).

ALTER TABLE public.class_groups
  ADD COLUMN IF NOT EXISTS room_id uuid;

ALTER TABLE public.class_groups DROP CONSTRAINT IF EXISTS class_groups_school_id_room_id_fkey;
ALTER TABLE public.class_groups
  ADD CONSTRAINT class_groups_school_id_room_id_fkey
  FOREIGN KEY (school_id, room_id) REFERENCES public.rooms (school_id, id)
  ON DELETE SET NULL (room_id);

CREATE INDEX IF NOT EXISTS class_groups_room_id_idx
  ON public.class_groups (room_id)
  WHERE room_id IS NOT NULL;
