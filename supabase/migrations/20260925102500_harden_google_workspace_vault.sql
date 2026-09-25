-- Align the live Google Workspace credential vault with server assumptions.
-- The tables are service-role only and contained no connection/state rows when
-- this hardening was introduced, so making these identity fields mandatory is safe.

ALTER TABLE public.google_workspace_oauth_states
  ALTER COLUMN session_id SET NOT NULL;

ALTER TABLE public.google_workspace_connections
  ALTER COLUMN google_sub SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.google_workspace_connections'::regclass
      AND conname = 'google_workspace_connections_google_sub_nonempty'
  ) THEN
    ALTER TABLE public.google_workspace_connections
      ADD CONSTRAINT google_workspace_connections_google_sub_nonempty
      CHECK (length(btrim(google_sub)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.google_workspace_connections'::regclass
      AND conname = 'google_workspace_connections_scope_limit'
  ) THEN
    ALTER TABLE public.google_workspace_connections
      ADD CONSTRAINT google_workspace_connections_scope_limit
      CHECK (cardinality(granted_scopes) BETWEEN 1 AND 24);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.google_workspace_oauth_states'::regclass
      AND conname = 'google_workspace_oauth_states_session_nonempty'
  ) THEN
    ALTER TABLE public.google_workspace_oauth_states
      ADD CONSTRAINT google_workspace_oauth_states_session_nonempty
      CHECK (length(btrim(session_id)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.google_workspace_oauth_states'::regclass
      AND conname = 'google_workspace_oauth_states_services_limit'
  ) THEN
    ALTER TABLE public.google_workspace_oauth_states
      ADD CONSTRAINT google_workspace_oauth_states_services_limit
      CHECK (cardinality(requested_services) BETWEEN 1 AND 7);
  END IF;
END $$;
