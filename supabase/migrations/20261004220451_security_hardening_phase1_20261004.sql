-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261004220451).
-- Aplicada a 2026-10-04 fora do repositório (conta do dono). Trazida para cá no mesmo dia.
-- Corpo sem alterações, md5 confirmado. Correcções vão numa migração nova.
-- @@corpo-capturado@@
-- 1) Candidaturas públicas: corrigir tautologia e restringir colunas do anon
ALTER POLICY "Public insert open enrollment applications"
  ON public.enrollment_applications
  WITH CHECK (
    status = 'pending'
    AND decided_at IS NULL AND decided_by IS NULL
    AND student_id IS NULL AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.enrollment_forms forms
      WHERE forms.id = enrollment_applications.form_id
        AND forms.school_id = enrollment_applications.school_id
        AND forms.is_open = true
        AND forms.deleted_at IS NULL
    )
  );

REVOKE INSERT ON public.enrollment_applications FROM anon;
GRANT INSERT (school_id, form_id, full_name, payload, status)
  ON public.enrollment_applications TO anon;

ALTER TABLE public.enrollment_applications
  ADD CONSTRAINT enrollment_applications_payload_size_chk
    CHECK (pg_column_size(payload) <= 65536) NOT VALID,
  ADD CONSTRAINT enrollment_applications_full_name_len_chk
    CHECK (char_length(full_name) BETWEEN 2 AND 200) NOT VALID;
ALTER TABLE public.enrollment_applications VALIDATE CONSTRAINT enrollment_applications_payload_size_chk;
ALTER TABLE public.enrollment_applications VALIDATE CONSTRAINT enrollment_applications_full_name_len_chk;

-- 2) Nome honesto para a política pública de branding
ALTER POLICY school_members_view_branding ON public.school_branding
  RENAME TO public_read_school_branding;

-- 3) Tabelas sem políticas: tornar explícito que são só de servidor
REVOKE ALL ON
  public.alumni_communication_preferences, public.alumni_contributions,
  public.alumni_education_stages, public.alumni_engagements,
  public.alumni_event_registrations, public.alumni_events,
  public.alumni_experiences, public.alumni_mentorships,
  public.alumni_opportunities, public.alumni_opportunity_applications,
  public.alumni_portfolio_items, public.alumni_privacy_audit,
  public.alumni_profiles, public.alumni_survey_responses, public.alumni_surveys,
  public.import_templates, public.siga_attendance_audits,
  public.siga_cash_expenses, public.siga_file_events, public.slug_reservations
FROM anon, authenticated;

-- 4) Limites nos buckets de storage
UPDATE storage.buckets SET file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
  WHERE id = 'school-logos';
UPDATE storage.buckets SET file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp']
  WHERE id = 'avatars';
UPDATE storage.buckets SET file_size_limit = 52428800
  WHERE id = 'siga-files';
