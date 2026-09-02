-- FASE 11: Activar Supabase Realtime para mensagens diretas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'siga_direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.siga_direct_messages;
  END IF;
END $$;
