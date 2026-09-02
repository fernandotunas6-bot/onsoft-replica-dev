-- FASE 11: Activar Supabase Realtime para comunicados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'school_announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_announcements;
  END IF;
END $$;
