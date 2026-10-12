import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadMobileV4Session } from "./session-core.server";

export { mapMobileMemberships } from "./session-core.server";

export const getMobileV4Session = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context?.userId) throw new Error("Unauthorized");
    return loadMobileV4Session(context.userId);
  });
