-- Mobile V4: comandos do chat (enviar, apagar, marcar lida, iniciar conversa) com
-- idempotência por pedido e auditoria. Aprovada pelo dono a 10/10/2026; cópia na fila
-- oficial em supabase/migrations/20261010083336_mobile_v4_chat_commands.sql.
-- Correcção face à primeira proposta: audit_logs.entity_id/request_id são uuid na
-- produção (antes: ::text, que fazia falhar todos os comandos).
-- HTTP verifies live Auth, MFA aal2, exact school/role/module before this service-only RPC.
CREATE TABLE IF NOT EXISTS public.mobile_v4_chat_requests (
  school_id uuid NOT NULL, actor_user_id uuid NOT NULL, request_id uuid NOT NULL,
  payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(school_id,actor_user_id,request_id)
);
ALTER TABLE public.mobile_v4_chat_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_v4_chat_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobile_v4_chat_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON public.mobile_v4_chat_requests TO service_role;

CREATE OR REPLACE FUNCTION public.mobile_v4_chat_command(
  p_school_id uuid,p_actor_id uuid,p_role text,p_request_id uuid,p_command jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE
  membership_id uuid; peer_id uuid; conversation_id uuid; message_id uuid;
  command_type text := p_command->>'type'; conversation_type text; direct_key text;
  stored public.mobile_v4_chat_requests%ROWTYPE; result jsonb;
  actor_staff boolean; peer_staff boolean; message_time timestamptz;
BEGIN
  IF p_school_id IS NULL OR p_actor_id IS NULL OR p_request_id IS NULL OR p_role IS NULL OR p_role NOT IN ('professor','aluno')
    OR p_command IS NULL OR jsonb_typeof(p_command)<>'object' OR command_type IS NULL OR command_type NOT IN ('send','delete','read','start') THEN
    RAISE EXCEPTION 'CHAT_VALIDATION_FAILED';
  END IF;
  -- Serialize retries with the same identity/key. A failed transaction records no key or audit.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_school_id::text||':'||p_actor_id::text||':'||p_request_id::text,0));
  SELECT id INTO membership_id FROM public.school_memberships
    WHERE school_id=p_school_id AND user_id=p_actor_id AND status='active' FOR SHARE;
  IF membership_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.member_roles mr JOIN public.roles r ON r.id=mr.role_id
    WHERE mr.membership_id=membership_id AND lower(trim(r.code))=ANY(
      CASE WHEN p_role='professor' THEN ARRAY['teacher','professor'] ELSE ARRAY['student','aluno'] END)
  ) THEN RAISE EXCEPTION 'CHAT_FORBIDDEN'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.member_roles mr JOIN public.roles r ON r.id=mr.role_id
    WHERE mr.membership_id=membership_id AND lower(trim(r.code)) IN
    ('owner','admin','administrador','secretary','secretaria','treasury','tesouraria','finance','teacher','professor')) INTO actor_staff;

  SELECT * INTO stored FROM public.mobile_v4_chat_requests
    WHERE school_id=p_school_id AND actor_user_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF stored.payload<>jsonb_build_object('role',p_role,'command',p_command) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN stored.result;
  END IF;

  IF command_type='start' THEN
    IF (p_command - ARRAY['type','peerId'])<>'{}'::jsonb OR NOT(p_command?'peerId') THEN RAISE EXCEPTION 'CHAT_VALIDATION_FAILED'; END IF;
    peer_id := (p_command->>'peerId')::uuid;
    IF peer_id=p_actor_id THEN RAISE EXCEPTION 'CHAT_FORBIDDEN'; END IF;
    SELECT id INTO membership_id FROM public.school_memberships
      WHERE school_id=p_school_id AND user_id=peer_id AND status='active' FOR SHARE;
    IF membership_id IS NULL THEN RAISE EXCEPTION 'CHAT_FORBIDDEN'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.member_roles mr JOIN public.roles r ON r.id=mr.role_id
      WHERE mr.membership_id=membership_id AND lower(trim(r.code)) IN
      ('owner','admin','administrador','secretary','secretaria','treasury','tesouraria','finance','teacher','professor')) INTO peer_staff;
    IF NOT actor_staff AND NOT peer_staff THEN RAISE EXCEPTION 'CHAT_FORBIDDEN'; END IF;
    direct_key:=p_school_id::text||':'||least(p_actor_id,peer_id)::text||':'||greatest(p_actor_id,peer_id)::text;
    PERFORM pg_advisory_xact_lock(hashtextextended(direct_key,0));
    SELECT id INTO conversation_id FROM public.siga_chat_conversations WHERE school_id=p_school_id AND siga_chat_conversations.direct_key=direct_key;
    IF conversation_id IS NULL THEN
      conversation_id:=gen_random_uuid();
      INSERT INTO public.siga_chat_conversations(id,school_id,type,direct_key,created_by)
        VALUES(conversation_id,p_school_id,'direct',direct_key,p_actor_id);
    END IF;
    INSERT INTO public.siga_chat_members(conversation_id,user_id) VALUES(conversation_id,p_actor_id),(conversation_id,peer_id)
      ON CONFLICT DO NOTHING;
  ELSE
    conversation_id:=(p_command->>'conversationId')::uuid;
    SELECT type INTO conversation_type FROM public.siga_chat_conversations
      WHERE id=conversation_id AND school_id=p_school_id FOR SHARE;
    IF conversation_type IS NULL OR NOT EXISTS(SELECT 1 FROM public.siga_chat_members m
      WHERE m.conversation_id=conversation_id AND m.user_id=p_actor_id) THEN RAISE EXCEPTION 'CHAT_FORBIDDEN'; END IF;
    IF command_type='send' THEN
      IF (p_command - ARRAY['type','conversationId','body','replyTo'])<>'{}'::jsonb
        OR jsonb_typeof(p_command->'body')<>'string' OR length(trim(p_command->>'body')) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'CHAT_VALIDATION_FAILED'; END IF;
      IF conversation_type='direct' THEN
        IF (SELECT count(*) FROM public.siga_chat_members m WHERE m.conversation_id=conversation_id AND m.user_id<>p_actor_id)<>1 THEN RAISE EXCEPTION 'CHAT_FORBIDDEN'; END IF;
        SELECT m.user_id INTO peer_id FROM public.siga_chat_members m WHERE m.conversation_id=conversation_id AND m.user_id<>p_actor_id;
        PERFORM 1 FROM public.school_memberships WHERE school_id=p_school_id AND user_id=peer_id AND status='active' FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_FORBIDDEN'; END IF;
      END IF;
      IF p_command->>'replyTo' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.siga_chat_messages m
        WHERE m.id=(p_command->>'replyTo')::uuid AND m.school_id=p_school_id AND m.conversation_id=conversation_id AND m.deleted_at IS NULL) THEN RAISE EXCEPTION 'CHAT_FORBIDDEN'; END IF;
      message_id:=gen_random_uuid();
      INSERT INTO public.siga_chat_messages(id,school_id,conversation_id,sender_id,body,reply_to)
        VALUES(message_id,p_school_id,conversation_id,p_actor_id,trim(p_command->>'body'),(p_command->>'replyTo')::uuid);
      -- Sending must not mark messages the client has never displayed as read.
    ELSIF command_type='delete' THEN
      IF (p_command - ARRAY['type','conversationId','messageId'])<>'{}'::jsonb OR NOT(p_command?'messageId') THEN RAISE EXCEPTION 'CHAT_VALIDATION_FAILED'; END IF;
      message_id:=(p_command->>'messageId')::uuid;
      UPDATE public.siga_chat_messages m SET deleted_at=coalesce(m.deleted_at,now()),body='',attachment_file_id=NULL,attachment_file_name=NULL
        WHERE m.id=message_id AND m.school_id=p_school_id AND m.conversation_id=conversation_id AND m.sender_id=p_actor_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'CHAT_FORBIDDEN'; END IF;
    ELSE
      IF (p_command - ARRAY['type','conversationId','messageId'])<>'{}'::jsonb OR NOT(p_command?'messageId') THEN RAISE EXCEPTION 'CHAT_VALIDATION_FAILED'; END IF;
      message_id:=(p_command->>'messageId')::uuid;
      SELECT m.created_at INTO message_time FROM public.siga_chat_messages m WHERE m.id=message_id AND m.school_id=p_school_id AND m.conversation_id=conversation_id;
      IF message_time IS NULL THEN RAISE EXCEPTION 'CHAT_FORBIDDEN'; END IF;
      UPDATE public.siga_chat_members m SET last_read_at=greatest(m.last_read_at,message_time)
        WHERE m.conversation_id=conversation_id AND m.user_id=p_actor_id;
    END IF;
  END IF;
  result:=jsonb_build_object('type',command_type,'conversationId',conversation_id,'messageId',message_id);
  INSERT INTO public.audit_logs(school_id,actor_user_id,action,entity_type,entity_id,request_id,metadata)
    VALUES(p_school_id,p_actor_id,'mobile_v4.chat.'||command_type,'siga_chat_conversation',conversation_id,p_request_id,
      jsonb_build_object('messageId',message_id));
  INSERT INTO public.mobile_v4_chat_requests(school_id,actor_user_id,request_id,payload,result)
    VALUES(p_school_id,p_actor_id,p_request_id,jsonb_build_object('role',p_role,'command',p_command),result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.mobile_v4_chat_command(uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_v4_chat_command(uuid,uuid,text,uuid,jsonb) TO service_role;

-- Read-only capability: no command probe, no writes and no optimistic frontend activation.
CREATE OR REPLACE FUNCTION public.mobile_v4_chat_capabilities()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT '{"writes":true}'::jsonb; $$;
REVOKE ALL ON FUNCTION public.mobile_v4_chat_capabilities() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_v4_chat_capabilities() TO service_role;
