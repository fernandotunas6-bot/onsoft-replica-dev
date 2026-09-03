-- SIGA / SGA — vínculos institucionais declarativos de Pessoas.
--
-- Aluno e professor continuam a ser derivados das tabelas de domínio
-- (students/teachers). Esta tabela guarda papéis institucionais que podem existir
-- antes de uma matrícula/conta, sem duplicar a identidade da pessoa.

CREATE TABLE IF NOT EXISTS public.person_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (
    role IN (
      'aluno',
      'encarregado',
      'professor',
      'funcionario',
      'diretor',
      'coordenador',
      'utilizador',
      'fornecedor',
      'contacto_institucional'
    )
  ),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  UNIQUE (person_id, role)
);

CREATE INDEX IF NOT EXISTS person_roles_school_role_active_idx
  ON public.person_roles (school_id, role, person_id)
  WHERE active = true AND deleted_at IS NULL;

ALTER TABLE public.person_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_roles FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.person_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.person_roles FROM authenticated;
GRANT SELECT ON public.person_roles TO authenticated;
GRANT ALL ON public.person_roles TO service_role;

DROP POLICY IF EXISTS "Read person roles in own school" ON public.person_roles;
CREATE POLICY "Read person roles in own school"
  ON public.person_roles
  FOR SELECT TO authenticated
  USING (
    public.is_school_member(school_id)
    AND (SELECT public.can_read_students())
  );

COMMENT ON TABLE public.person_roles IS
  'Papéis institucionais declarativos de uma Pessoa. Aluno/professor continuam validados pelas tabelas de domínio.';

NOTIFY pgrst, 'reload schema';
