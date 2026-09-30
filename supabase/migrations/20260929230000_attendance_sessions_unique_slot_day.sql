-- Uma sessão de presença por aula do horário e por dia.
--
-- `listTeacherAttendanceSessions` cria as sessões em falta quando o professor
-- abre as aulas do dia. O painel do professor e o ecrã de presenças pedem essa
-- lista ao mesmo tempo, e sem este índice os dois pedidos podiam criar a mesma
-- sessão duas vezes (as presenças ficavam repartidas entre as duas).
--
-- A 2026-09-29 a produção tinha 36 sessões e nenhum duplicado. Se entretanto
-- aparecer algum, a migração pára com a lista, em vez de apagar sessões que já
-- podem ter presenças registadas. Idempotente.

DO $$
DECLARE
  duplicados text;
BEGIN
  SELECT string_agg(format('%s / %s / %s (%s)', school_id, timetable_slot_id, lesson_date, n), E'\n')
    INTO duplicados
    FROM (
      SELECT school_id, timetable_slot_id, lesson_date, count(*) AS n
        FROM public.siga_attendance_sessions
       WHERE timetable_slot_id IS NOT NULL
       GROUP BY school_id, timetable_slot_id, lesson_date
      HAVING count(*) > 1
    ) d;
  IF duplicados IS NOT NULL THEN
    RAISE EXCEPTION USING
      message = 'Há sessões de presença duplicadas (escola / aula / dia). Junte-as antes de criar o índice.',
      detail = duplicados;
  END IF;
END
$$;

-- Aulas fora do horário (timetable_slot_id nulo) não entram: nulos são distintos.
CREATE UNIQUE INDEX IF NOT EXISTS siga_attendance_sessions_school_slot_day_key
  ON public.siga_attendance_sessions (school_id, timetable_slot_id, lesson_date);
