import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { updateCurrentProfileInputSchema } from "./schemas";

export const getCurrentAccountContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    const db = await loadSgaAdminClient();

    let profileRow: {
      full_name: string | null;
      avatar_url: string | null;
      phone: string | null;
      updated_at: string | null;
    } | null = null;
    try {
      const { data } = await db
        .from("profiles")
        .select("full_name, avatar_url, phone, updated_at")
        .eq("id", context.userId)
        .maybeSingle();
      profileRow = data;
    } catch {
      try {
        const { data } = await db
          .from("profiles")
          .select("full_name, avatar_url, updated_at")
          .eq("id", context.userId)
          .maybeSingle();
        profileRow = data ? { ...data, phone: null } : null;
      } catch {
        profileRow = null;
      }
    }

    let metaName = "";
    let metaPhone = "";
    let emailName = "";
    try {
      const { data } = await db.auth.admin.getUserById(context.userId);
      const authUser = data.user;
      metaName =
        typeof authUser?.user_metadata?.["full_name"] === "string"
          ? String(authUser.user_metadata["full_name"]).trim()
          : "";
      metaPhone =
        typeof authUser?.user_metadata?.["phone_primary"] === "string"
          ? String(authUser.user_metadata["phone_primary"]).trim()
          : "";
      emailName = authUser?.email?.split("@")[0]?.replace(/[._]+/g, " ").trim() ?? "";
    } catch {
      const claimsEmail = typeof context.claims?.email === "string" ? context.claims.email : "";
      emailName = claimsEmail.split("@")[0]?.replace(/[._]+/g, " ").trim() ?? "";
    }

    let fullName = String(profileRow?.full_name ?? "").trim();
    if (!fullName && (metaName || emailName)) {
      fullName = metaName || emailName.replace(/\b\w/g, (char) => char.toUpperCase());
      try {
        if (profileRow) {
          await db
            .from("profiles")
            .update({ full_name: fullName, updated_at: new Date().toISOString() })
            .eq("id", context.userId);
        } else if (membership?.schoolId) {
          await db.from("profiles").upsert({
            id: context.userId,
            school_id: membership.schoolId,
            full_name: fullName,
            updated_at: new Date().toISOString(),
          });
        }
      } catch {
        // Nome display-only: falha de escrita não deve bloquear o acesso.
      }
    }

    const grants: Record<string, string> = {};
    if (membership?.schoolId) {
      try {
        const { data: grantRows } = await db
          .from("staff_module_grants")
          .select("module_key, level")
          .eq("school_id", membership.schoolId)
          .eq("user_id", context.userId);
        for (const row of grantRows ?? []) {
          grants[String(row.module_key)] = String(row.level);
        }
      } catch {
        // Tabela ainda não aplicada neste ambiente.
      }
    }

    return {
      full_name: fullName || null,
      avatar_url: profileRow?.avatar_url ?? null,
      phone: profileRow?.phone?.trim() || metaPhone || null,
      updated_at: profileRow?.updated_at ?? null,
      school_id: membership?.schoolId ?? null,
      role_code: membership?.roleCode ?? null,
      role_name: membership?.roleName ?? null,
      cargo: membership?.appRole ?? ("Utilizador" as const),
      grants,
    };
  });

export const updateCurrentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateCurrentProfileInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await loadSgaAdminClient();
    const updatePayload: Record<string, unknown> = {
      full_name: data.fullName,
      updated_at: new Date().toISOString(),
    };
    if (data.phone !== undefined) {
      const { normalizeAngolaPhone } = await import("@/lib/angola-phone");
      updatePayload["phone"] = data.phone ? normalizeAngolaPhone(data.phone) || null : null;
    }

    let row: {
      full_name: string | null;
      avatar_url: string | null;
      phone: string | null;
      updated_at: string | null;
    } | null = null;

    try {
      const { data: updated, error } = await db
        .from("profiles")
        .update(updatePayload)
        .eq("id", context.userId)
        .eq("updated_at", data.expectedUpdatedAt)
        .select("full_name, avatar_url, phone, updated_at")
        .maybeSingle();
      if (error) throw error;
      row = updated;
    } catch (error) {
      const withoutPhone = { full_name: data.fullName, updated_at: new Date().toISOString() };
      const { data: updated, error: retryError } = await db
        .from("profiles")
        .update(withoutPhone)
        .eq("id", context.userId)
        .eq("updated_at", data.expectedUpdatedAt)
        .select("full_name, avatar_url, updated_at")
        .maybeSingle();
      if (retryError) {
        throw publicDatabaseError(retryError, "Não foi possível actualizar o perfil.");
      }
      row = updated ? { ...updated, phone: data.phone?.trim() || null } : null;
      if (error instanceof Error && /phone|column/i.test(error.message)) {
        // Coluna phone ainda não aplicada no SGA — continua com metadados Auth.
      } else if (error) {
        throw publicDatabaseError(
          error as { message: string },
          "Não foi possível actualizar o perfil.",
        );
      }
    }

    if (!row) {
      throw new Error(
        "O perfil foi alterado noutro dispositivo. Actualize a página e tente novamente.",
      );
    }

    if (data.phone !== undefined) {
      try {
        await db.auth.admin.updateUserById(context.userId, {
          user_metadata: { phone_primary: data.phone?.trim() || null },
        });
      } catch {
        // Metadados Auth opcionais.
      }
    }

    return row;
  });
