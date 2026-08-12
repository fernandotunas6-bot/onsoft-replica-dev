import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { accessModules } from "@/features/auth/access-policy";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";

export const setStaffModuleGrantInputSchema = z.object({
  userId: z.string().uuid(),
  moduleKey: z.enum(accessModules.map((item) => item.key) as [string, ...string[]]),
  level: z.enum(["Nenhum", "Leitura", "Escrita", "Total"]),
});

export const listStaffModuleGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("staff_module_grants")
      .select("user_id, module_key, level")
      .eq("school_id", membership.schoolId);
    if (error) return [] as Array<{ user_id: string; module_key: string; level: string }>;
    return (data ?? []) as Array<{ user_id: string; module_key: string; level: string }>;
  });

export const setStaffModuleGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setStaffModuleGrantInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, [
      "Administrador",
    ]);
    const db = await loadSgaAdminClient();
    const { error } = await db.from("staff_module_grants").upsert(
      {
        school_id: membership.schoolId,
        user_id: data.userId,
        module_key: data.moduleKey,
        level: data.level,
        updated_by: context.userId,
        created_by: context.userId,
      },
      { onConflict: "school_id,user_id,module_key" },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível guardar a permissão.");
    return { ok: true };
  });
