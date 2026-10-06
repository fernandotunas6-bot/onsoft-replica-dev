-- Bolsas de estudo: desconto por estudante na emissão das faturas.
--
-- Até aqui o único desconto automático era o de irmãos (Definições › Cobrança,
-- sibling_discount_percent, gravado no contrato financeiro). As escolas angolanas dão
-- também bolsas de mérito, sociais, a filhos de funcionários e por protocolo com uma
-- entidade (empresa, igreja, governo provincial). Esta tabela guarda quem tem bolsa,
-- de quanto, para que taxas, de quando a quando e com que prova.
--
-- Regra (src/features/finance/scholarships.ts): na emissão de uma fatura, o desconto é
-- o MAIOR entre o do contrato (irmãos) e o da bolsa em vigor na data de emissão — não se
-- somam. `scope = 'tuition'` só nas propinas; `all` em todas as taxas.
--
-- Dados financeiros de um estudante: só o servidor lhes toca (Administrador/Tesouraria
-- concedem e revogam, com 2FA; a Secretaria só lê). FORCE RLS, sem políticas, REVOKE de
-- PUBLIC, anon e authenticated (docs/agents/DATABASE_RULES.md, regra 5). Idempotente.

CREATE TABLE IF NOT EXISTS public.student_scholarships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('merit', 'social', 'staff', 'institutional', 'other')),
  percent numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
  scope text NOT NULL DEFAULT 'tuition' CHECK (scope IN ('tuition', 'all')),
  sponsor text CHECK (sponsor IS NULL OR char_length(sponsor) <= 200),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  evidence_note text NOT NULL CHECK (char_length(btrim(evidence_note)) BETWEEN 3 AND 1000),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason text CHECK (revoke_reason IS NULL OR char_length(revoke_reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT student_scholarships_valid_range
    CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

-- Uma bolsa em vigor por estudante (as revogadas ficam no histórico).
CREATE UNIQUE INDEX IF NOT EXISTS student_scholarships_one_open
  ON public.student_scholarships (school_id, student_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS student_scholarships_school_idx
  ON public.student_scholarships (school_id, valid_from DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'student_scholarships_touch'
      AND tgrelid = 'public.student_scholarships'::regclass
  ) THEN
    CREATE TRIGGER student_scholarships_touch
      BEFORE UPDATE ON public.student_scholarships
      FOR EACH ROW EXECUTE FUNCTION public.siga_touch_updated_at();
  END IF;
END $$;

ALTER TABLE public.student_scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_scholarships FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_scholarships FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_scholarships TO service_role;
