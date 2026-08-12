-- =============================================================================
-- SGA (xodgfmxiaunpamctfeea) — índices de performance
-- Projecto: https://supabase.com/dashboard/project/xodgfmxiaunpamctfeea/sql
--
-- Auditoria: 149 colunas de foreign key sem índice próprio no schema real.
-- Esta lista cobre apenas as que o código efectivamente filtra (.eq(...)) —
-- não indexa às cegas colunas de auditoria (created_by/updated_by/etc.), que
-- só aparecem em SELECT * e nunca em WHERE, para não pagar custo de escrita
-- sem ganho de leitura.
-- =============================================================================

-- Caminho crítico: corre em TODO pedido autenticado (resolveSgaMembershipAdmin).
CREATE INDEX IF NOT EXISTS member_roles_membership_idx ON public.member_roles (membership_id);
CREATE INDEX IF NOT EXISTS member_roles_role_idx ON public.member_roles (role_id);
CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON public.role_permissions (role_id);
CREATE INDEX IF NOT EXISTS role_permissions_permission_idx ON public.role_permissions (permission_id);
CREATE INDEX IF NOT EXISTS profiles_school_idx ON public.profiles (school_id);

-- school_id em falta em tabelas novas (todo o resto do schema já tinha).
CREATE INDEX IF NOT EXISTS finance_payment_plans_school_idx ON public.finance_payment_plans (school_id);
CREATE INDEX IF NOT EXISTS siga_assessment_items_school_idx ON public.siga_assessment_items (school_id);
CREATE INDEX IF NOT EXISTS siga_assessment_scores_school_idx ON public.siga_assessment_scores (school_id);

-- Pessoas / matrícula — fichas e listagens filtram por estas colunas.
CREATE INDEX IF NOT EXISTS students_person_idx ON public.students (person_id);
CREATE INDEX IF NOT EXISTS teachers_person_idx ON public.teachers (person_id);
CREATE INDEX IF NOT EXISTS student_guardians_student_idx ON public.student_guardians (student_id);
CREATE INDEX IF NOT EXISTS student_guardians_guardian_idx ON public.student_guardians (guardian_person_id);
-- person_documents já tem índice composto (school_id, person_id) desde a criação da tabela.
CREATE INDEX IF NOT EXISTS enrollments_student_idx ON public.enrollments (student_id);
CREATE INDEX IF NOT EXISTS enrollments_class_group_idx ON public.enrollments (class_group_id);
CREATE INDEX IF NOT EXISTS enrollments_academic_year_idx ON public.enrollments (academic_year_id);

-- Turmas / pedagógico.
CREATE INDEX IF NOT EXISTS class_groups_academic_year_idx ON public.class_groups (academic_year_id);
CREATE INDEX IF NOT EXISTS class_subjects_class_group_idx ON public.class_subjects (class_group_id);
CREATE INDEX IF NOT EXISTS class_subjects_teacher_idx ON public.class_subjects (teacher_id);
CREATE INDEX IF NOT EXISTS class_subjects_subject_idx ON public.class_subjects (subject_id);
CREATE INDEX IF NOT EXISTS teacher_subjects_teacher_idx ON public.teacher_subjects (teacher_id);
CREATE INDEX IF NOT EXISTS teacher_subjects_subject_idx ON public.teacher_subjects (subject_id);
CREATE INDEX IF NOT EXISTS terms_academic_year_idx ON public.terms (academic_year_id);

-- Avaliação / pauta.
CREATE INDEX IF NOT EXISTS gradebooks_class_group_idx ON public.gradebooks (class_group_id);
CREATE INDEX IF NOT EXISTS gradebooks_class_subject_idx ON public.gradebooks (class_subject_id);
CREATE INDEX IF NOT EXISTS gradebooks_academic_year_idx ON public.gradebooks (academic_year_id);
CREATE INDEX IF NOT EXISTS grade_items_gradebook_idx ON public.grade_items (gradebook_id);
CREATE INDEX IF NOT EXISTS grade_scores_enrollment_idx ON public.grade_scores (enrollment_id);
CREATE INDEX IF NOT EXISTS grade_scores_grade_item_idx ON public.grade_scores (grade_item_id);
CREATE INDEX IF NOT EXISTS grade_sheets_class_group_idx ON public.grade_sheets (class_group_id);
CREATE INDEX IF NOT EXISTS grade_sheets_academic_year_idx ON public.grade_sheets (academic_year_id);
CREATE INDEX IF NOT EXISTS grade_sheet_rows_enrollment_idx ON public.grade_sheet_rows (enrollment_id);
CREATE INDEX IF NOT EXISTS grade_sheet_rows_sheet_idx ON public.grade_sheet_rows (grade_sheet_id);
CREATE INDEX IF NOT EXISTS report_cards_enrollment_idx ON public.report_cards (enrollment_id);

-- Presença.
CREATE INDEX IF NOT EXISTS attendance_records_session_idx ON public.attendance_records (attendance_session_id);
CREATE INDEX IF NOT EXISTS attendance_records_enrollment_idx ON public.attendance_records (enrollment_id);
CREATE INDEX IF NOT EXISTS attendance_sessions_slot_idx ON public.attendance_sessions (timetable_slot_id);
CREATE INDEX IF NOT EXISTS attendance_sessions_class_subject_idx ON public.attendance_sessions (class_subject_id);
CREATE INDEX IF NOT EXISTS timetable_slots_class_subject_idx ON public.timetable_slots (class_subject_id);

-- Financeiro / documentos.
CREATE INDEX IF NOT EXISTS finance_contracts_enrollment_idx ON public.finance_contracts (enrollment_id);
CREATE INDEX IF NOT EXISTS finance_invoices_contract_idx ON public.finance_invoices (contract_id);
CREATE INDEX IF NOT EXISTS finance_receipts_invoice_idx ON public.finance_receipts (invoice_id);
CREATE INDEX IF NOT EXISTS fee_items_plan_idx ON public.fee_items (fee_plan_id);
CREATE INDEX IF NOT EXISTS document_requests_student_idx ON public.document_requests (student_id);
CREATE INDEX IF NOT EXISTS issued_documents_student_idx ON public.issued_documents (student_id);

-- Comunicação / notificações.
CREATE INDEX IF NOT EXISTS calendar_feed_tokens_user_idx ON public.calendar_feed_tokens (user_id);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS staff_module_grants_user_idx ON public.staff_module_grants (user_id);

-- Verificação: deve devolver ~46 linhas.
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE '%_idx'
ORDER BY indexname;
