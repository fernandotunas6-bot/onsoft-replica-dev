-- Módulo Pessoas: entidade central. Um único registo de pessoa pode acumular
-- vários papéis (aluno, encarregado, professor, ...) via person_roles — nunca duplicar.

-- unaccent() não é IMMUTABLE por si só (depende do dicionário) — wrapper para
-- poder ser usado em índices de expressão e nas funções de pesquisa abaixo.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT public.unaccent('public.unaccent', $1);
$$;

REVOKE EXECUTE ON FUNCTION public.immutable_unaccent(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text) TO authenticated;

CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  internal_code text,
  full_name text NOT NULL,
  first_name text,
  last_name text,
  preferred_name text,
  photo_url text,
  sex text CHECK (sex IN ('M', 'F', 'outro')),
  birth_date date,
  marital_status text,
  nationality text,
  birth_place text,
  province text,
  municipality text,
  commune text,
  address text,
  phone_primary text,
  phone_alternative text,
  whatsapp text,
  email text,
  nif text,
  profession text,
  religion text,
  special_needs text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX people_school_internal_code_idx ON public.people (school_id, internal_code)
  WHERE deleted_at IS NULL AND internal_code IS NOT NULL;
CREATE UNIQUE INDEX people_school_nif_idx ON public.people (school_id, nif)
  WHERE deleted_at IS NULL AND nif IS NOT NULL;
CREATE INDEX people_full_name_trgm_idx ON public.people
  USING gin (public.immutable_unaccent(lower(full_name)) gin_trgm_ops);
CREATE INDEX people_school_status_idx ON public.people (school_id, status) WHERE deleted_at IS NULL;

CREATE TRIGGER people_set_updated_at
  BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read people in own school" ON public.people
  FOR SELECT TO authenticated USING (school_id = (SELECT public.current_school_id()));
CREATE POLICY "Create people in own school" ON public.people
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update people in own school" ON public.people
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- person_documents: BI/passaporte/cédula — únicos por tipo+número dentro da escola.
-- ---------------------------------------------------------------------------
CREATE TABLE public.person_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('bi', 'passaporte', 'cedula', 'outro')),
  document_number text NOT NULL,
  issued_at date,
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX person_documents_school_number_idx ON public.person_documents (school_id, document_type, document_number)
  WHERE deleted_at IS NULL;
CREATE INDEX person_documents_person_idx ON public.person_documents (person_id) WHERE deleted_at IS NULL;

CREATE TRIGGER person_documents_set_updated_at
  BEFORE UPDATE ON public.person_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.person_documents TO authenticated;
GRANT ALL ON public.person_documents TO service_role;
ALTER TABLE public.person_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read person documents in own school" ON public.person_documents
  FOR SELECT TO authenticated USING (school_id = (SELECT public.current_school_id()));
CREATE POLICY "Create person documents in own school" ON public.person_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person documents in own school" ON public.person_documents
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- person_roles: os papéis que uma pessoa acumula (aluno, encarregado, ...).
-- ---------------------------------------------------------------------------
CREATE TABLE public.person_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN (
    'aluno', 'encarregado', 'professor', 'funcionario', 'diretor',
    'coordenador', 'utilizador', 'fornecedor', 'contacto_institucional'
  )),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (person_id, role)
);

CREATE INDEX person_roles_school_role_idx ON public.person_roles (school_id, role) WHERE active AND deleted_at IS NULL;

CREATE TRIGGER person_roles_set_updated_at
  BEFORE UPDATE ON public.person_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.person_roles TO authenticated;
GRANT ALL ON public.person_roles TO service_role;
ALTER TABLE public.person_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read person roles in own school" ON public.person_roles
  FOR SELECT TO authenticated USING (school_id = (SELECT public.current_school_id()));
CREATE POLICY "Create person roles in own school" ON public.person_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person roles in own school" ON public.person_roles
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- person_relationships: pai/mãe/encarregado/tutor/cônjuge/... entre duas pessoas.
-- ---------------------------------------------------------------------------
CREATE TABLE public.person_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  related_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'pai', 'mae', 'encarregado', 'tutor', 'conjuge', 'irmao',
    'contacto_emergencia', 'responsavel_financeiro', 'responsavel_autorizado_buscar'
  )),
  priority integer,
  authorized boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_until date,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (person_id <> related_person_id)
);

CREATE INDEX person_relationships_person_idx ON public.person_relationships (person_id) WHERE deleted_at IS NULL;
CREATE INDEX person_relationships_related_idx ON public.person_relationships (related_person_id) WHERE deleted_at IS NULL;

CREATE TRIGGER person_relationships_set_updated_at
  BEFORE UPDATE ON public.person_relationships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.person_relationships TO authenticated;
GRANT ALL ON public.person_relationships TO service_role;
ALTER TABLE public.person_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read person relationships in own school" ON public.person_relationships
  FOR SELECT TO authenticated USING (school_id = (SELECT public.current_school_id()));
CREATE POLICY "Create person relationships in own school" ON public.person_relationships
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person relationships in own school" ON public.person_relationships
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- person_school_links: liga uma pessoa a uma escola antes de ter um papel
-- formal (ex.: encarregado pré-registado antes do aluno estar matriculado).
-- ---------------------------------------------------------------------------
CREATE TABLE public.person_school_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  link_type text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (school_id, person_id)
);

CREATE TRIGGER person_school_links_set_updated_at
  BEFORE UPDATE ON public.person_school_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

GRANT SELECT, INSERT, UPDATE ON public.person_school_links TO authenticated;
GRANT ALL ON public.person_school_links TO service_role;
ALTER TABLE public.person_school_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read person school links in own school" ON public.person_school_links
  FOR SELECT TO authenticated USING (school_id = (SELECT public.current_school_id()));
CREATE POLICY "Create person school links in own school" ON public.person_school_links
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT public.current_school_id())
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person school links in own school" ON public.person_school_links
  FOR UPDATE TO authenticated
  USING (school_id = (SELECT public.current_school_id()))
  WITH CHECK (school_id = (SELECT public.current_school_id()));

-- ---------------------------------------------------------------------------
-- Pesquisa fuzzy (pg_trgm) — usada pela pesquisa livre em /pessoas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_people(p_query text, p_limit integer DEFAULT 20)
RETURNS SETOF public.people
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM public.people
  WHERE school_id = (SELECT public.current_school_id())
    AND deleted_at IS NULL
    AND (
      btrim(p_query) = ''
      OR public.immutable_unaccent(lower(full_name))
        OPERATOR(public.%) public.immutable_unaccent(lower(p_query))
      OR lower(coalesce(email, '')) = lower(p_query)
      OR phone_primary = p_query
      OR nif = p_query
    )
  ORDER BY
    CASE WHEN btrim(p_query) = '' THEN 0 ELSE public.similarity(
      public.immutable_unaccent(lower(full_name)),
      public.immutable_unaccent(lower(p_query))
    ) END DESC,
    full_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE EXECUTE ON FUNCTION public.search_people(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_people(text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Deteção de duplicados — nunca bloqueia, devolve candidatos com o motivo do
-- match para o utilizador decidir (ver 3.3 do prompt original).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_person_duplicates(
  p_full_name text,
  p_birth_date date DEFAULT NULL,
  p_document_number text DEFAULT NULL,
  p_nif text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS TABLE (person_id uuid, full_name text, match_reason text, score real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT p.id, p.full_name, 'documento'::text AS match_reason, 1.0::real AS score
    FROM public.person_documents pd
    JOIN public.people p ON p.id = pd.person_id
    WHERE pd.school_id = (SELECT public.current_school_id())
      AND pd.deleted_at IS NULL
      AND p_document_number IS NOT NULL
      AND pd.document_number = p_document_number

    UNION ALL
    SELECT p.id, p.full_name, 'nif', 1.0
    FROM public.people p
    WHERE p.school_id = (SELECT public.current_school_id())
      AND p.deleted_at IS NULL
      AND p_nif IS NOT NULL
      AND p.nif = p_nif

    UNION ALL
    SELECT p.id, p.full_name, 'telefone', 0.9
    FROM public.people p
    WHERE p.school_id = (SELECT public.current_school_id())
      AND p.deleted_at IS NULL
      AND p_phone IS NOT NULL
      AND p_phone IN (p.phone_primary, p.phone_alternative, p.whatsapp)

    UNION ALL
    SELECT p.id, p.full_name, 'email', 0.9
    FROM public.people p
    WHERE p.school_id = (SELECT public.current_school_id())
      AND p.deleted_at IS NULL
      AND p_email IS NOT NULL
      AND lower(p.email) = lower(p_email)

    UNION ALL
    SELECT p.id, p.full_name, 'nome_data_nascimento', 0.85
    FROM public.people p
    WHERE p.school_id = (SELECT public.current_school_id())
      AND p.deleted_at IS NULL
      AND p_birth_date IS NOT NULL
      AND p.birth_date = p_birth_date
      AND public.immutable_unaccent(lower(p.full_name))
        OPERATOR(public.%) public.immutable_unaccent(lower(p_full_name))

    UNION ALL
    SELECT p.id, p.full_name, 'nome_similar',
      public.similarity(
        public.immutable_unaccent(lower(p.full_name)),
        public.immutable_unaccent(lower(p_full_name))
      )
    FROM public.people p
    WHERE p.school_id = (SELECT public.current_school_id())
      AND p.deleted_at IS NULL
      AND public.immutable_unaccent(lower(p.full_name))
        OPERATOR(public.%) public.immutable_unaccent(lower(p_full_name))
  )
  SELECT DISTINCT ON (id) id AS person_id, full_name, match_reason, score
  FROM candidates
  ORDER BY id, score DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.find_person_duplicates(text, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_person_duplicates(text, date, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- mergePeople: mescla duas pessoas duplicadas sem apagar histórico — reaponta
-- FKs da duplicada para a sobrevivente e arquiva a duplicada (nunca elimina).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_people(p_survivor_id uuid, p_duplicate_id uuid, p_reason text)
RETURNS public.people
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid;
  v_survivor public.people;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_students()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to merge people' USING ERRCODE = '42501';
  END IF;

  IF p_survivor_id = p_duplicate_id THEN
    RAISE EXCEPTION 'survivor and duplicate must be different people';
  END IF;

  SELECT school_id INTO v_school_id FROM public.people WHERE id = p_survivor_id;
  IF v_school_id IS NULL OR v_school_id <> (SELECT public.current_school_id()) THEN
    RAISE EXCEPTION 'person not found in current school';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_duplicate_id AND school_id = v_school_id) THEN
    RAISE EXCEPTION 'duplicate person not found in current school';
  END IF;

  UPDATE public.person_documents SET person_id = p_survivor_id WHERE person_id = p_duplicate_id;
  UPDATE public.person_roles SET person_id = p_survivor_id WHERE person_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM public.person_roles existing
      WHERE existing.person_id = p_survivor_id AND existing.role = public.person_roles.role
    );
  UPDATE public.person_relationships SET person_id = p_survivor_id WHERE person_id = p_duplicate_id;
  UPDATE public.person_relationships SET related_person_id = p_survivor_id WHERE related_person_id = p_duplicate_id;
  UPDATE public.person_school_links SET person_id = p_survivor_id WHERE person_id = p_duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM public.person_school_links existing
      WHERE existing.person_id = p_survivor_id AND existing.school_id = public.person_school_links.school_id
    );
  UPDATE public.attachments SET owner_id = p_survivor_id WHERE owner_type = 'person' AND owner_id = p_duplicate_id;

  UPDATE public.people
  SET status = 'archived', updated_by = (SELECT auth.uid()), notes = coalesce(notes, '') || format(E'\n[merged into %s: %s]', p_survivor_id, p_reason)
  WHERE id = p_duplicate_id;

  SELECT * INTO v_survivor FROM public.people WHERE id = p_survivor_id;
  RETURN v_survivor;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_people(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_people(uuid, uuid, text) TO authenticated;

-- Required only by the manager-only merge workflow; RLS still limits the row
-- to the current school and the attachment type itself remains immutable.
GRANT UPDATE (owner_id) ON public.attachments TO authenticated;

-- ---------------------------------------------------------------------------
-- create_person: cria a pessoa e (opcionalmente) documentos/papéis/relações
-- na mesma transação — nunca fica um registo activo a meio, e a decisão sobre
-- duplicados encontrados (p_duplicate_decision) fica sempre na auditoria.
-- SECURITY INVOKER: every write remains subject to the caller's RLS policies.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_person(
  p_person jsonb,
  p_roles text[] DEFAULT '{}',
  p_documents jsonb DEFAULT '[]'::jsonb,
  p_relationships jsonb DEFAULT '[]'::jsonb,
  p_duplicate_decision text DEFAULT NULL
)
RETURNS public.people
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_person public.people;
  v_role text;
  v_doc jsonb;
  v_rel jsonb;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_students()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to create person' USING ERRCODE = '42501';
  END IF;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'no school associated with current user';
  END IF;

  PERFORM set_config('app.audit_reason', COALESCE(p_duplicate_decision, ''), true);

  INSERT INTO public.people (
    school_id, full_name, first_name, last_name, preferred_name, photo_url, sex, birth_date,
    marital_status, nationality, birth_place, province, municipality, commune, address,
    phone_primary, phone_alternative, whatsapp, email, nif, profession, religion, special_needs,
    notes, created_by
  )
  SELECT
    v_school_id,
    p_person ->> 'full_name',
    p_person ->> 'first_name',
    p_person ->> 'last_name',
    p_person ->> 'preferred_name',
    p_person ->> 'photo_url',
    p_person ->> 'sex',
    NULLIF(p_person ->> 'birth_date', '')::date,
    p_person ->> 'marital_status',
    p_person ->> 'nationality',
    p_person ->> 'birth_place',
    p_person ->> 'province',
    p_person ->> 'municipality',
    p_person ->> 'commune',
    p_person ->> 'address',
    p_person ->> 'phone_primary',
    p_person ->> 'phone_alternative',
    p_person ->> 'whatsapp',
    p_person ->> 'email',
    p_person ->> 'nif',
    p_person ->> 'profession',
    p_person ->> 'religion',
    p_person ->> 'special_needs',
    p_person ->> 'notes',
    (SELECT auth.uid())
  RETURNING * INTO v_person;

  PERFORM set_config('app.audit_reason', '', true);

  FOREACH v_role IN ARRAY p_roles LOOP
    INSERT INTO public.person_roles (school_id, person_id, role, created_by)
    VALUES (v_school_id, v_person.id, v_role, (SELECT auth.uid()));
  END LOOP;

  FOR v_doc IN SELECT * FROM jsonb_array_elements(p_documents) LOOP
    INSERT INTO public.person_documents (school_id, person_id, document_type, document_number, issued_at, expires_at, created_by)
    VALUES (
      v_school_id, v_person.id,
      v_doc ->> 'document_type', v_doc ->> 'document_number',
      NULLIF(v_doc ->> 'issued_at', '')::date, NULLIF(v_doc ->> 'expires_at', '')::date,
      (SELECT auth.uid())
    );
  END LOOP;

  FOR v_rel IN SELECT * FROM jsonb_array_elements(p_relationships) LOOP
    INSERT INTO public.person_relationships (
      school_id, person_id, related_person_id, relationship_type, priority, authorized,
      valid_from, valid_until, notes, created_by
    )
    VALUES (
      v_school_id, v_person.id, (v_rel ->> 'related_person_id')::uuid, v_rel ->> 'relationship_type',
      NULLIF(v_rel ->> 'priority', '')::integer,
      COALESCE((v_rel ->> 'authorized')::boolean, true),
      NULLIF(v_rel ->> 'valid_from', '')::date, NULLIF(v_rel ->> 'valid_until', '')::date,
      v_rel ->> 'notes', (SELECT auth.uid())
    );
  END LOOP;

  RETURN v_person;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_person(jsonb, text[], jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_person(jsonb, text[], jsonb, jsonb, text) TO authenticated;

-- Reusable, school-scoped academic directory. Stable codes are stored in
-- English while user-facing labels remain configurable Portuguese text.

CREATE OR REPLACE FUNCTION public.can_read_students()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT public.current_profile_role()) IN ('Administrador', 'Secretaria'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_students()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT public.current_profile_role()) IN ('Administrador', 'Secretaria'),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_students() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_students() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_students() TO authenticated;

CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT academic_years_dates_valid CHECK (starts_on < ends_on),
  CONSTRAINT academic_years_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT academic_years_school_code_key UNIQUE (school_id, code)
);

CREATE UNIQUE INDEX academic_years_one_active_per_school_idx
  ON public.academic_years (school_id)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT courses_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT courses_school_code_key UNIQUE (school_id, code)
);

CREATE TABLE public.grade_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 1 AND 99),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT grade_levels_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT grade_levels_school_code_key UNIQUE (school_id, code),
  CONSTRAINT grade_levels_school_sort_key UNIQUE (school_id, sort_order)
);

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT rooms_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT rooms_school_code_key UNIQUE (school_id, code)
);

ALTER TABLE public.people
  ADD CONSTRAINT people_school_id_id_key UNIQUE (school_id, id),
  ADD CONSTRAINT people_full_name_valid CHECK (
    full_name = btrim(full_name) AND char_length(full_name) BETWEEN 2 AND 160
  ),
  ADD CONSTRAINT people_birth_date_valid CHECK (
    birth_date IS NULL OR birth_date >= DATE '1900-01-01'
  ),
  ADD CONSTRAINT people_email_valid CHECK (
    email IS NULL OR email = btrim(email) AND char_length(email) BETWEEN 3 AND 254
  );

CREATE OR REPLACE FUNCTION private.validate_person_birth_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.birth_date IS NOT NULL AND NEW.birth_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'birth_date cannot be in the future';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.validate_person_birth_date() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER people_validate_birth_date
  BEFORE INSERT OR UPDATE OF birth_date ON public.people
  FOR EACH ROW EXECUTE FUNCTION private.validate_person_birth_date();

CREATE INDEX people_school_phone_idx
  ON public.people (school_id, phone_primary)
  WHERE phone_primary IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX people_school_email_idx
  ON public.people (school_id, lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  registration_number text NOT NULL CHECK (
    registration_number = btrim(registration_number)
    AND char_length(registration_number) BETWEEN 1 AND 64
  ),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'transferred', 'graduated')),
  admitted_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT students_school_person_fkey
    FOREIGN KEY (school_id, person_id)
    REFERENCES public.people (school_id, id),
  CONSTRAINT students_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT students_school_registration_key UNIQUE (school_id, registration_number),
  CONSTRAINT students_school_person_key UNIQUE (school_id, person_id)
);

CREATE INDEX students_school_status_idx
  ON public.students (school_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX students_registration_search_idx
  ON public.students USING gin (registration_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE TABLE public.student_guardians (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  guardian_person_id uuid NOT NULL,
  relationship text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  authorized_pickup boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  PRIMARY KEY (student_id, guardian_person_id),
  CONSTRAINT student_guardians_student_fkey
    FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id) ON DELETE CASCADE,
  CONSTRAINT student_guardians_person_fkey
    FOREIGN KEY (school_id, guardian_person_id)
    REFERENCES public.people (school_id, id)
);

CREATE UNIQUE INDEX student_guardians_one_primary_idx
  ON public.student_guardians (student_id)
  WHERE is_primary;
CREATE INDEX student_guardians_person_idx
  ON public.student_guardians (school_id, guardian_person_id);

CREATE TABLE public.class_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL,
  course_id uuid NOT NULL,
  grade_level_id uuid NOT NULL,
  room_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  shift text NOT NULL CHECK (shift IN ('morning', 'afternoon', 'evening')),
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT class_groups_year_fkey FOREIGN KEY (school_id, academic_year_id)
    REFERENCES public.academic_years (school_id, id),
  CONSTRAINT class_groups_course_fkey FOREIGN KEY (school_id, course_id)
    REFERENCES public.courses (school_id, id),
  CONSTRAINT class_groups_grade_fkey FOREIGN KEY (school_id, grade_level_id)
    REFERENCES public.grade_levels (school_id, id),
  CONSTRAINT class_groups_room_fkey FOREIGN KEY (school_id, room_id)
    REFERENCES public.rooms (school_id, id),
  CONSTRAINT class_groups_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT class_groups_school_year_code_key UNIQUE (school_id, academic_year_id, code)
);

CREATE INDEX class_groups_directory_idx
  ON public.class_groups (school_id, academic_year_id, grade_level_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX class_groups_course_idx
  ON public.class_groups (school_id, course_id);
CREATE INDEX class_groups_grade_idx
  ON public.class_groups (school_id, grade_level_id);
CREATE INDEX class_groups_room_idx
  ON public.class_groups (school_id, room_id)
  WHERE room_id IS NOT NULL;

CREATE TABLE public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'cancelled', 'completed', 'transferred')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('settled', 'pending', 'overdue')),
  enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
  final_average numeric(4,2) CHECK (final_average BETWEEN 0 AND 20),
  attendance_rate numeric(5,2) CHECK (attendance_rate BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT enrollments_student_fkey FOREIGN KEY (school_id, student_id)
    REFERENCES public.students (school_id, id),
  CONSTRAINT enrollments_year_fkey FOREIGN KEY (school_id, academic_year_id)
    REFERENCES public.academic_years (school_id, id),
  CONSTRAINT enrollments_group_fkey FOREIGN KEY (school_id, class_group_id)
    REFERENCES public.class_groups (school_id, id),
  CONSTRAINT enrollments_school_id_id_key UNIQUE (school_id, id),
  CONSTRAINT enrollments_student_year_key UNIQUE (student_id, academic_year_id)
);

CREATE INDEX enrollments_active_directory_idx
  ON public.enrollments (school_id, academic_year_id, class_group_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX enrollments_group_idx
  ON public.enrollments (school_id, class_group_id);
CREATE UNIQUE INDEX enrollments_one_current_per_student_idx
  ON public.enrollments (student_id)
  WHERE status IN ('pending', 'active') AND deleted_at IS NULL;

-- Harden the prebuilt People tables before sharing the same authorization model.
ALTER TABLE public.people ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.person_documents ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.person_roles ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.person_relationships ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.person_school_links ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.person_documents
  DROP CONSTRAINT person_documents_person_id_fkey,
  ADD CONSTRAINT person_documents_school_person_fkey
    FOREIGN KEY (school_id, person_id) REFERENCES public.people (school_id, id) ON DELETE CASCADE;
ALTER TABLE public.person_roles
  DROP CONSTRAINT person_roles_person_id_fkey,
  ADD CONSTRAINT person_roles_school_person_fkey
    FOREIGN KEY (school_id, person_id) REFERENCES public.people (school_id, id) ON DELETE CASCADE;
ALTER TABLE public.person_relationships
  DROP CONSTRAINT person_relationships_person_id_fkey,
  DROP CONSTRAINT person_relationships_related_person_id_fkey,
  ADD CONSTRAINT person_relationships_school_person_fkey
    FOREIGN KEY (school_id, person_id) REFERENCES public.people (school_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT person_relationships_school_related_fkey
    FOREIGN KEY (school_id, related_person_id) REFERENCES public.people (school_id, id) ON DELETE CASCADE;
ALTER TABLE public.person_school_links
  DROP CONSTRAINT person_school_links_person_id_fkey,
  ADD CONSTRAINT person_school_links_school_person_fkey
    FOREIGN KEY (school_id, person_id) REFERENCES public.people (school_id, id) ON DELETE CASCADE;

DROP POLICY "Read people in own school" ON public.people;
DROP POLICY "Create people in own school" ON public.people;
DROP POLICY "Update people in own school" ON public.people;
DROP POLICY "Read person documents in own school" ON public.person_documents;
DROP POLICY "Create person documents in own school" ON public.person_documents;
DROP POLICY "Update person documents in own school" ON public.person_documents;
DROP POLICY "Read person roles in own school" ON public.person_roles;
DROP POLICY "Create person roles in own school" ON public.person_roles;
DROP POLICY "Update person roles in own school" ON public.person_roles;
DROP POLICY "Read person relationships in own school" ON public.person_relationships;
DROP POLICY "Create person relationships in own school" ON public.person_relationships;
DROP POLICY "Update person relationships in own school" ON public.person_relationships;
DROP POLICY "Read person school links in own school" ON public.person_school_links;
DROP POLICY "Create person school links in own school" ON public.person_school_links;
DROP POLICY "Update person school links in own school" ON public.person_school_links;

ALTER TABLE public.people FORCE ROW LEVEL SECURITY;
ALTER TABLE public.person_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.person_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.person_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.person_school_links FORCE ROW LEVEL SECURITY;

-- Every mutable domain table shares optimistic concurrency and fresh timestamps.
CREATE TRIGGER academic_years_set_updated_at BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER courses_set_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER grade_levels_set_updated_at BEFORE UPDATE ON public.grade_levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER rooms_set_updated_at BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER students_set_updated_at BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER student_guardians_set_updated_at BEFORE UPDATE ON public.student_guardians
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER class_groups_set_updated_at BEFORE UPDATE ON public.class_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();
CREATE TRIGGER enrollments_set_updated_at BEFORE UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_version();

-- Direct Data API access remains fast, while RLS keeps every row school-scoped.
GRANT SELECT, INSERT, UPDATE ON
  public.academic_years, public.courses, public.grade_levels, public.rooms,
  public.people, public.students, public.student_guardians,
  public.class_groups, public.enrollments
TO authenticated;
GRANT ALL ON
  public.academic_years, public.courses, public.grade_levels, public.rooms,
  public.people, public.students, public.student_guardians,
  public.class_groups, public.enrollments
TO service_role;

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years FORCE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.grade_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_levels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people FORCE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students FORCE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'academic_years', 'courses', 'grade_levels', 'rooms', 'people',
    'person_documents', 'person_roles', 'person_relationships', 'person_school_links',
    'students', 'student_guardians', 'class_groups', 'enrollments'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING '
      || '(school_id = (SELECT public.current_school_id()) '
      || 'AND (SELECT public.can_read_students()))',
      'Read ' || table_name || ' in own school',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK '
      || '(school_id = (SELECT public.current_school_id()) '
      || 'AND created_by = (SELECT auth.uid()) '
      || 'AND (SELECT public.can_manage_students()))',
      'Create ' || table_name || ' in own school',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING '
      || '(school_id = (SELECT public.current_school_id()) '
      || 'AND (SELECT public.can_manage_students())) WITH CHECK '
      || '(school_id = (SELECT public.current_school_id()) '
      || 'AND (SELECT public.can_manage_students()))',
      'Update ' || table_name || ' in own school',
      table_name
    );
  END LOOP;
END;
$$;

-- A security-invoker view provides the exact shape needed by fast student lists.
CREATE VIEW public.student_directory
WITH (security_invoker = true)
AS
SELECT
  student.id,
  student.school_id,
  student.person_id,
  student.registration_number,
  person.full_name,
  person.sex AS gender,
  person.birth_date,
  person.email,
  person.phone_primary AS phone,
  person.address,
  person.version AS person_version,
  student.status AS student_status,
  enrollment.status AS enrollment_status,
  enrollment.payment_status,
  enrollment.enrolled_on,
  enrollment.final_average,
  enrollment.attendance_rate,
  year.code AS academic_year,
  course.name AS course_name,
  grade.name AS grade_name,
  group_row.code AS class_code,
  group_row.name AS class_name,
  group_row.shift,
  room.name AS room_name,
  guardian.full_name AS primary_guardian_name,
  guardian.phone_primary AS primary_guardian_phone
FROM public.students AS student
JOIN public.people AS person
  ON person.school_id = student.school_id AND person.id = student.person_id
LEFT JOIN public.enrollments AS enrollment
  ON enrollment.school_id = student.school_id
  AND enrollment.student_id = student.id
  AND enrollment.deleted_at IS NULL
  AND enrollment.status IN ('pending', 'active')
LEFT JOIN public.academic_years AS year
  ON year.school_id = enrollment.school_id AND year.id = enrollment.academic_year_id
LEFT JOIN public.class_groups AS group_row
  ON group_row.school_id = enrollment.school_id AND group_row.id = enrollment.class_group_id
LEFT JOIN public.courses AS course
  ON course.school_id = group_row.school_id AND course.id = group_row.course_id
LEFT JOIN public.grade_levels AS grade
  ON grade.school_id = group_row.school_id AND grade.id = group_row.grade_level_id
LEFT JOIN public.rooms AS room
  ON room.school_id = group_row.school_id AND room.id = group_row.room_id
LEFT JOIN public.student_guardians AS link
  ON link.school_id = student.school_id AND link.student_id = student.id AND link.is_primary
LEFT JOIN public.people AS guardian
  ON guardian.school_id = link.school_id AND guardian.id = link.guardian_person_id
WHERE student.deleted_at IS NULL AND person.deleted_at IS NULL;

GRANT SELECT ON public.student_directory TO authenticated, service_role;

COMMENT ON VIEW public.student_directory IS
  'Security-invoker read model for responsive student lists; all underlying RLS policies still apply.';

-- ---------------------------------------------------------------------------
-- create_student: matrícula transacional — aluno + inscrição na turma do ano
-- lectivo + encarregados, tudo ou nada. person_id tem de já existir (ver
-- create_person) — Aluno nunca duplica dados pessoais.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_student(
  p_person_id uuid,
  p_registration_number text,
  p_class_group_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_admitted_on date DEFAULT CURRENT_DATE,
  p_guardians jsonb DEFAULT '[]'::jsonb
)
RETURNS public.students
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_student public.students;
  v_guardian jsonb;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_students()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to create student' USING ERRCODE = '42501';
  END IF;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'no school associated with current user';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = p_person_id AND school_id = v_school_id) THEN
    RAISE EXCEPTION 'person not found in current school';
  END IF;

  INSERT INTO public.students (school_id, person_id, registration_number, admitted_on, created_by)
  VALUES (v_school_id, p_person_id, p_registration_number, COALESCE(p_admitted_on, CURRENT_DATE), (SELECT auth.uid()))
  RETURNING * INTO v_student;

  INSERT INTO public.person_roles (school_id, person_id, role, created_by)
  VALUES (v_school_id, p_person_id, 'aluno', (SELECT auth.uid()))
  ON CONFLICT (person_id, role) DO NOTHING;

  IF p_class_group_id IS NOT NULL AND p_academic_year_id IS NOT NULL THEN
    INSERT INTO public.enrollments (school_id, student_id, academic_year_id, class_group_id, status, created_by)
    VALUES (v_school_id, v_student.id, p_academic_year_id, p_class_group_id, 'active', (SELECT auth.uid()));
  END IF;

  FOR v_guardian IN SELECT * FROM jsonb_array_elements(p_guardians) LOOP
    INSERT INTO public.student_guardians (
      school_id, student_id, guardian_person_id, relationship, is_primary, authorized_pickup, created_by
    )
    VALUES (
      v_school_id, v_student.id, (v_guardian ->> 'guardian_person_id')::uuid,
      v_guardian ->> 'relationship',
      COALESCE((v_guardian ->> 'is_primary')::boolean, false),
      COALESCE((v_guardian ->> 'authorized_pickup')::boolean, true),
      (SELECT auth.uid())
    );
  END LOOP;

  RETURN v_student;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_student(uuid, text, uuid, uuid, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student(uuid, text, uuid, uuid, date, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- change_student_status: transição de estado com histórico obrigatório.
-- ---------------------------------------------------------------------------
CREATE TABLE public.student_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_status_history_student_fkey
    FOREIGN KEY (school_id, student_id) REFERENCES public.students (school_id, id) ON DELETE CASCADE
);

CREATE INDEX student_status_history_student_idx ON public.student_status_history (school_id, student_id);

GRANT SELECT ON public.student_status_history TO authenticated;
GRANT ALL ON public.student_status_history TO service_role;
ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_status_history FORCE ROW LEVEL SECURITY;

CREATE POLICY "Read student status history in own school" ON public.student_status_history
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT public.current_school_id())
    AND (SELECT public.can_read_students())
  );
CREATE OR REPLACE FUNCTION private.record_student_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.student_status_history (
      school_id, student_id, previous_status, new_status, reason, changed_by
    )
    VALUES (
      NEW.school_id,
      NEW.id,
      OLD.status,
      NEW.status,
      NULLIF(current_setting('app.status_change_reason', true), ''),
      (SELECT auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.record_student_status_change()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER students_record_status_change
  AFTER UPDATE OF status ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.record_student_status_change();

CREATE OR REPLACE FUNCTION public.change_student_status(p_student_id uuid, p_new_status text, p_reason text DEFAULT NULL)
RETURNS public.students
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_school_id uuid := (SELECT public.current_school_id());
  v_student public.students;
BEGIN
  IF NOT COALESCE((SELECT public.can_manage_students()), false) THEN
    RAISE EXCEPTION 'insufficient permissions to change student status' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_student FROM public.students WHERE id = p_student_id AND school_id = v_school_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'student not found in current school';
  END IF;

  IF p_new_status NOT IN ('active', 'inactive', 'transferred', 'graduated') THEN
    RAISE EXCEPTION 'invalid student status: %', p_new_status;
  END IF;

  PERFORM set_config('app.status_change_reason', COALESCE(p_reason, ''), true);

  UPDATE public.students SET status = p_new_status WHERE id = p_student_id
  RETURNING * INTO v_student;

  RETURN v_student;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_student_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_student_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_students(p_query text DEFAULT NULL, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS SETOF public.student_directory
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM public.student_directory
  WHERE school_id = (SELECT public.current_school_id())
    AND (
      p_query IS NULL
      OR public.immutable_unaccent(lower(full_name))
        OPERATOR(public.%) public.immutable_unaccent(lower(p_query))
      OR registration_number ILIKE '%' || p_query || '%'
      OR lower(coalesce(email, '')) = lower(p_query)
    )
  ORDER BY full_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE EXECUTE ON FUNCTION public.search_students(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_students(text, integer, integer) TO authenticated;

-- Audit domain changes without exposing INSERT on audit_logs. Only field names,
-- entity id and row version are recorded here to avoid duplicating personal data.
CREATE OR REPLACE FUNCTION private.audit_domain_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := (SELECT auth.uid());
  current_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  previous_row jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  row_school_id uuid := (current_row ->> 'school_id')::uuid;
  changed_fields text[];
BEGIN
  IF actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF row_school_id IS DISTINCT FROM (SELECT public.current_school_id()) THEN
    RAISE EXCEPTION 'cannot audit a row outside the current school' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(entry.key ORDER BY entry.key), ARRAY[]::text[])
  INTO changed_fields
  FROM jsonb_each(current_row) AS entry
  WHERE TG_OP <> 'UPDATE' OR previous_row -> entry.key IS DISTINCT FROM entry.value;

  INSERT INTO public.audit_logs (
    school_id, actor_id, action, entity_type, entity_id, reason, after_data
  )
  VALUES (
    row_school_id,
    actor,
    lower(TG_TABLE_NAME || '.' || TG_OP),
    TG_TABLE_NAME,
    (current_row ->> 'id')::uuid,
    NULLIF(current_setting('app.audit_reason', true), ''),
    jsonb_build_object(
      'version', current_row -> 'version',
      'changed_fields', to_jsonb(changed_fields)
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.audit_domain_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER people_audit_change
  AFTER INSERT OR UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();
CREATE TRIGGER students_audit_change
  AFTER INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();
CREATE TRIGGER enrollments_audit_change
  AFTER INSERT OR UPDATE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION private.audit_domain_change();

-- One-touch registration: person and student are created in the same database
-- transaction. Any failure rolls back both records automatically.
CREATE OR REPLACE FUNCTION public.enroll_new_student(
  p_person jsonb,
  p_registration_number text,
  p_class_group_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_admitted_on date DEFAULT CURRENT_DATE,
  p_guardians jsonb DEFAULT '[]'::jsonb,
  p_duplicate_decision text DEFAULT NULL
)
RETURNS public.students
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  new_person public.people;
  new_student public.students;
BEGIN
  new_person := public.create_person(
    p_person,
    ARRAY['aluno']::text[],
    '[]'::jsonb,
    '[]'::jsonb,
    p_duplicate_decision
  );

  new_student := public.create_student(
    new_person.id,
    p_registration_number,
    p_class_group_id,
    p_academic_year_id,
    p_admitted_on,
    p_guardians
  );

  RETURN new_student;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enroll_new_student(
  jsonb, text, uuid, uuid, date, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_new_student(
  jsonb, text, uuid, uuid, date, jsonb, text
) TO authenticated;
