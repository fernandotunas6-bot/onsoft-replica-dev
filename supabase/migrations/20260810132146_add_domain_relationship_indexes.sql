-- Full (non-partial) indexes for tenant filters and the referencing side of
-- frequently used foreign-key joins. Partial search indexes remain useful for
-- active rows, but cannot accelerate integrity checks for every stored row.
CREATE INDEX profiles_school_id_idx ON public.profiles (school_id);
CREATE INDEX attachments_school_id_idx ON public.attachments (school_id);
CREATE INDEX person_documents_school_person_idx
  ON public.person_documents (school_id, person_id);
CREATE INDEX person_roles_school_person_idx
  ON public.person_roles (school_id, person_id);
CREATE INDEX person_relationships_school_person_idx
  ON public.person_relationships (school_id, person_id);
CREATE INDEX person_relationships_school_related_idx
  ON public.person_relationships (school_id, related_person_id);
CREATE INDEX student_guardians_school_student_idx
  ON public.student_guardians (school_id, student_id);
CREATE INDEX enrollments_school_student_idx
  ON public.enrollments (school_id, student_id);
CREATE INDEX enrollments_school_year_idx
  ON public.enrollments (school_id, academic_year_id);
