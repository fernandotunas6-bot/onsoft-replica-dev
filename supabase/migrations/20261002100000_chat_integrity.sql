-- Chat (20261002062355): integridade e saída da escola.
--
-- Revisão das migrações trazidas da produção (auditoria 11). Três lacunas:
--   1. O INSERT aceitava qualquer `school_id` e qualquer `attachment_file_id`: um membro
--      gravava uma mensagem marcada com outra escola, ou a apontar para um ficheiro de
--      outra escola (que depois aparecia como anexo na conversa).
--   2. `reply_to` podia apontar para uma mensagem de outra conversa.
--   3. `private.is_chat_member` só olhava para siga_chat_members: quem saía da escola
--      (vínculo suspenso ou revogado) continuava a ler e a escrever nas conversas.
--      A 2026-10-02 havia 1 membro nessa situação.
-- E `created_by` sem ON DELETE impedia apagar a conta de quem criou uma conversa.
--
-- Idempotente; não altera dados existentes (0 linhas com escola ou anexo trocados).
-- Regras: docs/agents/DATABASE_RULES.md.

-- 1 e 2: a base decide a escola da mensagem e recusa anexos/respostas de fora.
CREATE OR REPLACE FUNCTION private.siga_chat_message_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  conversation_school uuid;
  attachment_school uuid;
  reply_conversation uuid;
begin
  select c.school_id into conversation_school
  from public.siga_chat_conversations c
  where c.id = new.conversation_id;
  if conversation_school is null then
    raise exception using errcode = '23503', message = 'Conversa inexistente.';
  end if;

  if new.school_id is distinct from conversation_school then
    raise exception using errcode = '42501',
      message = 'A mensagem tem de pertencer à escola da conversa.';
  end if;

  if new.attachment_file_id is not null then
    select f.school_id into attachment_school
    from public.siga_files f
    where f.id = new.attachment_file_id;
    if attachment_school is distinct from conversation_school then
      raise exception using errcode = '42501',
        message = 'O anexo tem de ser um ficheiro da escola da conversa.';
    end if;
  end if;

  if new.reply_to is not null then
    select m.conversation_id into reply_conversation
    from public.siga_chat_messages m
    where m.id = new.reply_to;
    if reply_conversation is distinct from new.conversation_id then
      raise exception using errcode = '42501',
        message = 'Só pode responder a mensagens da mesma conversa.';
    end if;
  end if;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.siga_chat_message_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS siga_chat_messages_guard ON public.siga_chat_messages;
CREATE TRIGGER siga_chat_messages_guard
  BEFORE INSERT OR UPDATE OF conversation_id, school_id, attachment_file_id, reply_to
  ON public.siga_chat_messages
  FOR EACH ROW EXECUTE FUNCTION private.siga_chat_message_guard();

-- 3: membro da conversa E com vínculo activo à escola dela.
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
    JOIN public.siga_chat_conversations c ON c.id = m.conversation_id
    JOIN public.school_memberships sm
      ON sm.user_id = m.user_id
     AND sm.school_id = c.school_id
     AND sm.status = 'active'
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND m.conversation_id = p_conversation_id
      AND m.user_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION private.is_chat_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_chat_member(uuid) TO authenticated, service_role;

-- Apagar a conta de quem criou a conversa não pode ficar bloqueado por ela.
ALTER TABLE public.siga_chat_conversations
  DROP CONSTRAINT IF EXISTS siga_chat_conversations_created_by_fkey;
ALTER TABLE public.siga_chat_conversations
  ADD CONSTRAINT siga_chat_conversations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
