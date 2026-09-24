-- Security hardening: trigger/event-trigger functions must not be callable as RPCs.
-- Public document validation remains intentionally callable for document verification.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hr_gate_teacher_compensation_by_assurance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Fix mutable search_path on alumni helper functions.
ALTER FUNCTION public.siga_alumni_profile_completion(alumni_profiles)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.siga_refresh_alumni_profile_completion()
  SET search_path = pg_catalog, public;