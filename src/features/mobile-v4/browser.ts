import { supabase } from "@/integrations/supabase/client";
import { institutionalGateway } from "../../../mobile-v4/src/services/bootstrap";
import { supabaseSessionTransport } from "../../../mobile-v4/src/services/supabase-session";

/** Browser host integration. Reuses SIGA's existing session/storage/MFA client.
 * Calling this factory is explicit: no route or public preview is activated. */
export function createSigaMobileV4Gateway() {
  const transport = supabaseSessionTransport(supabase);
  transport.subscribeChatChanged = (ctx, listener) => {
    // Register every callback before subscribe. Payloads are only invalidation
    // signals; the authenticated HTTP API rechecks membership and projects data.
    let live = true;
    const channel = supabase
      .channel(`mobile-v4-chat:${ctx.userId}:${ctx.schoolId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "siga_chat_messages",
          filter: `school_id=eq.${ctx.schoolId}`,
        },
        () => {
          if (live) listener();
        },
      );
    channel.subscribe();
    return () => {
      live = false;
      void supabase.removeChannel(channel).catch(() => {});
    };
  };
  return institutionalGateway("institutional", transport)!;
}
