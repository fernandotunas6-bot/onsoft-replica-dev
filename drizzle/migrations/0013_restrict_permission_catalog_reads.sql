DROP POLICY IF EXISTS "Read permissions authenticated" ON public.permissions;
DROP POLICY IF EXISTS "Read role_permissions authenticated" ON public.role_permissions;
REVOKE ALL ON public.permissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.role_permissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.permissions TO service_role;
GRANT ALL ON public.role_permissions TO service_role;
