-- Taxa de presença recalculada de uma vez para todos os alunos de uma chamada.
--
-- `submitAttendanceCallBatch` e `editFinalizedAttendanceCall` recalculavam a
-- taxa aluno a aluno: ler todos os registos do aluno e actualizar a matrícula
-- — duas idas à base por aluno, mais o upsert do próprio registo (numa turma
-- de 40, ~120 consultas em série a partir do Worker). A leitura estava ainda
-- sujeita ao limite de 1000 linhas do PostgREST: um aluno com mais registos no
-- ano ficava com a taxa calculada sobre dados cortados.
--
-- Mesma regra que `computeAttendanceRate` (attendance-server.ts): presentes,
-- justificados e atrasados sobre todos os registos que não sejam
-- `not_registered`, arredondado às unidades. Só actualiza quando a taxa muda,
-- para não encher `audit_logs` (gatilho `audit_enrollments_change`).
--
-- Só o servidor a chama (chave de serviço). Idempotente.

CREATE OR REPLACE FUNCTION public.siga_recompute_attendance_rates(
  p_school_id uuid,
  p_student_ids uuid[]
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH rates AS (
    SELECT
      r.student_id,
      round(
        100.0 * count(*) FILTER (WHERE r.status IN ('present', 'excused', 'late'))
        / count(*)
      ) AS rate
    FROM public.siga_attendance_records r
    WHERE r.school_id = p_school_id
      AND r.student_id = ANY (p_student_ids)
      AND r.status <> 'not_registered'
    GROUP BY r.student_id
  ),
  changed AS (
    UPDATE public.enrollments e
    SET attendance_rate = rates.rate,
        updated_at = now()
    FROM rates
    WHERE e.school_id = p_school_id
      AND e.student_id = rates.student_id
      AND e.status = 'active'
      AND e.attendance_rate IS DISTINCT FROM rates.rate
    RETURNING 1
  )
  SELECT count(*)::integer FROM changed;
$$;

REVOKE ALL ON FUNCTION public.siga_recompute_attendance_rates(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siga_recompute_attendance_rates(uuid, uuid[]) TO service_role;
