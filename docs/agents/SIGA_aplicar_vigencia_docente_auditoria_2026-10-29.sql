-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-29
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 2 migrações, ambas aditivas:
--   1. Vigência das atribuições professor–disciplina–turma: histórico de quem deu cada
--      disciplina em cada turma e desde quando. Preenche os períodos das atribuições
--      activas de hoje (início estimado pela criação da linha). Não muda escritas.
--   2. audit_logs: RLS forçada; anon sem acesso; authenticated sem escrita (mantém a
--      leitura autorizada que já tinha). Não mexe em dados.
-- Ensaiado em PGlite (tests/sql/teacher-periods-audit-rls.mjs): corre duas vezes.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada" duas vezes).


-- ══════════ 20261029220000_class_subject_teacher_periods.sql ══════════
-- Vigência das atribuições professor–disciplina–turma.
--
-- `class_subjects` guarda só o professor actual (`teacher_id`): ao trocar de professor
-- (assignClassSubjectTeacher, importação de horários) ou ao desligá-lo, o anterior
-- desaparecia sem rasto. Não se sabia quem deu a disciplina numa turma em Março, nem
-- desde quando o professor actual a tem.
--
-- Esta migração é aditiva e não muda o comportamento de nenhuma escrita existente:
--   · tabela nova `class_subject_teacher_periods`: um período por professor e
--     atribuição, com início, fim e motivo do fim;
--   · gatilho AFTER em `class_subjects`: atribuir abre um período; trocar de professor,
--     desligá-lo ou desactivar a disciplina fecha o aberto (e abre o do novo professor);
--   · preenchimento inicial: cada atribuição activa com professor recebe um período
--     aberto com início na criação da linha, marcado `estimated_start` (a data real da
--     atribuição actual não está guardada em lado nenhum);
--   · só o servidor lê (regra 5 de docs/agents/DATABASE_RULES.md).
--
-- A autorização de notas continua a ser a de `class_subjects.teacher_id`
-- (enforce_teacher_assessment_score_scope): um professor com o período fechado já não é
-- o professor da linha. Idempotente; pode correr mais do que uma vez.

CREATE TABLE IF NOT EXISTS public.class_subject_teacher_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_subject_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  end_reason text,
  estimated_start boolean NOT NULL DEFAULT false,
  opened_by uuid,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_subject_teacher_periods_class_subject_fkey
    FOREIGN KEY (school_id, class_subject_id)
    REFERENCES public.class_subjects (school_id, id) ON DELETE CASCADE,
  CONSTRAINT class_subject_teacher_periods_teacher_fkey
    FOREIGN KEY (school_id, teacher_id)
    REFERENCES public.teachers (school_id, id) ON DELETE CASCADE,
  CONSTRAINT class_subject_teacher_periods_dates_check
    CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT class_subject_teacher_periods_end_reason_check
    CHECK (end_reason IS NULL OR end_reason IN ('teacher_changed', 'unassigned', 'inactive'))
);

-- Uma só atribuição em vigor por disciplina da turma.
CREATE UNIQUE INDEX IF NOT EXISTS class_subject_teacher_periods_open_uidx
  ON public.class_subject_teacher_periods (class_subject_id) WHERE ends_on IS NULL;
CREATE INDEX IF NOT EXISTS class_subject_teacher_periods_teacher_idx
  ON public.class_subject_teacher_periods (school_id, teacher_id, starts_on);
CREATE INDEX IF NOT EXISTS class_subject_teacher_periods_class_subject_idx
  ON public.class_subject_teacher_periods (school_id, class_subject_id, starts_on);

ALTER TABLE public.class_subject_teacher_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subject_teacher_periods FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_subject_teacher_periods FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.class_subject_teacher_periods TO service_role;

CREATE OR REPLACE FUNCTION private.track_class_subject_teacher_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Luanda')::date;
  v_active boolean := NEW.teacher_id IS NOT NULL AND NEW.status = 'active';
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  -- Fecha o período aberto que deixou de corresponder à linha.
  UPDATE public.class_subject_teacher_periods p
     SET ends_on = greatest(p.starts_on, v_today),
         closed_by = NEW.updated_by,
         end_reason = CASE
           WHEN NEW.teacher_id IS NULL THEN 'unassigned'
           WHEN NEW.teacher_id IS DISTINCT FROM p.teacher_id THEN 'teacher_changed'
           ELSE 'inactive'
         END
   WHERE p.school_id = NEW.school_id
     AND p.class_subject_id = NEW.id
     AND p.ends_on IS NULL
     AND (NOT v_active OR p.teacher_id IS DISTINCT FROM NEW.teacher_id);

  IF v_active AND NOT EXISTS (
    SELECT 1 FROM public.class_subject_teacher_periods p
     WHERE p.school_id = NEW.school_id AND p.class_subject_id = NEW.id AND p.ends_on IS NULL
  ) THEN
    INSERT INTO public.class_subject_teacher_periods
      (school_id, class_subject_id, teacher_id, starts_on, opened_by)
    VALUES (NEW.school_id, NEW.id, NEW.teacher_id, v_today, NEW.updated_by);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.track_class_subject_teacher_period() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS class_subjects_track_teacher_period ON public.class_subjects;
CREATE TRIGGER class_subjects_track_teacher_period
  AFTER INSERT OR UPDATE OF teacher_id, status ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION private.track_class_subject_teacher_period();

-- Atribuições activas de hoje: período aberto desde a criação da linha (estimado).
INSERT INTO public.class_subject_teacher_periods
  (school_id, class_subject_id, teacher_id, starts_on, estimated_start, opened_by)
SELECT cs.school_id, cs.id, cs.teacher_id,
       least((cs.created_at AT TIME ZONE 'Africa/Luanda')::date,
             (now() AT TIME ZONE 'Africa/Luanda')::date),
       true, cs.created_by
  FROM public.class_subjects cs
 WHERE cs.teacher_id IS NOT NULL
   AND cs.status = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM public.class_subject_teacher_periods p
      WHERE p.school_id = cs.school_id AND p.class_subject_id = cs.id AND p.ends_on IS NULL
   );


-- ══════════ 20261029220100_audit_logs_force_rls.sql ══════════
-- Registo de auditoria das escolas (audit_logs): RLS forçada e sem escrita pela API.
--
-- Leitura do retrato de 2026-10-29: RLS activa mas não forçada, uma política de leitura
-- (`audit_select_authorized`, permissão `audit.logs.read` por escola) e o gatilho
-- `audit_logs_immutable` (private.prevent_audit_mutation) que já recusa alterar ou apagar.
-- Os privilégios de tabela de anon/authenticated não estão no retrato.
--
-- Todo o código que escreve ou lê esta tabela é do servidor, com a chave de serviço
-- (record-audit.ts, documents/verification.ts, …) ou funções SECURITY DEFINER
-- (matrícula atómica, comandos do chat). Aqui:
--   · RLS forçada, também para o dono da tabela;
--   · anon perde todos os privilégios;
--   · authenticated perde a escrita (INSERT/UPDATE/DELETE/TRUNCATE) e mantém só a leitura
--     que a política autorizada já limitava — nada que hoje funcione deixa de funcionar;
--   · service_role mantém tudo.
-- Não mexe em dados nem na política existente. Idempotente.
--
-- Conservação: o registo é só de acrescentar (gatilho de imutabilidade). Apagar registos
-- antigos, quando houver regra de retenção, é uma operação própria e auditada — não se faz
-- por esta via.

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.audit_logs FROM authenticated;
GRANT ALL ON public.audit_logs TO service_role;


-- ══════════ Confirmar ══════════
SELECT
  CASE
    WHEN to_regclass('public.class_subject_teacher_periods') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'class_subjects_track_teacher_period' AND NOT tgisinternal)
     AND NOT has_table_privilege('authenticated', 'public.class_subject_teacher_periods', 'SELECT')
      THEN 'aplicada'
    ELSE 'por aplicar'
  END AS "20261029220000 vigência docente",
  CASE
    WHEN (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.audit_logs'::regclass)
     AND NOT has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
     AND NOT has_table_privilege('anon', 'public.audit_logs', 'SELECT')
      THEN 'aplicada'
    ELSE 'por aplicar'
  END AS "20261029220100 auditoria protegida";
