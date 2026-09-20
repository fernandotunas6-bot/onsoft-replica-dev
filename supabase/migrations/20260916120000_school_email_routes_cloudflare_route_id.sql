-- `school_email_routes` guarda a rota de encaminhamento de e-mail institucional de cada
-- escola, mas não guardava o identificador que a Cloudflare devolve ao criá-la.
--
-- Sem essa coluna, o caminho de remoção (`DELETE /api/saas/email/routes`) não tem por onde
-- encontrar a linha: filtra por `cloudflare_route_id`, que não existe. E o caminho de
-- criação escrevia `tenant_id`, `institutional_address`, `forward_to`,
-- `cloudflare_route_id` e `active` — cinco nomes que a tabela nunca teve —, pelo que o
-- PostgREST recusava o upsert inteiro. O `catch` à volta só registava no log: a rota era
-- criada na Cloudflare e nunca ficava registada na base.
--
-- Aditiva e idempotente. Depois de aplicar: `npm run siga:db-snapshot` para o retrato, que
-- é contra quem os testes medem.

ALTER TABLE public.school_email_routes
  ADD COLUMN IF NOT EXISTS cloudflare_route_id text;

COMMENT ON COLUMN public.school_email_routes.cloudflare_route_id IS
  'Identificador da rota na Cloudflare Email Routing; null quando a rota é simulada (sem credenciais configuradas).';

-- A remoção procura a linha por este identificador.
CREATE INDEX IF NOT EXISTS idx_school_email_routes_cloudflare_route_id
  ON public.school_email_routes (cloudflare_route_id)
  WHERE cloudflare_route_id IS NOT NULL;
