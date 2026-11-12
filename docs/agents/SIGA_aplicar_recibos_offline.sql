-- SIGA · Recibos da sincronização offline · aplicar (escreve na base)
--
-- ESTADO: POR APLICAR. Migração 20261025130000_offline_sync_receipts.sql (PR #324), tal e
-- qual o ficheiro do ramo. Uma transacção: se falhar, nada fica aplicado.
--
-- Abrir no SQL Editor do Supabase (projecto xodgfmxiaunpamctfeea), colar tudo e correr.
-- No fim, a consulta de confirmação deve dar: tabela, rls true, as quatro permissões de
-- browser false, servico true, historico 1.
-- Aplicar ANTES de fundir o #324.

BEGIN;

DO $guard$
begin
  if to_regclass('public.offline_sync_receipts') is not null then
    raise exception 'A 20261025130000 (recibos offline) já está aplicada.';
  end if;
end
$guard$;

-- Recibos idempotentes da sincronização offline (SIGA Desktop).
--
-- A fila da app desktop guarda o lançamento no cofre antes do HTTP e, se a resposta
-- se perde, marca-o «por verificar»: o servidor podia ter gravado ou não, e reenviar
-- às cegas era arriscado (a chamada recusava-se por já estar fechada; as notas
-- reescreviam correcções feitas entretanto). Ver docs/desktop/OFFLINE_SYNC_CONTRACT.md.
--
-- Cada envio passa a levar um op_id. O servidor regista o recibo antes de gravar e
-- fecha-o com o resultado depois:
--   * o mesmo op_id com os mesmos dados devolve o resultado guardado, sem regravar;
--   * o mesmo op_id com outros dados, outra conta ou outro tipo é recusado;
--   * um recibo aberto há pouco é um envio em curso (o segundo espera);
--   * um recibo aberto há muito é um envio que caiu a meio: o servidor verifica se
--     os dados já estão gravados antes de repetir (gravar de novo é idempotente).
-- Uma recusa (período fechado, aluno fora da turma…) apaga o recibo aberto: a
-- mutação não ficou feita e o professor pode corrigir e reenviar.
--
-- Só o servidor (service_role) lê e escreve. Sem migração aplicada, o servidor grava
-- como antes, sem recibo.

CREATE TABLE public.offline_sync_receipts (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  op_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  -- Posto de origem, quando a app o souber; só informativo.
  device_id text CHECK (device_id IS NULL OR length(device_id) BETWEEN 1 AND 128),
  kind text NOT NULL CHECK (kind IN ('attendance.submit', 'grades.term')),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'done')),
  result jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (school_id, op_id),
  CONSTRAINT offline_sync_receipts_done_complete CHECK (
    status = 'started' OR (result IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX offline_sync_receipts_open
  ON public.offline_sync_receipts (started_at) WHERE status = 'started';

ALTER TABLE public.offline_sync_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offline_sync_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.offline_sync_receipts TO service_role;

-- Abrir (ou reencontrar) o recibo. Devolve o que o servidor deve fazer:
--   claimed     recibo novo: gravar;
--   done        já gravado: devolver `result`;
--   in_progress outro pedido com o mesmo op_id está a gravar agora;
--   stale       recibo aberto há mais de p_stale_seconds: verificar e repetir;
--   mismatch    o op_id já foi usado com outros dados, conta ou tipo.
CREATE FUNCTION private.offline_receipt_claim(
  p_school_id uuid, p_op_id uuid, p_actor_id uuid, p_device_id text,
  p_kind text, p_payload_hash text, p_stale_seconds integer DEFAULT 120
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.offline_sync_receipts%rowtype;
begin
  insert into public.offline_sync_receipts (school_id, op_id, actor_id, device_id, kind, payload_hash)
  values (p_school_id, p_op_id, p_actor_id, nullif(btrim(coalesce(p_device_id, '')), ''), p_kind, p_payload_hash)
  on conflict (school_id, op_id) do nothing;
  if found then
    return jsonb_build_object('outcome', 'claimed');
  end if;

  select * into v_row from public.offline_sync_receipts
  where school_id = p_school_id and op_id = p_op_id
  for update;
  if v_row.actor_id <> p_actor_id or v_row.kind <> p_kind or v_row.payload_hash <> p_payload_hash then
    return jsonb_build_object('outcome', 'mismatch');
  end if;
  if v_row.status = 'done' then
    return jsonb_build_object('outcome', 'done', 'result', v_row.result);
  end if;
  if v_row.started_at > now() - make_interval(secs => greatest(p_stale_seconds, 1)) then
    return jsonb_build_object('outcome', 'in_progress');
  end if;
  -- Retomado por este pedido: quem chegar a seguir vê-o em curso.
  update public.offline_sync_receipts set started_at = now()
  where school_id = p_school_id and op_id = p_op_id;
  return jsonb_build_object('outcome', 'stale');
end;
$function$;

CREATE FUNCTION private.offline_receipt_complete(p_school_id uuid, p_op_id uuid, p_result jsonb)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with done as (
    update public.offline_sync_receipts
    set status = 'done', result = coalesce(p_result, '{}'::jsonb), completed_at = now()
    where school_id = p_school_id and op_id = p_op_id and status = 'started'
    returning 1
  )
  select exists (select 1 from done);
$function$;

-- Recusa da regra de negócio: a mutação não ficou feita; liberta o op_id.
CREATE FUNCTION private.offline_receipt_release(p_school_id uuid, p_op_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with gone as (
    delete from public.offline_sync_receipts
    where school_id = p_school_id and op_id = p_op_id and status = 'started'
    returning 1
  )
  select exists (select 1 from gone);
$function$;

CREATE FUNCTION public.offline_receipt_claim(
  school_id uuid, op_id uuid, actor_id uuid, device_id text,
  kind text, payload_hash text, stale_seconds integer DEFAULT 120
)
 RETURNS jsonb LANGUAGE sql SET search_path TO ''
AS $function$ select private.offline_receipt_claim(school_id, op_id, actor_id, device_id, kind, payload_hash, stale_seconds); $function$;

CREATE FUNCTION public.offline_receipt_complete(school_id uuid, op_id uuid, result jsonb)
 RETURNS boolean LANGUAGE sql SET search_path TO ''
AS $function$ select private.offline_receipt_complete(school_id, op_id, result); $function$;

CREATE FUNCTION public.offline_receipt_release(school_id uuid, op_id uuid)
 RETURNS boolean LANGUAGE sql SET search_path TO ''
AS $function$ select private.offline_receipt_release(school_id, op_id); $function$;

-- Só o servidor: as funções nascem com EXECUTE para PUBLIC.
REVOKE ALL ON FUNCTION private.offline_receipt_claim(uuid, uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.offline_receipt_complete(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.offline_receipt_release(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.offline_receipt_claim(uuid, uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.offline_receipt_complete(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.offline_receipt_release(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.offline_receipt_claim(uuid, uuid, uuid, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION private.offline_receipt_complete(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION private.offline_receipt_release(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.offline_receipt_claim(uuid, uuid, uuid, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.offline_receipt_complete(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.offline_receipt_release(uuid, uuid) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES
  ('20261025130000', 'offline_sync_receipts', ARRAY['-- ver supabase/migrations/20261025130000_offline_sync_receipts.sql'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Confirmação
select to_regclass('public.offline_sync_receipts') as tabela,
  (select relrowsecurity from pg_class where oid = 'public.offline_sync_receipts'::regclass) as rls,
  has_table_privilege('authenticated', 'public.offline_sync_receipts', 'SELECT') as auth_le,
  has_table_privilege('anon', 'public.offline_sync_receipts', 'SELECT') as anon_le,
  has_function_privilege('authenticated', 'public.offline_receipt_claim(uuid,uuid,uuid,text,text,text,integer)', 'EXECUTE') as auth_executa,
  has_function_privilege('anon', 'public.offline_receipt_claim(uuid,uuid,uuid,text,text,text,integer)', 'EXECUTE') as anon_executa,
  has_function_privilege('service_role', 'public.offline_receipt_claim(uuid,uuid,uuid,text,text,text,integer)', 'EXECUTE') as servico,
  (select count(*) from supabase_migrations.schema_migrations where version = '20261025130000') as historico;
