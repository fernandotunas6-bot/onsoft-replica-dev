-- Histórico académico ligado à origem (ponto 21 da especificação).
--
-- `student_academic_history` guardava só o ano e a classe em texto, a média e
-- a situação. Passa a guardar, quando vem da pauta anual:
--   * enrollment_id   — a matrícula do ano;
--   * grade_sheet_id  — a pauta anual homologada de onde saiu;
--   * subject_results — a nota final de cada disciplina, já com exames;
--   * absence_percentage — a percentagem de faltas usada na decisão;
--   * updated_by      — quem fez a última rectificação.
-- Os registos importados de outras escolas ficam sem ligação (colunas nulas).
--
-- Rasto: cada criação, alteração ou remoção fica em `audit_logs` (mesmo
-- gatilho das pautas) e `updated_at` passa a ser mantido. Remover um registo
-- do histórico deixa de ser possível — rectifica-se, não se apaga. Só a
-- cascata de remover o aluno ou a escola continua a apagar.
-- Tabela só do servidor (já FORCE RLS e sem concessões ao cliente). Idempotente.

ALTER TABLE public.student_academic_history
  ADD COLUMN IF NOT EXISTS enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grade_sheet_id uuid REFERENCES public.grade_sheets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS absence_percentage numeric,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS student_academic_history_enrollment_idx
  ON public.student_academic_history (enrollment_id) WHERE enrollment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS student_academic_history_grade_sheet_idx
  ON public.student_academic_history (grade_sheet_id) WHERE grade_sheet_id IS NOT NULL;

DROP TRIGGER IF EXISTS audit_student_academic_history ON public.student_academic_history;
CREATE TRIGGER audit_student_academic_history
  AFTER INSERT OR DELETE OR UPDATE ON public.student_academic_history
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();

DROP TRIGGER IF EXISTS trg_student_academic_history_touch ON public.student_academic_history;
CREATE TRIGGER trg_student_academic_history_touch
  BEFORE UPDATE ON public.student_academic_history
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

CREATE OR REPLACE FUNCTION private.student_academic_history_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
begin
  -- Cascata (aluno ou escola removidos): a remoção vem de outro gatilho.
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception using errcode = '42501',
    message = 'O histórico académico não se apaga; rectifique o registo.';
end;
$$;
DROP TRIGGER IF EXISTS student_academic_history_no_delete ON public.student_academic_history;
CREATE TRIGGER student_academic_history_no_delete
  BEFORE DELETE ON public.student_academic_history
  FOR EACH ROW EXECUTE FUNCTION private.student_academic_history_no_delete();
