-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261002062355).
-- Aplicada a 2026-10-02 06:23 UTC fora do repositório; trazida para cá a 2026-10-02
-- (auditoria 11, O4). O corpo abaixo é o SQL que correu, sem alterações: confirmado por
-- md5 contra o registo. Correcções vão em migrações seguintes, nunca editando esta.
-- @@corpo-capturado@@
CREATE TABLE IF NOT EXISTS public.siga_chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  title text,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  direct_key text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS siga_chat_conversations_direct_key
  ON public.siga_chat_conversations (direct_key)
  WHERE direct_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS siga_chat_conversations_school_idx
  ON public.siga_chat_conversations (school_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.siga_chat_members (
  conversation_id uuid NOT NULL
    REFERENCES public.siga_chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS siga_chat_members_user_idx
  ON public.siga_chat_members (user_id);

CREATE TABLE IF NOT EXISTS public.siga_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.siga_chat_conversations(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  reply_to uuid REFERENCES public.siga_chat_messages(id) ON DELETE SET NULL,
  attachment_file_id uuid REFERENCES public.siga_files(id) ON DELETE SET NULL,
  attachment_file_name text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_chat_messages_conv_idx
  ON public.siga_chat_messages (conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.is_chat_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.siga_chat_members m
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND m.conversation_id = p_conversation_id
      AND m.user_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION private.is_chat_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_chat_member(uuid) TO authenticated, service_role;

ALTER TABLE public.siga_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_chat_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.siga_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_chat_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.siga_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_chat_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros lêem a conversa" ON public.siga_chat_conversations;
CREATE POLICY "Membros lêem a conversa"
  ON public.siga_chat_conversations
  FOR SELECT TO authenticated
  USING (private.is_chat_member(id));

DROP POLICY IF EXISTS "Membros vêem os participantes" ON public.siga_chat_members;
CREATE POLICY "Membros vêem os participantes"
  ON public.siga_chat_members
  FOR SELECT TO authenticated
  USING (private.is_chat_member(conversation_id));

DROP POLICY IF EXISTS "Marca a própria leitura" ON public.siga_chat_members;
CREATE POLICY "Marca a própria leitura"
  ON public.siga_chat_members
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Membros lêem as mensagens" ON public.siga_chat_messages;
CREATE POLICY "Membros lêem as mensagens"
  ON public.siga_chat_messages
  FOR SELECT TO authenticated
  USING (private.is_chat_member(conversation_id));

DROP POLICY IF EXISTS "Membros enviam mensagens" ON public.siga_chat_messages;
CREATE POLICY "Membros enviam mensagens"
  ON public.siga_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND private.is_chat_member(conversation_id)
  );

DROP POLICY IF EXISTS "Autor apaga a própria mensagem" ON public.siga_chat_messages;
CREATE POLICY "Autor apaga a própria mensagem"
  ON public.siga_chat_messages
  FOR UPDATE TO authenticated
  USING (sender_id = (SELECT auth.uid()))
  WITH CHECK (sender_id = (SELECT auth.uid()));

REVOKE ALL ON public.siga_chat_conversations FROM authenticated;
REVOKE ALL ON public.siga_chat_members FROM authenticated;
REVOKE ALL ON public.siga_chat_messages FROM authenticated;
GRANT SELECT ON public.siga_chat_conversations TO authenticated;
GRANT SELECT ON public.siga_chat_members TO authenticated;
GRANT UPDATE (last_read_at) ON public.siga_chat_members TO authenticated;
GRANT SELECT, INSERT ON public.siga_chat_messages TO authenticated;
GRANT UPDATE (body, deleted_at) ON public.siga_chat_messages TO authenticated;
GRANT ALL ON public.siga_chat_conversations TO service_role;
GRANT ALL ON public.siga_chat_members TO service_role;
GRANT ALL ON public.siga_chat_messages TO service_role;

DO $backfill$
DECLARE
  par record;
  cid uuid;
  chave text;
BEGIN
  IF to_regclass('public.siga_direct_messages') IS NULL THEN
    RAISE NOTICE 'public.siga_direct_messages não existe; backfill saltado.';
    RETURN;
  END IF;

  FOR par IN
    SELECT DISTINCT
      school_id,
      LEAST(sender_id, recipient_id)    AS a,
      GREATEST(sender_id, recipient_id) AS b
    FROM public.siga_direct_messages
    WHERE sender_id <> recipient_id
  LOOP
    chave := par.school_id::text || ':' || par.a::text || ':' || par.b::text;

    SELECT id INTO cid
      FROM public.siga_chat_conversations
     WHERE direct_key = chave;

    IF cid IS NULL THEN
      INSERT INTO public.siga_chat_conversations (school_id, type, direct_key, created_at)
      VALUES (
        par.school_id,
        'direct',
        chave,
        (SELECT min(created_at) FROM public.siga_direct_messages d
          WHERE d.school_id = par.school_id
            AND LEAST(d.sender_id, d.recipient_id) = par.a
            AND GREATEST(d.sender_id, d.recipient_id) = par.b)
      )
      RETURNING id INTO cid;
    END IF;

    INSERT INTO public.siga_chat_members (conversation_id, user_id, last_read_at)
    SELECT cid, u.uid, COALESCE(
      (SELECT max(d.created_at) FROM public.siga_direct_messages d
        WHERE d.school_id = par.school_id
          AND d.recipient_id = u.uid
          AND d.sender_id = CASE WHEN u.uid = par.a THEN par.b ELSE par.a END),
      now()
    )
    FROM (VALUES (par.a), (par.b)) AS u(uid)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    INSERT INTO public.siga_chat_messages
      (id, conversation_id, school_id, sender_id, body,
       attachment_file_id, attachment_file_name, created_at)
    SELECT d.id, cid, d.school_id, d.sender_id, COALESCE(d.body, ''),
           d.attachment_file_id, d.attachment_file_name, d.created_at
      FROM public.siga_direct_messages d
     WHERE d.school_id = par.school_id
       AND LEAST(d.sender_id, d.recipient_id) = par.a
       AND GREATEST(d.sender_id, d.recipient_id) = par.b
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END
$backfill$;

DO $realtime$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publicação supabase_realtime não existe; realtime saltado.';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['siga_chat_messages', 'siga_chat_members'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$realtime$;
