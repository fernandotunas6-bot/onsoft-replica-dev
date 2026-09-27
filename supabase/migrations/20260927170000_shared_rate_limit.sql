-- Limite de tentativas partilhado entre todas as instâncias do servidor.
--
-- O limitador de `src/lib/rate-limit.ts` vive na memória de cada instância do
-- worker: com várias instâncias, quem tente adivinhar senhas espalha os pedidos
-- e foge ao limite. Este contador fica na base e é o mesmo para todas.
--
-- As chaves chegam já cifradas (SHA-256) do servidor: a tabela nunca guarda IPs
-- nem identificadores em claro. Só a chave de serviço executa a função; a
-- tabela não tem acesso de cliente. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS public.siga_rate_limit_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_hash text NOT NULL CHECK (char_length(key_hash) = 64),
  hit_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siga_rate_limit_hits_key_idx
  ON public.siga_rate_limit_hits (key_hash, hit_at DESC);
CREATE INDEX IF NOT EXISTS siga_rate_limit_hits_hit_at_idx
  ON public.siga_rate_limit_hits (hit_at);

ALTER TABLE public.siga_rate_limit_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_rate_limit_hits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_rate_limit_hits FROM PUBLIC, anon, authenticated;

-- Verifica e regista numa só operação: devolve false (sem registar) se alguma
-- das chaves já atingiu o máximo na janela; senão regista uma tentativa em cada.
CREATE OR REPLACE FUNCTION public.siga_rate_limit_consume(
  key_hashes text[],
  window_seconds integer,
  max_hits integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  key_hash_value text;
  since timestamptz := now() - make_interval(secs => greatest(window_seconds, 1));
  hits integer;
begin
  if key_hashes is null or cardinality(key_hashes) = 0 or max_hits < 1 then
    return true;
  end if;

  -- Ordem fixa dos bloqueios: dois pedidos com as mesmas chaves nunca se cruzam.
  foreach key_hash_value in array (select array_agg(k order by k) from unnest(key_hashes) k) loop
    perform pg_advisory_xact_lock(hashtext('siga_rate_limit:' || key_hash_value));
  end loop;

  foreach key_hash_value in array key_hashes loop
    select count(*) into hits
    from public.siga_rate_limit_hits
    where key_hash = key_hash_value and hit_at > since;
    if hits >= max_hits then
      return false;
    end if;
  end loop;

  insert into public.siga_rate_limit_hits (key_hash)
  select distinct k from unnest(key_hashes) k;

  -- Limpeza ocasional do que já não conta para nenhuma janela.
  if random() < 0.02 then
    delete from public.siga_rate_limit_hits where hit_at < now() - interval '2 days';
  end if;
  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.siga_rate_limit_consume(text[], integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.siga_rate_limit_consume(text[], integer, integer)
  TO service_role;
