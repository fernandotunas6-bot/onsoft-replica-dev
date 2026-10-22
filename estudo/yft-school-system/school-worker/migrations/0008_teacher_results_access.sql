-- Allow admins to let teachers edit stored term results (Enrollments).
ALTER TABLE Schools ADD COLUMN teacher_can_edit_results INTEGER NOT NULL DEFAULT 0;
