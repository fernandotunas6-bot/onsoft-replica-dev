-- Ensino superior: inscrição por unidade curricular e precedências
-- (pontos 1 e 2 de docs/specs/ensino-superior.md).
--
-- program_subject_prerequisites — "Análise II exige Análise I": a unidade
--   curricular de um curso só se faz depois de outra do mesmo curso aprovada.
-- course_unit_enrollments — o estudante inscreve-se em cada cadeira do ano
--   (incluindo as em atraso); guarda o estado, a nota final, a época e os
--   créditos obtidos. É daqui que saem os créditos para a progressão.
--
-- Chaves compostas (school_id, id): uma linha nunca aponta para outra escola.
-- Ambas as tabelas são só do servidor (FORCE RLS, sem concessões ao cliente):
-- o acesso passa por requireSgaWriter. Cada alteração fica em audit_logs.
-- Uma inscrição não se apaga (anula-se); só a cascata de remover o aluno ou a
-- escola apaga. Idempotente.

CREATE TABLE IF NOT EXISTS public.program_subject_prerequisites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  program_subject_id uuid NOT NULL,
  required_program_subject_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT program_subject_prerequisites_subject_fkey
    FOREIGN KEY (school_id, program_subject_id)
    REFERENCES public.program_subjects (school_id, id) ON DELETE CASCADE,
  CONSTRAINT program_subject_prerequisites_required_fkey
    FOREIGN KEY (school_id, required_program_subject_id)
    REFERENCES public.program_subjects (school_id, id) ON DELETE CASCADE,
  CONSTRAINT program_subject_prerequisites_not_self
    CHECK (program_subject_id <> required_program_subject_id),
  CONSTRAINT program_subject_prerequisites_unique
    UNIQUE (program_subject_id, required_program_subject_id)
);

CREATE INDEX IF NOT EXISTS program_subject_prerequisites_required_idx
  ON public.program_subject_prerequisites (school_id, required_program_subject_id);

CREATE TABLE IF NOT EXISTS public.course_unit_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  program_id uuid NOT NULL,
  program_subject_id uuid NOT NULL,
  -- Semestre e créditos copiados do plano no momento da inscrição: o plano
  -- pode mudar depois sem alterar o que o estudante fez.
  semester smallint NOT NULL CHECK (semester BETWEEN 1 AND 12),
  credits numeric(4,1) NOT NULL CHECK (credits > 0 AND credits <= 60),
  attempt smallint NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 20),
  status text NOT NULL DEFAULT 'inscrito' CHECK (status IN (
    'inscrito', 'dispensado', 'aprovado', 'reprovado',
    'excluido_faltas', 'excluido_frequencia', 'anulado'
  )),
  final_grade numeric(4,1) CHECK (final_grade IS NULL OR final_grade BETWEEN 0 AND 20),
  season text CHECK (season IS NULL OR season IN ('frequencia', 'normal', 'recurso', 'especial', 'melhoria')),
  credits_earned numeric(4,1) NOT NULL DEFAULT 0 CHECK (credits_earned >= 0 AND credits_earned <= credits),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT course_unit_enrollments_student_fkey
    FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id) ON DELETE CASCADE,
  CONSTRAINT course_unit_enrollments_year_fkey
    FOREIGN KEY (school_id, academic_year_id)
    REFERENCES public.academic_years (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT course_unit_enrollments_program_fkey
    FOREIGN KEY (school_id, program_id)
    REFERENCES public.programs (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT course_unit_enrollments_program_subject_fkey
    FOREIGN KEY (school_id, program_subject_id)
    REFERENCES public.program_subjects (school_id, id) ON DELETE RESTRICT,
  CONSTRAINT course_unit_enrollments_unique
    UNIQUE (student_id, academic_year_id, program_subject_id),
  -- Créditos só com aprovação ou dispensa.
  CONSTRAINT course_unit_enrollments_credits_only_when_passed
    CHECK (credits_earned = 0 OR status IN ('aprovado', 'dispensado'))
);

CREATE INDEX IF NOT EXISTS course_unit_enrollments_student_idx
  ON public.course_unit_enrollments (school_id, student_id, academic_year_id);
CREATE INDEX IF NOT EXISTS course_unit_enrollments_unit_idx
  ON public.course_unit_enrollments (school_id, program_subject_id, academic_year_id);

-- Só do servidor.
ALTER TABLE public.program_subject_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_subject_prerequisites FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_subject_prerequisites FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.program_subject_prerequisites TO service_role;

ALTER TABLE public.course_unit_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_unit_enrollments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_unit_enrollments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.course_unit_enrollments TO service_role;

-- Rasto e datas.
DROP TRIGGER IF EXISTS audit_program_subject_prerequisites ON public.program_subject_prerequisites;
CREATE TRIGGER audit_program_subject_prerequisites
  AFTER INSERT OR DELETE OR UPDATE ON public.program_subject_prerequisites
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();

DROP TRIGGER IF EXISTS audit_course_unit_enrollments ON public.course_unit_enrollments;
CREATE TRIGGER audit_course_unit_enrollments
  AFTER INSERT OR DELETE OR UPDATE ON public.course_unit_enrollments
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change();

DROP TRIGGER IF EXISTS trg_course_unit_enrollments_touch ON public.course_unit_enrollments;
CREATE TRIGGER trg_course_unit_enrollments_touch
  BEFORE UPDATE ON public.course_unit_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();

DROP TRIGGER IF EXISTS course_unit_enrollments_protect_identity ON public.course_unit_enrollments;
CREATE TRIGGER course_unit_enrollments_protect_identity
  BEFORE UPDATE ON public.course_unit_enrollments
  FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes(
    'id', 'school_id', 'student_id', 'academic_year_id', 'program_id', 'program_subject_id',
    'created_by', 'created_at'
  );

-- A precedência tem de ser do mesmo curso.
CREATE OR REPLACE FUNCTION private.program_subject_prerequisites_same_program()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
begin
  if (select program_id from public.program_subjects where id = new.program_subject_id)
     is distinct from
     (select program_id from public.program_subjects where id = new.required_program_subject_id)
  then
    raise exception using errcode = '23514',
      message = 'A precedência tem de ser uma unidade curricular do mesmo curso.';
  end if;
  return new;
end;
$$;
DROP TRIGGER IF EXISTS program_subject_prerequisites_same_program ON public.program_subject_prerequisites;
CREATE TRIGGER program_subject_prerequisites_same_program
  BEFORE INSERT OR UPDATE ON public.program_subject_prerequisites
  FOR EACH ROW EXECUTE FUNCTION private.program_subject_prerequisites_same_program();

-- Inscrições anulam-se, não se apagam (a cascata do aluno/escola continua).
CREATE OR REPLACE FUNCTION private.course_unit_enrollments_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception using errcode = '42501',
    message = 'A inscrição não se apaga; anule-a.';
end;
$$;
DROP TRIGGER IF EXISTS course_unit_enrollments_no_delete ON public.course_unit_enrollments;
CREATE TRIGGER course_unit_enrollments_no_delete
  BEFORE DELETE ON public.course_unit_enrollments
  FOR EACH ROW EXECUTE FUNCTION private.course_unit_enrollments_no_delete();

REVOKE ALL ON FUNCTION private.program_subject_prerequisites_same_program()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.program_subject_prerequisites_same_program() TO service_role;
REVOKE ALL ON FUNCTION private.course_unit_enrollments_no_delete()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.course_unit_enrollments_no_delete() TO service_role;
