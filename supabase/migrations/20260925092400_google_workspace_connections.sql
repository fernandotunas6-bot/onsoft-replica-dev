-- Google Workspace is NOT Supabase Auth. Only the trusted server accesses
-- this credential vault through the service-role client.
-- Apply after setting GOOGLE_WORKSPACE_CLIENT_ID, _CLIENT_SECRET,
-- _REDIRECT_URI and GOOGLE_WORKSPACE_ENCRYPTION_KEY on the SERVER.
CREATE TABLE IF NOT EXISTS public.google_workspace_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  google_sub text,
  account_email text,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  encrypted_refresh_token text NOT NULL,
  encrypted_access_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_workspace_connections_user_school_unique UNIQUE (user_id, school_id),
  CONSTRAINT google_workspace_connections_google_sub_nonempty CHECK (length(google_sub) > 0),
  CONSTRAINT google_workspace_connections_scope_limit CHECK (cardinality(granted_scopes) <= 24)
);
CREATE TABLE IF NOT EXISTS public.google_workspace_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  encrypted_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  consumed_at timestamptz,
  requested_services text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_workspace_oauth_states_services_limit
    CHECK (cardinality(requested_services) BETWEEN 1 AND 7)
);
CREATE INDEX IF NOT EXISTS google_workspace_oauth_states_expiry_idx
  ON public.google_workspace_oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS google_workspace_connections_school_idx
  ON public.google_workspace_connections(school_id);

ALTER TABLE public.google_workspace_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_workspace_oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies for public, anon or authenticated: only server/service role.
REVOKE ALL ON TABLE public.google_workspace_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.google_workspace_oauth_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.google_workspace_connections TO service_role;
GRANT ALL ON TABLE public.google_workspace_oauth_states TO service_role;

COMMENT ON TABLE public.google_workspace_connections IS
  'Encrypted per-user, per-school Google OAuth grants. Access exclusively via trusted server.';
COMMENT ON TABLE public.google_workspace_oauth_states IS
  'Single-use, server-issued Google Workspace OAuth PKCE transactions.';

-- Compatible with the already provisioned server-only vault (idempotent).
ALTER TABLE public.google_workspace_oauth_states ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE public.google_workspace_connections ADD COLUMN IF NOT EXISTS google_sub text;
