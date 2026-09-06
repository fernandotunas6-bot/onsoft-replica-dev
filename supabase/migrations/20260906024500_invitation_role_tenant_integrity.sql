-- SIGA Plus — tenant integrity for invitations and member roles
-- Additive/idempotent hardening. Do not apply blindly to the wrong Supabase project.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_member_role_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_membership_school_id uuid;
  v_role_school_id uuid;
BEGIN
  SELECT sm.school_id
    INTO v_membership_school_id
  FROM public.school_memberships sm
  WHERE sm.id = NEW.membership_id;

  IF v_membership_school_id IS NULL THEN
    RAISE EXCEPTION 'member_roles: membership % does not exist', NEW.membership_id
      USING ERRCODE = '23503';
  END IF;

  SELECT r.school_id
    INTO v_role_school_id
  FROM public.roles r
  WHERE r.id = NEW.role_id;

  IF v_role_school_id IS NULL THEN
    RAISE EXCEPTION 'member_roles: role % does not exist', NEW.role_id
      USING ERRCODE = '23503';
  END IF;

  -- Compatibility with older inserts that omitted school_id: derive it from the
  -- membership, but never allow a caller to provide a conflicting tenant.
  IF NEW.school_id IS NULL THEN
    NEW.school_id := v_membership_school_id;
  END IF;

  IF NEW.school_id IS DISTINCT FROM v_membership_school_id THEN
    RAISE EXCEPTION 'member_roles: school_id must match membership tenant'
      USING ERRCODE = '23514';
  END IF;

  IF v_role_school_id IS DISTINCT FROM v_membership_school_id THEN
    RAISE EXCEPTION 'member_roles: role and membership must belong to the same school'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_roles_tenant_integrity ON public.member_roles;
CREATE TRIGGER trg_member_roles_tenant_integrity
BEFORE INSERT OR UPDATE OF school_id, membership_id, role_id
ON public.member_roles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_member_role_tenant_integrity();

CREATE OR REPLACE FUNCTION public.enforce_school_invitation_role_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role_exists boolean;
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.role_code := lower(btrim(COALESCE(NEW.role_code, 'teacher')));

  IF NEW.role_code = 'owner' THEN
    RAISE EXCEPTION 'school_invitations: owner cannot be assigned by invitation'
      USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.school_id = NEW.school_id
      AND lower(r.code) = NEW.role_code
  ) INTO v_role_exists;

  IF NOT v_role_exists THEN
    RAISE EXCEPTION 'school_invitations: role % does not exist in school %', NEW.role_code, NEW.school_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_invitations_role_integrity ON public.school_invitations;
CREATE TRIGGER trg_school_invitations_role_integrity
BEFORE INSERT OR UPDATE OF school_id, role_code, email
ON public.school_invitations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_school_invitation_role_integrity();

-- Guard against direct client execution if these helper functions are exposed by PostgREST.
REVOKE ALL ON FUNCTION public.enforce_member_role_tenant_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_school_invitation_role_integrity() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Verification after applying to the intended SGA database:
-- 1. Insert member_roles with membership from school A + role from school B -> must fail 23514.
-- 2. Insert school_invitations with role_code='owner' -> must fail 23514.
-- 3. Insert invitation with role_code absent from that school -> must fail 23514.
-- 4. Normal teacher/admin invitation using a role belonging to the same school -> succeeds.
