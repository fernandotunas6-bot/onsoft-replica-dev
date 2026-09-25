-- Supports the administrator dashboard's bounded, school-scoped recent audit
-- query without sorting the complete immutable history on every page load.
CREATE INDEX audit_logs_school_recent_idx
  ON public.audit_logs (school_id, created_at DESC);
