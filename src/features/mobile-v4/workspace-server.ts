import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mobileScopeSchema } from "./schemas";
import { loadMobileV4Workspace } from "./operations-core.server";

export const getMobileV4Workspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mobileScopeSchema.parse(input))
  .handler(async ({ context, data }) => {
    if (!context?.userId) throw new Error("Unauthorized");
    return loadMobileV4Workspace(context.userId, data);
  });
