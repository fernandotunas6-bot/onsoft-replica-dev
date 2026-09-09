-- =============================================================================
-- REVIEW ONLY — Enterprise RBAC hardening dry run
-- SIGA project: xodgfmxiaunpamctfeea
--
-- This script intentionally ends with ROLLBACK.
-- Run only on a writable staging database that reproduces production.
-- Do not change the final ROLLBACK to COMMIT until the two-school hostile tests pass.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Fail closed when the enterprise authorization substrate is not present.
DO $preflight$
DECLARE
  missing_codes text[];
BEGIN
  IF to_regprocedure('private.has_permission(uuid,text)') IS NULL
     OR to_regprocedure('private.is_aal2()') IS NULL THEN
    RAISE EXCEPTION 'Enterprise RBAC helpers are missing';
  END IF;

  SELECT array_agg(required.code ORDER BY required.code)
    INTO missing_codes
  FROM (
    VALUES
      ('assessment.grades.manage'),
      ('assessment.grades.homologate'),
      ('rbac.memberships.manage')
  ) AS required(code)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permissions p WHERE p.code = required.code
  );

  IF missing_codes IS NOT NULL THEN
    RAISE EXCEPTION 'Enterprise permission codes are missing: %', missing_codes;
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1) Public enrollment: form_id and school_id must describe the same tenant.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public insert open enrollment applications"
  ON public.enrollment_applications;

CREATE POLICY "Public insert open enrollment applications"
  ON public.enrollment_applications
  FOR INSERT TO anon
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.enrollment_forms forms
      WHERE forms.id = enrollment_applications.form_id
        AND forms.school_id = enrollment_applications.school_id
        AND forms.is_open = true
        AND forms.deleted_at IS NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Assessment helpers: authorize against the row's school_id.
-- Never resolve a sensitive write through current_school_id().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_can_manage_assessment_item(
  p_school_id uuid,
  p_class_group_id uuid,
  p_subject_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND p_school_id IS NOT NULL
    AND p_class_group_id IS NOT NULL
    AND p_subject_id IS NOT NULL
    AND (
      (
        private.is_aal2()
        AND private.has_permission(
          p_school_id,
          'assessment.grades.homologate'
        )
      )
      OR (
        private.has_permission(
          p_school_id,
          'assessment.grades.manage'
        )
        AND EXISTS (
          SELECT 1
          FROM public.class_subjects cs
          JOIN public.teachers t
            ON t.id = cs.teacher_id
           AND t.school_id = cs.school_id
          LEFT JOIN public.people person
            ON person.id = t.person_id
           AND person.school_id = t.school_id
          WHERE cs.school_id = p_school_id
            AND cs.class_group_id = p_class_group_id
            AND cs.subject_id = p_subject_id
            AND cs.status = 'active'
            AND (
              t.user_id = (SELECT auth.uid())
              OR person.user_id = (SELECT auth.uid())
            )
        )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_assessment_score(
  p_school_id uuid,
  p_item_id uuid,
  p_enrollment_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.siga_assessment_items item
      JOIN public.enrollments enrollment
        ON enrollment.id = p_enrollment_id
       AND enrollment.school_id = item.school_id
       AND enrollment.class_group_id = item.class_group_id
      WHERE item.id = p_item_id
        AND item.school_id = p_school_id
        AND public.current_user_can_manage_assessment_item(
          item.school_id,
          item.class_group_id,
          item.subject_id
        )
    );
$function$;

REVOKE ALL ON FUNCTION
  public.current_user_can_manage_assessment_item(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.current_user_can_manage_assessment_item(uuid, uuid, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.current_user_can_manage_assessment_score(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.current_user_can_manage_assessment_score(uuid, uuid, uuid)
  TO authenticated, service_role;

-- Remove the membership-only alternatives. The assigned-item policies remain.
DROP POLICY IF EXISTS "Manage assessment items in own school"
  ON public.siga_assessment_items;
DROP POLICY IF EXISTS "Manage assessment scores in own school"
  ON public.siga_assessment_scores;

-- ---------------------------------------------------------------------------
-- 3) Tenant integrity at the database boundary.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_member_role_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  membership_school_id uuid;
  role_school_id uuid;
BEGIN
  SELECT membership.school_id
    INTO membership_school_id
  FROM public.school_memberships membership
  WHERE membership.id = NEW.membership_id;

  IF membership_school_id IS NULL THEN
    RAISE EXCEPTION 'member_roles: membership % does not exist', NEW.membership_id
      USING ERRCODE = '23503';
  END IF;

  SELECT r.school_id
    INTO role_school_id
  FROM public.roles r
  WHERE r.id = NEW.role_id;

  IF role_school_id IS NULL THEN
    RAISE EXCEPTION 'member_roles: role % is missing or has no tenant', NEW.role_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.school_id IS NULL THEN
    NEW.school_id := membership_school_id;
  END IF;

  IF NEW.school_id IS DISTINCT FROM membership_school_id
     OR role_school_id IS DISTINCT FROM membership_school_id THEN
    RAISE EXCEPTION
      'member_roles: school, membership and role must share one tenant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_member_roles_tenant_integrity
  ON public.member_roles;
CREATE TRIGGER trg_member_roles_tenant_integrity
BEFORE INSERT OR UPDATE OF school_id, membership_id, role_id
ON public.member_roles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_member_role_tenant_integrity();

CREATE OR REPLACE FUNCTION public.enforce_school_invitation_role_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  NEW.role_code := lower(btrim(COALESCE(NEW.role_code, 'teacher')));

  IF NEW.role_code = 'owner' THEN
    RAISE EXCEPTION 'school_invitations: owner cannot be assigned by invitation'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.school_id = NEW.school_id
      AND lower(r.code) = NEW.role_code
  ) THEN
    RAISE EXCEPTION
      'school_invitations: role % does not exist in invitation tenant',
      NEW.role_code
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_school_invitations_role_integrity
  ON public.school_invitations;
CREATE TRIGGER trg_school_invitations_role_integrity
BEFORE INSERT OR UPDATE OF school_id, role_code, email
ON public.school_invitations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_school_invitation_role_integrity();

REVOKE ALL ON FUNCTION
  public.enforce_member_role_tenant_integrity()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.enforce_school_invitation_role_integrity()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Internal trigger functions are not RPC endpoints.
-- ---------------------------------------------------------------------------
DO $internal_triggers$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regprocedure('public.hr_gate_teacher_compensation_by_assurance()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.hr_gate_teacher_compensation_by_assurance() FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END
$internal_triggers$;

-- ---------------------------------------------------------------------------
-- 5) In-transaction smoke. Inspect these results before the final ROLLBACK.
-- ---------------------------------------------------------------------------
SELECT
  policyname,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'enrollment_applications'
  AND policyname = 'Public insert open enrollment applications';

SELECT
  p.proname,
  position('current_school_id' IN pg_get_functiondef(p.oid)) = 0
    AS avoids_first_membership,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'current_user_can_manage_assessment_item',
    'current_user_can_manage_assessment_score'
  )
ORDER BY p.proname;

SELECT
  trigger_name,
  event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'trg_member_roles_tenant_integrity',
    'trg_school_invitations_role_integrity'
  )
ORDER BY trigger_name;

ROLLBACK;
