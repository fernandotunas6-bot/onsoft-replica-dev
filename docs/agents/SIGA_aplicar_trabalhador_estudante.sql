-- SIGA Plus — SQL a aplicar no Supabase (projecto Sga), pacote de 2026-10-04
-- Colar TUDO no SQL Editor → Run. Pode correr mais do que uma vez sem problema.
-- 1 migração: estatuto de trabalhador-estudante no Ensino Superior (tabela nova
-- higher_ed_student_statuses, só do servidor). Enquanto não for aplicada, ninguém tem
-- o estatuto e atribuí-lo diz que falta este pacote. Não mexe em dados existentes.
-- Ensaiado em PGlite (tests/sql/higher-ed-statuses.mjs): corre duas vezes; anon e
-- authenticated sem acesso nenhum.
-- Confirmar no fim com a consulta do fundo deste ficheiro (deve dar "aplicada").


-- ══════════ 20261004150000_higher_ed_student_statuses.sql ══════════
-- Ensino Superior: estatutos especiais do estudante (trabalhador-estudante).
--
-- Como os estatutos do SIGARRA: a secretaria atribui o estatuto a um estudante num
-- ano lectivo, com o comprovativo (ex.: declaração da entidade empregadora). Os
-- efeitos estão no regulamento (school_settings, domínio higher_ed):
--   · worker_student_absence_exempt — as faltas não excluem da avaliação;
--   · worker_student_special_season — época especial mesmo sem ser finalista.
-- O motor aplica-os em src/features/higher-ed/engine.ts (frequencyOutcome,
-- seasonEligibility).
--
-- Dados pessoais (situação laboral): só o servidor lê e escreve, com a chave de
-- serviço e o papel validado (Direcção/Secretaria, 2FA). Sem políticas: anon e
-- authenticated ficam sem acesso nenhum (docs/agents/DATABASE_RULES.md, regra 5).
-- Retirar o estatuto não apaga a linha: fica revoked_at, por quem e porquê.
--
-- Idempotente. Não mexe em dados existentes.

CREATE TABLE IF NOT EXISTS public.higher_ed_student_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('trabalhador_estudante')),
  evidence text NOT NULL CHECK (char_length(btrim(evidence)) BETWEEN 3 AND 500),
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text,
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  UNIQUE (school_id, student_id, academic_year_id, status)
);

CREATE INDEX IF NOT EXISTS higher_ed_student_statuses_school_year_idx
  ON public.higher_ed_student_statuses (school_id, academic_year_id);

ALTER TABLE public.higher_ed_student_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.higher_ed_student_statuses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.higher_ed_student_statuses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.higher_ed_student_statuses TO service_role;


-- ══════════ Confirmar ══════════
SELECT CASE
  WHEN to_regclass('public.higher_ed_student_statuses') IS NULL THEN 'por aplicar'
  WHEN has_table_privilege('authenticated', to_regclass('public.higher_ed_student_statuses'), 'SELECT')
    THEN 'por aplicar'
  ELSE 'aplicada'
END AS "20261004150000 trabalhador-estudante";
