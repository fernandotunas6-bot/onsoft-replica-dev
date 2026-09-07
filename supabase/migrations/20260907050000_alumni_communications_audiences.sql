-- SIGA / Onsoft — integração Alumni no motor central de comunicados
-- Preserva os públicos existentes e acrescenta finalidades Alumni.

DO $$
DECLARE
  constraint_record record;
BEGIN
  IF to_regclass('public.school_announcements') IS NULL THEN
    RAISE NOTICE 'school_announcements não existe neste ambiente; extensão Alumni ignorada.';
    RETURN;
  END IF;

  -- Remove apenas CHECK constraints que governam a coluna audience.
  FOR constraint_record IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'school_announcements'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%audience%'
  LOOP
    EXECUTE format('ALTER TABLE public.school_announcements DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;

  ALTER TABLE public.school_announcements
    ADD CONSTRAINT school_announcements_audience_check
    CHECK (audience IN (
      'all_guardians',
      'guardians_with_debt',
      'students_secondary',
      'students_finalists',
      'teaching_staff',
      'alumni_all',
      'alumni_opportunities',
      'alumni_events',
      'alumni_mentoring',
      'alumni_surveys',
      'alumni_fundraising'
    ));
END;
$$;

comment on constraint school_announcements_audience_check on public.school_announcements is
  'Públicos SIGA, incluindo segmentos Alumni que são resolvidos com consentimento e preferências.';
