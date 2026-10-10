import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequest } from "@tanstack/react-start/server";
import { accessTokenAal } from "@/integrations/supabase/session-mfa";
import { mobileCommandRequestSchema } from "./schemas";
import { applyMobileV4Command } from "./operations-core.server";
import { MobileApiError } from "./errors";

export const executeMobileV4Command = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mobileCommandRequestSchema.parse(input))
  .handler(async ({ context, data }) => {
    if (!context?.userId) throw new Error("Unauthorized");
    const token = getRequest().headers.get("authorization")?.slice(7) ?? "";
    if (accessTokenAal(token) !== "aal2") throw new MobileApiError(403, "MFA_REQUIRED");
    return applyMobileV4Command(context.userId, data);
  });
