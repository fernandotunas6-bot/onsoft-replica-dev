-- Histórico de cada nota (2026-09-26).
--
-- As funções da base `upsert_grade_score` e `review_grade_change` já gravam
-- em `public.grade_score_history`, mas a tabela nunca foi criada na produção:
-- qualquer chamada a essas funções falhava. A aplicação também passa a gravar
-- aqui cada alteração (valor anterior, novo, quem, motivo, quem aprovou).
--
-- Aditiva e idempotente. Só do servidor (FORCE RLS, sem acesso directo).

CREATE TABLE IF NOT EXISTS public.grade_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_score_id uuid NOT NULL REFERENCES public.grade_scores(id) ON DELETE CASCADE,
  previous_score numeric,
  new_score numeric,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 1000),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 'launch' | 'change' | 'request_approved' | 'request_rejected'
  kind text NOT NULL DEFAULT 'change' CHECK (
    kind IN ('launch', 'change', 'request_approved', 'request_rejected')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS grade_score_history_score_idx
  ON public.grade_score_history (school_id, grade_score_id, created_at DESC);

ALTER TABLE public.grade_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_score_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.grade_score_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.grade_score_history TO service_role;
