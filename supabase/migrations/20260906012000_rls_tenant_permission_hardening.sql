-- =============================================================================
-- SIGA — RLS tenant/permission hardening
-- Date: 2026-09-06
-- Purpose:
--   1) remove membership-only write access from sensitive school tables;
--   2) scope authorization to the row's school_id;
--   3) avoid current_profile_role() for cross-school authorization decisions;
--   4) allow users to create only their own calendar feed token.
--
-- This migration is intentionally additive/idempotent: it replaces policies only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Staff module grants
-- A normal school member must never be able to grant themselves elevated modules.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read own or admin staff grants" ON public.staff_module_grants;
CREATE POLICY "Read own or authorized staff grants"
  ON public.staff_module_grants
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_school_permission(school_id, 'access.read')
    OR public.has_school_permission(school_id, 'access.manage')
    OR public.has_school_permission(school_id, 'school.roles.manage')
  );

DROP POLICY IF EXISTS "Admins manage staff grants" ON public.staff_module_grants;
CREATE POLICY "Authorized staff manage staff grants"
  ON public.staff_module_grants
  FOR ALL TO authenticated
  USING (
    public.has_school_permission(school_id, 'access.manage')
    OR public.has_school_permission(school_id, 'school.roles.manage')
  )
  WITH CHECK (
    public.has_school_permission(school_id, 'access.manage')
    OR public.has_school_permission(school_id, 'school.roles.manage')
  );

-- -----------------------------------------------------------------------------
-- School integrations
-- Integration configuration may contain operational credentials/config and must
-- not be writable by every member of the tenant.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage school integrations in own school" ON public.school_integrations;

CREATE POLICY "Read school integrations with permission"
  ON public.school_integrations
  FOR SELECT TO authenticated
  USING (
    public.has_school_permission(school_id, 'school.settings.read')
    OR public.has_school_permission(school_id, 'school.settings.update')
  );

CREATE POLICY "Insert school integrations with permission"
  ON public.school_integrations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_school_permission(school_id, 'school.settings.update'));

CREATE POLICY "Update school integrations with permission"
  ON public.school_integrations
  FOR UPDATE TO authenticated
  USING (public.has_school_permission(school_id, 'school.settings.update'))
  WITH CHECK (public.has_school_permission(school_id, 'school.settings.update'));

-- -----------------------------------------------------------------------------
-- Finance payment plans
-- Restrict plan management to finance-authorized roles instead of all members.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage payment plans in own school" ON public.finance_payment_plans;

CREATE POLICY "Read payment plans with finance permission"
  ON public.finance_payment_plans
  FOR SELECT TO authenticated
  USING (
    public.has_school_permission(school_id, 'finance.read')
    OR public.has_school_permission(school_id, 'finance.plans')
  );

CREATE POLICY "Insert payment plans with finance permission"
  ON public.finance_payment_plans
  FOR INSERT TO authenticated
  WITH CHECK (public.has_school_permission(school_id, 'finance.plans'));

CREATE POLICY "Update payment plans with finance permission"
  ON public.finance_payment_plans
  FOR UPDATE TO authenticated
  USING (public.has_school_permission(school_id, 'finance.plans'))
  WITH CHECK (public.has_school_permission(school_id, 'finance.plans'));

-- -----------------------------------------------------------------------------
-- Public enrollment form administration
-- Reading open forms remains public through the existing anon policy. Editing a
-- form requires enrollment or school-settings authorization.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read enrollment forms in own school" ON public.enrollment_forms;
CREATE POLICY "Read enrollment forms with permission"
  ON public.enrollment_forms
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.has_school_permission(school_id, 'enrollments.read')
      OR public.has_school_permission(school_id, 'enrollments.create')
      OR public.has_school_permission(school_id, 'school.settings.read')
      OR public.has_school_permission(school_id, 'school.settings.update')
    )
  );

DROP POLICY IF EXISTS "Manage enrollment forms in own school" ON public.enrollment_forms;
CREATE POLICY "Manage enrollment forms with permission"
  ON public.enrollment_forms
  FOR ALL TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.has_school_permission(school_id, 'enrollments.create')
      OR public.has_school_permission(school_id, 'school.settings.update')
    )
  )
  WITH CHECK (
    public.has_school_permission(school_id, 'enrollments.create')
    OR public.has_school_permission(school_id, 'school.settings.update')
  );

-- -----------------------------------------------------------------------------
-- Enrollment applications contain applicant PII. Membership alone is not enough.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read enrollment applications in own school" ON public.enrollment_applications;
CREATE POLICY "Read enrollment applications with permission"
  ON public.enrollment_applications
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.has_school_permission(school_id, 'enrollments.read')
      OR public.has_school_permission(school_id, 'enrollments.approve')
    )
  );

DROP POLICY IF EXISTS "Update enrollment applications in own school" ON public.enrollment_applications;
CREATE POLICY "Update enrollment applications with permission"
  ON public.enrollment_applications
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.has_school_permission(school_id, 'enrollments.approve')
  )
  WITH CHECK (public.has_school_permission(school_id, 'enrollments.approve'));

-- -----------------------------------------------------------------------------
-- Calendar feed tokens
-- Existing grants include INSERT but the original SQL only defined SELECT.
-- Explicitly allow a user to create a token for themselves in a school where
-- they have an active membership.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Insert own calendar feed token" ON public.calendar_feed_tokens;
CREATE POLICY "Insert own calendar feed token"
  ON public.calendar_feed_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.is_school_member(school_id)
  );

-- -----------------------------------------------------------------------------
-- Gateway webhook observability
-- Do not combine is_school_member(row.school_id) with current_profile_role(),
-- because current_profile_role() resolves the user's first active school and can
-- therefore leak a privileged role across a second school membership.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read gateway webhook events in own school" ON public.finance_gateway_webhook_events;
CREATE POLICY "Read gateway webhook events with finance permission"
  ON public.finance_gateway_webhook_events
  FOR SELECT TO authenticated
  USING (public.has_school_permission(school_id, 'finance.read'));

-- -----------------------------------------------------------------------------
-- Defensive grants: RLS remains the authorization boundary, but avoid granting
-- operations that have no supported client workflow.
-- -----------------------------------------------------------------------------
REVOKE DELETE ON public.school_integrations FROM authenticated;
REVOKE DELETE ON public.finance_payment_plans FROM authenticated;

-- Verification examples (run as authenticated test users in separate schools):
-- 1. ordinary member cannot INSERT/UPDATE staff_module_grants;
-- 2. teacher cannot read enrollment_applications without enrollments.read;
-- 3. finance user can read plans in own school only;
-- 4. admin in School A + ordinary member in School B cannot read B gateway events;
-- 5. calendar token INSERT succeeds only for auth.uid() and an active membership.
