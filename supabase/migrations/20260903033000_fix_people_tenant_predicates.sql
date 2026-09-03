-- SIGA / SGA — reparar predicados tenant legados do módulo Pessoas/Alunos.
--
-- A migration 20260810122220_people_module.sql tratava is_school_member(uuid),
-- que devolve boolean, como se devolvesse um UUID de escola. Isto produziu
-- expressões do tipo `school_id = public.is_school_member(school_id)` e até
-- atribuições boolean -> uuid em RPCs legadas.
--
-- Esta migration não reescreve o histórico. Corrige as policies actualmente
-- instaladas, repara o trigger de auditoria e bloqueia RPCs legadas cuja body
-- ainda depende desse padrão até serem reimplementadas sobre o schema actual.

-- ---------------------------------------------------------------------------
-- 1) Policies tenant do domínio Pessoas/Alunos.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  v_table text;
  v_has_created_by boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'academic_years',
    'courses',
    'grade_levels',
    'rooms',
    'people',
    'person_documents',
    'person_roles',
    'person_relationships',
    'person_school_links',
    'students',
    'student_guardians',
    'class_groups',
    'enrollments'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Read ' || v_table || ' in own school', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Create ' || v_table || ' in own school', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Update ' || v_table || ' in own school', v_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING '
      || '(public.is_school_member(school_id) AND (SELECT public.can_read_students()))',
      'Read ' || v_table || ' in own school',
      v_table
    );

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'created_by'
    ) INTO v_has_created_by;

    IF v_has_created_by THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK '
        || '(public.is_school_member(school_id) '
        || 'AND created_by = (SELECT auth.uid()) '
        || 'AND (SELECT public.can_manage_students()))',
        'Create ' || v_table || ' in own school',
        v_table
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK '
        || '(public.is_school_member(school_id) '
        || 'AND (SELECT public.can_manage_students()))',
        'Create ' || v_table || ' in own school',
        v_table
      );
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING '
      || '(public.is_school_member(school_id) AND (SELECT public.can_manage_students())) '
      || 'WITH CHECK '
      || '(public.is_school_member(school_id) AND (SELECT public.can_manage_students()))',
      'Update ' || v_table || ' in own school',
      v_table
    );
  END LOOP;
END
$do$;

-- student_status_history não participa do loop original porque é append-only.
DO $do$
BEGIN
  IF to_regclass('public.student_status_history') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.student_status_history FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Read student status history in own school" ON public.student_status_history';
    EXECUTE $policy$
      CREATE POLICY "Read student status history in own school"
      ON public.student_status_history
      FOR SELECT TO authenticated
      USING (
        public.is_school_member(student_status_history.school_id)
        AND (SELECT public.can_read_students())
      )
    $policy$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 2) Auditoria: validar a escola como predicado booleano, não UUID.
-- A função é independente do formato específico de people/students.
-- ---------------------------------------------------------------------------
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
  row_school_id uuid := NULLIF(current_row ->> 'school_id', '')::uuid;
  changed_fields text[];
BEGIN
  IF actor IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF row_school_id IS NULL OR NOT public.is_school_member(row_school_id) THEN
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
    NULLIF(current_row ->> 'id', '')::uuid,
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

-- ---------------------------------------------------------------------------
-- 3) RPCs legadas com boolean->uuid explícito.
-- O servidor actual não precisa destas RPCs para o fluxo novo. É mais seguro
-- negar execução do que manter uma função com isolamento tenant inválido.
-- Elas podem ser recriadas numa migration posterior usando current_school_id().
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regprocedure('public.create_person(jsonb,text[],jsonb,jsonb,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_person(jsonb, text[], jsonb, jsonb, text) FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regprocedure('public.create_student(uuid,text,uuid,uuid,date,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_student(uuid, text, uuid, uuid, date, jsonb) FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regprocedure('public.change_student_status(uuid,text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.change_student_status(uuid, text, text) FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regprocedure('public.merge_people(uuid,uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.merge_people(uuid, uuid, text) FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regprocedure('public.search_people(text,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.search_people(text, integer) FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regprocedure('public.find_person_duplicates(text,date,text,text,text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.find_person_duplicates(text, date, text, text, text, text) FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regprocedure('public.search_students(text,integer,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.search_students(text, integer, integer) FROM PUBLIC, anon, authenticated';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';
