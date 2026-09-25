-- Harden public.app_user_connections: strictly server-only, explicit deny-all for client roles.
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user_connections FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_user_connections FROM anon;
REVOKE ALL ON public.app_user_connections FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;

DROP POLICY IF EXISTS "No client access to connection credentials" ON public.app_user_connections;
CREATE POLICY "No client access to connection credentials"
  ON public.app_user_connections
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.app_user_connections IS
  'Server-only store of encrypted per-user connector keys. Deny-all for anon/authenticated by design: rows are read and written exclusively by server functions using the service role. Never expose connection_key_ciphertext to browser clients.';
COMMENT ON COLUMN public.app_user_connections.connection_key_ciphertext IS
  'AES-256-GCM ciphertext of the per-user connector key. Never returned to clients.';