-- Duas séries de recibos na mesma escola (docs/auditoria/06-auditoria.md, achado P1):
-- a tesouraria numera via private.next_document_number ("REC-0001", contador em
-- document_sequences com FOR UPDATE); o webhook do gateway de pagamento não tem
-- sessão de utilizador (server-to-server), logo não pode chamar essa função —
-- auth.uid() é sempre null nesse caminho — e caiu para um fallback próprio
-- ("REC-2026/0001", count(*) sobre LIKE), que nunca avança document_sequences nem
-- vê os números já usados pela tesouraria. Duas séries paralelas do mesmo tipo de
-- documento é problema de conformidade (há exportação SAF-T AO neste módulo).
--
-- Esta migração não muda private.next_document_number (continua a exigir sessão
-- para os caminhos que a têm). Acrescenta uma variante para uso exclusivo do
-- service_role, idêntica excepto na verificação de sessão — porque um webhook
-- validado por assinatura HMAC (ver gateway-webhook-handler.ts) já não tem
-- auth.uid() para verificar. GRANT restrito a service_role: nunca alcançável a
-- partir do browser, com ou sem sessão.

BEGIN;

CREATE OR REPLACE FUNCTION private.next_document_number_service(
  target_school_id uuid,
  target_document_type text,
  default_prefix text DEFAULT NULL::text
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  seq public.document_sequences%rowtype;
  issued text;
begin
  insert into public.document_sequences (school_id, document_type, prefix)
  values (
    target_school_id,
    target_document_type,
    coalesce(nullif(upper(btrim(default_prefix)), ''), upper(left(target_document_type, 3)))
  )
  on conflict (school_id, document_type) do nothing;

  select * into seq from public.document_sequences
  where school_id = target_school_id and document_type = target_document_type
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'Sequência documental indisponível.';
  end if;

  issued := seq.prefix || '-' || lpad(seq.next_number::text, seq.padding, '0');
  update public.document_sequences
  set next_number = next_number + 1, updated_at = now()
  where school_id = target_school_id and document_type = target_document_type;
  return issued;
end;
$function$;

REVOKE ALL ON FUNCTION private.next_document_number_service(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.next_document_number_service(uuid, text, text) TO service_role;

COMMENT ON FUNCTION private.next_document_number_service(uuid, text, text) IS
  'Variante de private.next_document_number sem exigência de sessão, para chamadores service_role (webhooks). Partilha document_sequences com a variante autenticada — mesma série, mesmo contador.';

-- RPC do PostgREST só alcança o schema public; wrapper fino, mesma restrição de GRANT.
CREATE OR REPLACE FUNCTION public.next_document_number_service(
  school_id uuid,
  document_type text,
  default_prefix text DEFAULT NULL::text
)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = pg_catalog, public
AS $$
  SELECT private.next_document_number_service(school_id, document_type, default_prefix);
$$;

REVOKE ALL ON FUNCTION public.next_document_number_service(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number_service(uuid, text, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
