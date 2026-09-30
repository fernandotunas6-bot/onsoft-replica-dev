-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-09-29
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: uma sessão de presença por aula do horário e por dia (índice
-- único). Não mexe em dados; se já houver duplicados, pára e lista-os.
-- Verificado a 2026-09-29 na produção: 36 sessões, nenhum duplicado.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20260929230000_attendance_sessions_unique_slot_day.sql ══════════
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


-- ══════════ Confirmar ══════════
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'siga_attendance_sessions_school_slot_day_key'
) THEN 'aplicada' ELSE 'por aplicar' END AS "20260929230000 sessões de presença únicas";
