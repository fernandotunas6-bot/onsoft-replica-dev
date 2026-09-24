-- Remove only provably duplicate, non-constraint indexes.
-- Keep the constraint-backed school_memberships unique index.
DROP INDEX IF EXISTS public.announcements_school_created_idx;
DROP INDEX IF EXISTS public.school_memberships_school_user_idx;