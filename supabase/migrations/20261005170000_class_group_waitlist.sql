-- Lista de espera por turma.
--
-- `private.enroll_student` recusa a matrícula quando a turma está cheia (23514, «A turma
-- atingiu a capacidade configurada»). Até aqui, aceitar uma candidatura numa turma cheia
-- deixava o aluno criado e sem turma, sem registo de que esperava por ela. Esta tabela
-- guarda a fila: quem espera por que turma, por ordem de chegada; quando sai alguém da
-- turma, a secretaria coloca o primeiro da fila (src/features/enrollment/waitlist.ts).
--
-- Dados de alunos: só o servidor lhes toca (Administrador/Secretaria). FORCE RLS, sem
-- políticas, REVOKE de PUBLIC, anon e authenticated (DATABASE_RULES.md, regra 5). Idempotente.

CREATE TABLE IF NOT EXISTS public.class_group_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_group_id uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'placed', 'cancelled')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  placed_at timestamptz,
  placed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_reason text CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

-- Um aluno espera uma só vez pela mesma turma.
CREATE UNIQUE INDEX IF NOT EXISTS class_group_waitlist_one_waiting
  ON public.class_group_waitlist (school_id, class_group_id, student_id)
  WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS class_group_waitlist_queue
  ON public.class_group_waitlist (school_id, class_group_id, created_at)
  WHERE status = 'waiting';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'class_group_waitlist_touch'
      AND tgrelid = 'public.class_group_waitlist'::regclass
  ) THEN
    CREATE TRIGGER class_group_waitlist_touch
      BEFORE UPDATE ON public.class_group_waitlist
      FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
  END IF;
END $$;

ALTER TABLE public.class_group_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_group_waitlist FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_group_waitlist FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.class_group_waitlist TO service_role;
