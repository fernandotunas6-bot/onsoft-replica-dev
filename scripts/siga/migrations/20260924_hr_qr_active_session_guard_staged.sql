-- STAGING ONLY. Run the read-only hr-teacher-qr-payroll-preflight.readonly.sql first.
-- Reject concurrent issuers that attempt to leave two active QR challenges
-- for the same school, lesson and operation.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS hr_teacher_qr_one_active_per_operation
ON public.hr_teacher_qr_sessions(school_id,occurrence_id,purpose)
WHERE status='active';
COMMIT;
