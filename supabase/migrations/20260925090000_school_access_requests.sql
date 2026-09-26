-- Solicitações de vinculação institucional (SIGA Plus).
--
-- Uma identidade autenticada (auth.users) sem vínculo a uma escola pede para
-- ser associada a ela, indicando o perfil pretendido. A secretaria verifica e
-- decide. Só a aprovação cria/activa `school_memberships` + `member_roles` — a
-- tabela em si nunca concede acesso a nada.
--
-- Aditiva: não altera nenhuma tabela existente. Escritas só pelo servidor
-- (service role, com a autorização validada em `requests-server.ts`); o
-- requerente só lê os seus próprios pedidos.

CREATE TABLE IF NOT EXISTS public.school_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_profile text NOT NULL CHECK (
    requested_profile IN ('aluno', 'professor', 'funcionario', 'encarregado', 'outro')
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_review', 'info_requested', 'approved', 'rejected', 'cancelled')
  ),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 3 AND 160),
  national_id text CHECK (national_id IS NULL OR char_length(national_id) <= 40),
  institutional_number text CHECK (
    institutional_number IS NULL OR char_length(institutional_number) <= 60
  ),
  contact_phone text CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 30),
  message text CHECK (message IS NULL OR char_length(message) <= 1000),
  -- Cadastro institucional encontrado com segurança (identificador + B.I. na
  -- mesma escola). Nunca é devolvido ao requerente; só a secretaria o vê.
  matched_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  match_kind text,
  granted_role_code text,
  membership_id uuid REFERENCES public.school_memberships(id) ON DELETE SET NULL,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 1000),
  info_request_note text CHECK (
    info_request_note IS NULL OR char_length(info_request_note) <= 1000
  ),
  requester_reply text CHECK (requester_reply IS NULL OR char_length(requester_reply) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No máximo um pedido em aberto por pessoa e escola.
CREATE UNIQUE INDEX IF NOT EXISTS school_access_requests_open_uidx
  ON public.school_access_requests (school_id, user_id)
  WHERE status IN ('pending', 'in_review', 'info_requested');

CREATE INDEX IF NOT EXISTS school_access_requests_school_status_idx
  ON public.school_access_requests (school_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS school_access_requests_user_idx
  ON public.school_access_requests (user_id, created_at DESC);

ALTER TABLE public.school_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_access_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.school_access_requests FROM anon;
REVOKE ALL ON public.school_access_requests FROM authenticated;
GRANT SELECT ON public.school_access_requests TO authenticated;
GRANT ALL ON public.school_access_requests TO service_role;

DROP POLICY IF EXISTS "Requester reads own access requests" ON public.school_access_requests;
CREATE POLICY "Requester reads own access requests"
  ON public.school_access_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
