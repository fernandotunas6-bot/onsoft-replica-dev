-- CAPTURADA da produção (supabase_migrations.schema_migrations, versão 20261002062506).
-- Aplicada a 2026-10-02 06:25 UTC fora do repositório; trazida para cá a 2026-10-02
-- (auditoria 11, O4). Corpo sem alterações, confirmado por md5 contra o registo.
-- @@corpo-capturado@@
REVOKE ALL ON public.siga_chat_conversations FROM anon, PUBLIC;
REVOKE ALL ON public.siga_chat_members FROM anon, PUBLIC;
REVOKE ALL ON public.siga_chat_messages FROM anon, PUBLIC;
