import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { institutionalGateway } from "./services/bootstrap";
import { supabaseSessionTransport, type SupabaseSessionClient } from "./services/supabase-session";

/** Mount only in an explicitly configured host serving the authenticated API
 * on the same origin. Pass its existing Supabase client, never a stored token. */
export function mountInstitutionalMobile(container: HTMLElement, client: SupabaseSessionClient) {
  const root = createRoot(container);
  const gateway = institutionalGateway("institutional", supabaseSessionTransport(client));
  root.render(
    <StrictMode>
      <App initialGateway={gateway} />
    </StrictMode>,
  );
  return () => root.unmount();
}
