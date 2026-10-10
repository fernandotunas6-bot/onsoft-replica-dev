import { supabase } from "@/integrations/supabase/client";
import { institutionalGateway } from "../../../mobile-v4/src/services/bootstrap";
import { supabaseSessionTransport } from "../../../mobile-v4/src/services/supabase-session";

/** Browser host integration. Reuses SIGA's existing session/storage/MFA client.
 * Calling this factory is explicit: no route or public preview is activated. */
export function createSigaMobileV4Gateway() {
  return institutionalGateway("institutional", supabaseSessionTransport(supabase))!;
}
