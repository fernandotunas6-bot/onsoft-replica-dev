-- Website drafts and school blog records must never use the generic member SELECT.
-- Existing academic/settings domains retain their current policies and grants.
BEGIN;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_web_content_server_only ON public.school_settings;
CREATE POLICY school_web_content_server_only
  ON public.school_settings AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (domain <> 'school_website' AND NOT pg_catalog.starts_with(domain, 'school_blog.'))
  WITH CHECK (domain <> 'school_website' AND NOT pg_catalog.starts_with(domain, 'school_blog.'));

-- Service-only readiness probe. Application writes fail closed until this policy exists.
CREATE OR REPLACE FUNCTION public.school_web_storage_ready()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy p
    JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'school_settings'
      AND p.polname = 'school_web_content_server_only'
      AND NOT p.polpermissive AND p.polcmd = '*'
      AND c.relrowsecurity AND c.relforcerowsecurity
      AND p.polroles @> ARRAY[
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'),
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
      ]::oid[]
      AND position('school_website' IN pg_catalog.pg_get_expr(p.polqual, p.polrelid)) > 0
      AND position('school_blog.' IN pg_catalog.pg_get_expr(p.polqual, p.polrelid)) > 0
      AND position('school_website' IN pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)) > 0
      AND position('school_blog.' IN pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)) > 0
  );
$function$;
REVOKE ALL ON FUNCTION public.school_web_storage_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_web_storage_ready() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
