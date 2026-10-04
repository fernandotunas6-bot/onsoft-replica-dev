-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261002051817).
-- Reaplicação de 20260927120000_reclose_physical_access_secrets.sql, feita a 2026-10-02
-- 05:18 UTC fora do repositório porque as políticas tinham voltado a aparecer.
-- Trazida para cá a 2026-10-02 (auditoria 11, O4). Corpo sem alterações, md5 confirmado.
-- @@corpo-capturado@@
DROP POLICY IF EXISTS "Members read siga_access_cards" ON public.siga_access_cards;
DROP POLICY IF EXISTS "Access cards in own school" ON public.siga_access_cards;

DROP POLICY IF EXISTS "Members read siga_turnstile_devices" ON public.siga_turnstile_devices;
DROP POLICY IF EXISTS "Turnstile devices in own school" ON public.siga_turnstile_devices;

ALTER TABLE public.siga_access_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_access_cards FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_access_cards FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_access_cards TO service_role;

ALTER TABLE public.siga_turnstile_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siga_turnstile_devices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siga_turnstile_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.siga_turnstile_devices TO service_role;
