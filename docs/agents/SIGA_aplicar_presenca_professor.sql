-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-26
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: presença do professor na sala de aula, gravada na aula do horário
-- (siga_attendance_sessions). Só acrescenta colunas vazias; não mexe em dados nem
-- em permissões (authenticated continua só com SELECT nesta tabela).
-- Sem este SQL, a chamada dos alunos funciona como antes e o botão «Estou na sala»
-- não aparece. Confirmar no fim com a consulta do fundo (deve dar "aplicada").


-- ══════════ 20261026083707_teacher_lesson_presence.sql ══════════
-- Presença do professor na sala de aula, gravada na própria aula (sessão da chamada).
--
-- A presença por QR (hr_teacher_lesson_occurrences) só existe para professores com
-- vínculo de RH e contrato de hora/aula activo, porque alimenta a remuneração. A
-- 2026-10-26 a produção tinha 0 vínculos e 0 contratos: nenhum professor conseguia
-- confirmar que estava na sala. Esta confirmação fica na aula do horário e não mexe
-- na remuneração; o QR continua igual onde houver RH (e também marca a aula).
--
--   teacher_checkin_method: portal  (o professor tocou «Estou na sala»)
--                           call    (concluiu a chamada no dia, sem ter confirmado antes)
--                           qr      (leu o QR da aula, fluxo do RH)
--                           manual  (registo da Direcção/Secretaria, com nota)
--
-- Só o servidor escreve (authenticated tem apenas SELECT nesta tabela, e as novas
-- colunas herdam essas permissões). Não mexe em dados. Idempotente.

ALTER TABLE public.siga_attendance_sessions
  ADD COLUMN IF NOT EXISTS teacher_checked_in_at timestamptz;
ALTER TABLE public.siga_attendance_sessions
  ADD COLUMN IF NOT EXISTS teacher_checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.siga_attendance_sessions
  ADD COLUMN IF NOT EXISTS teacher_checkin_method text;
ALTER TABLE public.siga_attendance_sessions
  ADD COLUMN IF NOT EXISTS teacher_late_minutes integer;
ALTER TABLE public.siga_attendance_sessions
  ADD COLUMN IF NOT EXISTS teacher_checked_out_at timestamptz;
ALTER TABLE public.siga_attendance_sessions
  ADD COLUMN IF NOT EXISTS teacher_presence_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'siga_attendance_sessions_teacher_presence_check'
       AND conrelid = 'public.siga_attendance_sessions'::regclass
  ) THEN
    ALTER TABLE public.siga_attendance_sessions
      ADD CONSTRAINT siga_attendance_sessions_teacher_presence_check CHECK (
        (teacher_checkin_method IS NULL OR teacher_checkin_method IN ('portal', 'call', 'qr', 'manual'))
        AND (teacher_late_minutes IS NULL OR teacher_late_minutes BETWEEN 0 AND 1440)
        AND (teacher_presence_note IS NULL OR char_length(teacher_presence_note) <= 500)
        -- Método e hora andam juntos; a saída exige a entrada.
        AND ((teacher_checked_in_at IS NULL) = (teacher_checkin_method IS NULL))
        AND (teacher_checked_out_at IS NULL OR teacher_checked_in_at IS NOT NULL)
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.siga_attendance_sessions.teacher_checked_in_at IS
  'Quando o professor confirmou que estava na sala (portal, chamada, QR ou registo da Direcção).';
COMMENT ON COLUMN public.siga_attendance_sessions.teacher_late_minutes IS
  'Minutos depois da hora de início do horário no momento da confirmação (0 = a horas).';


-- ══════════ Confirmar ══════════
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'siga_attendance_sessions'
     AND column_name = 'teacher_checked_in_at'
) THEN 'aplicada' ELSE 'por aplicar' END AS "20261026083707 presença do professor na aula";
