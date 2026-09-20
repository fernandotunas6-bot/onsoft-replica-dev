-- `public.rooms` nunca existiu na base viva do SGA. A única definição no
-- repositório vive em `20260810122220_people_module.sql` (migração legada,
-- nunca aplicada, usa colunas/funções — `registration_number`, `birth_date`,
-- `can_read_students()` — que já não correspondem ao schema actual). Em vez
-- de arrastar esse ficheiro de 1300+ linhas, cria-se aqui uma tabela base
-- limpa, mínima, no padrão em uso hoje (`is_school_member`,
-- `set_updated_at_and_version`), suficiente para
-- `20260908180000_advanced_academic_core.sql` a enriquecer com
-- room_type/campus_id/building/etc.

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT rooms_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT rooms_school_code_key UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS rooms_school_status_idx
  ON public.rooms (school_id, status)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS rooms_set_updated_at ON public.rooms;
CREATE TRIGGER rooms_set_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Academic access in own school" ON public.rooms;
CREATE POLICY "Academic access in own school" ON public.rooms
  FOR ALL TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

NOTIFY pgrst, 'reload schema';
