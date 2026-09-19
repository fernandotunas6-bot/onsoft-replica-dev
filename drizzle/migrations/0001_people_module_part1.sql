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
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
CREATE POLICY "Create people in own school" ON public.people
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update people in own school" ON public.people
  FOR UPDATE TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
CREATE POLICY "Create person documents in own school" ON public.person_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person documents in own school" ON public.person_documents
  FOR UPDATE TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
CREATE POLICY "Create person roles in own school" ON public.person_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person roles in own school" ON public.person_roles
  FOR UPDATE TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
CREATE POLICY "Create person relationships in own school" ON public.person_relationships
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person relationships in own school" ON public.person_relationships
  FOR UPDATE TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

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
  FOR SELECT TO authenticated USING (public.is_school_member(school_id));
CREATE POLICY "Create person school links in own school" ON public.person_school_links
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_school_member(school_id)
    AND created_by = (SELECT auth.uid())
  );
CREATE POLICY "Update person school links in own school" ON public.person_school_links
  FOR UPDATE TO authenticated
  USING (public.is_school_member(school_id))
  WITH CHECK (public.is_school_member(school_id));

CREATE OR REPLACE FUNCTION public.search_people(p_query text, p_limit integer DEFAULT 20)
RETURNS SETOF public.people
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM public.people
  WHERE public.is_school_member(school_id)
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
    WHERE public.is_school_member(pd.school_id)
      AND pd.deleted_at IS NULL
      AND p_document_number IS NOT NULL
      AND pd.document_number = p_document_number

    UNION ALL
    SELECT p.id, p.full_name, 'nif', 1.0
    FROM public.people p
    WHERE public.is_school_member(p.school_id)
      AND p.deleted_at IS NULL
      AND p_nif IS NOT NULL
      AND p.nif = p_nif

    UNION ALL
    SELECT p.id, p.full_name, 'telefone', 0.9
    FROM public.people p
    WHERE public.is_school_member(p.school_id)
      AND p.deleted_at IS NULL
      AND p_phone IS NOT NULL
      AND p_phone IN (p.phone_primary, p.phone_alternative, p.whatsapp)

    UNION ALL
    SELECT p.id, p.full_name, 'email', 0.9
    FROM public.people p
    WHERE public.is_school_member(p.school_id)
      AND p.deleted_at IS NULL
      AND p_email IS NOT NULL
      AND lower(p.email) = lower(p_email)

    UNION ALL
    SELECT p.id, p.full_name, 'nome_data_nascimento', 0.85
    FROM public.people p
    WHERE public.is_school_member(p.school_id)
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
    WHERE public.is_school_member(p.school_id)
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
  IF v_school_id IS NULL OR NOT public.is_school_member(v_school_id) THEN
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

GRANT UPDATE (owner_id) ON public.attachments TO authenticated;

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
  v_school_id uuid := public.current_school_id();
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
