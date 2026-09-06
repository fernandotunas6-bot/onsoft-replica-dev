-- =============================================================================
-- SIGA — RBAC and sensitive-domain hardening
-- Date: 2026-09-06
-- This migration narrows client access without changing application data.
-- =============================================================================

-- Harden permission resolution against malformed cross-tenant role links.
CREATE OR REPLACE FUNCTION public.has_school_permission(p_school_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE sm.school_id = p_school_id
      AND sm.user_id = (SELECT auth.uid())
      AND sm.status = 'active'
      AND (mr.school_id IS NULL OR mr.school_id = sm.school_id)
      AND (r.school_id IS NULL OR r.school_id = sm.school_id)
      AND p.code = p_permission
  ) OR EXISTS (
    SELECT 1
    FROM public.school_memberships sm
    JOIN public.member_roles mr ON mr.membership_id = sm.id
    JOIN public.roles r ON r.id = mr.role_id
    WHERE sm.school_id = p_school_id
      AND sm.user_id = (SELECT auth.uid())
      AND sm.status = 'active'
      AND (mr.school_id IS NULL OR mr.school_id = sm.school_id)
      AND (r.school_id IS NULL OR r.school_id = sm.school_id)
      AND r.code IN ('owner', 'admin', 'administrator', 'director')
  );
$$;
REVOKE ALL ON FUNCTION public.has_school_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_school_permission(uuid, text) TO authenticated, service_role;

-- Membership directory: self is visible; tenant-wide account lists require access permission.
DROP POLICY IF EXISTS "Users can read own memberships" ON public.school_memberships;
CREATE POLICY "Read own or authorized memberships"
  ON public.school_memberships FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_school_permission(school_id, 'access.read')
    OR public.has_school_permission(school_id, 'access.manage')
  );
REVOKE INSERT, UPDATE, DELETE ON public.school_memberships FROM authenticated;

-- Role assignments: self is visible; directory-wide visibility requires access permission.
DROP POLICY IF EXISTS "Read member_roles in own school" ON public.member_roles;
CREATE POLICY "Read own or authorized member roles"
  ON public.member_roles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.school_memberships sm
      WHERE sm.id = public.member_roles.membership_id
        AND (
          sm.user_id = (SELECT auth.uid())
          OR public.has_school_permission(sm.school_id, 'access.read')
          OR public.has_school_permission(sm.school_id, 'access.manage')
          OR public.has_school_permission(sm.school_id, 'school.roles.manage')
        )
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.member_roles FROM authenticated;

-- Invitations are managed through trusted server functions. Prevent direct client
-- creation of arbitrary role_code values such as owner/admin.
DROP POLICY IF EXISTS "Manage invitations in own school" ON public.school_invitations;
CREATE POLICY "Read invitations with access permission"
  ON public.school_invitations FOR SELECT TO authenticated
  USING (
    public.has_school_permission(school_id, 'access.read')
    OR public.has_school_permission(school_id, 'access.invite')
    OR public.has_school_permission(school_id, 'access.manage')
  );
REVOKE INSERT, UPDATE, DELETE ON public.school_invitations FROM authenticated;

-- Personal documents contain identity data; membership alone is insufficient.
DROP POLICY IF EXISTS "Read school person documents" ON public.person_documents;
CREATE POLICY "Read person documents with permission"
  ON public.person_documents FOR SELECT TO authenticated
  USING (public.has_school_permission(school_id, 'documents.read'));
DROP POLICY IF EXISTS "Manage school person documents" ON public.person_documents;
CREATE POLICY "Manage person documents with permission"
  ON public.person_documents FOR ALL TO authenticated
  USING (public.has_school_permission(school_id, 'documents.issue'))
  WITH CHECK (public.has_school_permission(school_id, 'documents.issue'));

-- Assessment definitions and scores: split read/write by pedagogical permission.
DROP POLICY IF EXISTS "Manage assessment items in own school" ON public.siga_assessment_items;
CREATE POLICY "Read assessment items with permission"
  ON public.siga_assessment_items FOR SELECT TO authenticated
  USING (public.has_school_permission(school_id, 'grades.read'));
CREATE POLICY "Insert assessment items with permission"
  ON public.siga_assessment_items FOR INSERT TO authenticated
  WITH CHECK (public.has_school_permission(school_id, 'grades.create'));
CREATE POLICY "Update assessment items with permission"
  ON public.siga_assessment_items FOR UPDATE TO authenticated
  USING (public.has_school_permission(school_id, 'grades.update'))
  WITH CHECK (public.has_school_permission(school_id, 'grades.update'));

DROP POLICY IF EXISTS "Manage assessment scores in own school" ON public.siga_assessment_scores;
CREATE POLICY "Read assessment scores with permission"
  ON public.siga_assessment_scores FOR SELECT TO authenticated
  USING (public.has_school_permission(school_id, 'grades.read'));
CREATE POLICY "Insert assessment scores with permission"
  ON public.siga_assessment_scores FOR INSERT TO authenticated
  WITH CHECK (public.has_school_permission(school_id, 'grades.create'));
CREATE POLICY "Update assessment scores with permission"
  ON public.siga_assessment_scores FOR UPDATE TO authenticated
  USING (public.has_school_permission(school_id, 'grades.update'))
  WITH CHECK (public.has_school_permission(school_id, 'grades.update'));

-- Lesson plans: teachers/staff need explicit lesson-plan permissions.
DROP POLICY IF EXISTS "Manage lesson plans in own school" ON public.siga_lesson_plans;
CREATE POLICY "Read lesson plans with permission"
  ON public.siga_lesson_plans FOR SELECT TO authenticated
  USING (public.has_school_permission(school_id, 'lesson_plans.read'));
CREATE POLICY "Manage lesson plans with permission"
  ON public.siga_lesson_plans FOR ALL TO authenticated
  USING (public.has_school_permission(school_id, 'lesson_plans.manage'))
  WITH CHECK (public.has_school_permission(school_id, 'lesson_plans.manage'));

DROP POLICY IF EXISTS "Manage lesson plan components in own school" ON public.siga_lesson_plan_components;
CREATE POLICY "Read lesson plan components with permission"
  ON public.siga_lesson_plan_components FOR SELECT TO authenticated
  USING (public.has_school_permission(school_id, 'lesson_plans.read'));
CREATE POLICY "Manage lesson plan components with permission"
  ON public.siga_lesson_plan_components FOR ALL TO authenticated
  USING (public.has_school_permission(school_id, 'lesson_plans.manage'))
  WITH CHECK (public.has_school_permission(school_id, 'lesson_plans.manage'));

-- File metadata: replace broad FOR ALL membership policy with operation-specific rules.
DROP POLICY IF EXISTS "Read school files" ON public.siga_files;
DROP POLICY IF EXISTS "Write school files" ON public.siga_files;
CREATE POLICY "Read files with permission"
  ON public.siga_files FOR SELECT TO authenticated
  USING (public.has_school_permission(school_id, 'files.read'));
CREATE POLICY "Insert own files with permission"
  ON public.siga_files FOR INSERT TO authenticated
  WITH CHECK (
    public.has_school_permission(school_id, 'files.upload')
    AND owner_user_id = (SELECT auth.uid())
  );
CREATE POLICY "Update files with permission"
  ON public.siga_files FOR UPDATE TO authenticated
  USING (
    public.has_school_permission(school_id, 'files.manage_system')
    OR (
      owner_user_id = (SELECT auth.uid())
      AND public.has_school_permission(school_id, 'files.upload')
    )
  )
  WITH CHECK (
    public.has_school_permission(school_id, 'files.manage_system')
    OR (
      owner_user_id = (SELECT auth.uid())
      AND public.has_school_permission(school_id, 'files.upload')
    )
  );
CREATE POLICY "Delete files with permission"
  ON public.siga_files FOR DELETE TO authenticated
  USING (
    public.has_school_permission(school_id, 'files.manage_system')
    OR (
      owner_user_id = (SELECT auth.uid())
      AND public.has_school_permission(school_id, 'files.delete')
    )
  );

-- Verification targets:
-- - ordinary student cannot create owner/admin invitation;
-- - cross-school member_roles cannot satisfy has_school_permission;
-- - ordinary member cannot edit grades, lesson plans or other users' files;
-- - secretary/admin server flows keep working through service_role.
