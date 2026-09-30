-- Retire unusable legacy INVOKER RPCs; no current application caller.
-- Their private helpers lack EXECUTE. Preserve definitions and server access.
-- Re-enable individually only with verified guards and complete permissions.
REVOKE EXECUTE ON FUNCTION public.act_on_document_signature(school_id uuid, signature_id uuid, status text, note text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_student_case_item(school_id uuid, case_id uuid, item_kind text, request_id uuid, issued_document_id uuid, note_text text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_school_record(school_id uuid, title text, classification text, student_id uuid, issued_document_id uuid, case_id uuid, retention_until date, notes text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_school_role(school_id uuid, membership_id uuid, role_code text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.batch_issue_school_documents(school_id uuid, template_id uuid, student_ids uuid[], requires_signature boolean, title text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_gradebook(school_id uuid, gradebook_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_council_minutes(school_id uuid, class_group_id uuid, academic_year_id uuid, title text, body text, term_id uuid, decided_on date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_document_request(school_id uuid, student_id uuid, request_type text, purpose text, template_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_grade_complaint(school_id uuid, enrollment_id uuid, reason text, deadline_on date, grade_score_id uuid, grade_sheet_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_student_case(school_id uuid, student_id uuid, case_type text, title text, summary text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_report_cards(school_id uuid, grade_sheet_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_school_document(school_id uuid, student_id uuid, template_id uuid, rendered_body text, request_id uuid, title text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.open_gradebook(school_id uuid, class_subject_id uuid, term_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_announcement(school_id uuid, title text, body text, audience text, class_group_id uuid, role_code text, priority text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_assessment_rule_version(school_id uuid, continuous_weight numeric, exam_weight numeric, passing_grade numeric, maximum_absence_percentage numeric, rounding_method text, require_change_approval boolean, lock_after_publication boolean, key_subject_ids uuid[], key_subjects_cause_failure boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_document_template(school_id uuid, code text, name text, document_type text, body_template text, allowed_fields jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.render_document_placeholders(school_id uuid, student_id uuid, body_template text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_gradebook(school_id uuid, gradebook_id uuid, reason text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_document_signature(school_id uuid, document_id uuid, signer_role text, note text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_grade_complaint(school_id uuid, complaint_id uuid, status text, response text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_document_request(school_id uuid, request_id uuid, status text, review_note text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.review_grade_change(school_id uuid, grade_score_id uuid, approve boolean, review_note text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_school_document(school_id uuid, document_id uuid, reason text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_school_role(school_id uuid, membership_id uuid, role_code text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_gradebook(school_id uuid, gradebook_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_enrollment_status(school_id uuid, enrollment_id uuid, status text, ended_on date, end_reason text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_student_case_status(school_id uuid, case_id uuid, status text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_grade_item(school_id uuid, gradebook_id uuid, code text, name text, kind text, weight numeric, max_score numeric, assessed_on date, sequence smallint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_grade_score(school_id uuid, grade_item_id uuid, enrollment_id uuid, score numeric, reason text, note text) FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
