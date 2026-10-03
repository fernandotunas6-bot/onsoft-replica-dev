-- Identity, tenancy and creation metadata must never be rewritten after a row
-- exists. RLS already prevents moving a row to another visible school, while
-- this trigger also protects privileged/server-side writes and future policies.
CREATE OR REPLACE FUNCTION private.reject_immutable_column_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  column_name text;
BEGIN
  FOREACH column_name IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(NEW) -> column_name) IS DISTINCT FROM (to_jsonb(OLD) -> column_name) THEN
      RAISE EXCEPTION 'column %.% is immutable', TG_TABLE_NAME, column_name
        USING ERRCODE = '22000';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.reject_immutable_column_changes()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'attachments',
    'people',
    'person_documents',
    'person_roles',
    'person_relationships',
    'person_school_links',
    'academic_years',
    'courses',
    'grade_levels',
    'rooms',
    'students',
    'student_guardians',
    'class_groups',
    'enrollments',
    'school_billing_settings'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION private.reject_immutable_column_changes('
      || quote_literal('id') || ', '
      || quote_literal('school_id') || ', '
      || quote_literal('created_at') || ', '
      || quote_literal('created_by') || ')',
      table_name || '_protect_identity',
      table_name
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION private.reject_immutable_column_changes() IS
  'Reusable trigger that prevents mutation of identity, tenant and creation metadata.';
