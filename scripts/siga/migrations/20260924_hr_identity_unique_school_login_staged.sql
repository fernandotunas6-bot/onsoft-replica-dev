-- STAGING ONLY. One active person and one teacher record per login in each school.
-- Run duplicate-identity preflight before applying to an existing database.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS people_one_active_login_per_school
  ON public.people (school_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS teachers_one_login_per_school
  ON public.teachers (school_id, user_id)
  WHERE user_id IS NOT NULL;
COMMIT;
