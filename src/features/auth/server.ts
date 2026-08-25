import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import {
  setCurrentProfileAvatarInputSchema,
  signProfileAvatarInputSchema,
  updateCurrentProfileInputSchema,
} from "./schemas";

const AVATAR_REFERENCE_PREFIX = "siga-avatar://";
const AVATAR_STORAGE_PATH = /^[0-9a-f-]{36}\/avatar-[0-9]{13}\.(png|jpg|jpeg|webp)$/i;

function avatarStoragePathFromUrl(value: string) {
  if (value.startsWith(AVATAR_REFERENCE_PREFIX)) {
    const storagePath = value.slice(AVATAR_REFERENCE_PREFIX.length);
    return AVATAR_STORAGE_PATH.test(storagePath) ? storagePath : null;
  }
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/^\/storage\/v1\/object\/public\/avatars\/(.+)$/);
    const storagePath = match?.[1] ? decodeURIComponent(match[1]) : null;
    return storagePath && AVATAR_STORAGE_PATH.test(storagePath) ? storagePath : null;
  } catch {
    return null;
  }
}

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

export const setCurrentProfileAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setCurrentProfileAvatarInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.storagePath.startsWith(`${context.userId}/`)) {
      throw new Error("O avatar deve pertencer à sua conta.");
    }
    const db = await loadSgaAdminClient();
    const avatarUrl = `${AVATAR_REFERENCE_PREFIX}${data.storagePath}`;
    const { data: previous, error: previousError } = await db
      .from("profiles")
      .select("avatar_url")
      .eq("id", context.userId)
      .maybeSingle();
    if (previousError) {
      throw publicDatabaseError(previousError, "Não foi possível validar a foto de perfil.");
    }
    const { data: profile, error } = await db
      .from("profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", context.userId)
      .select("avatar_url, updated_at")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a foto de perfil.");
    if (!profile) throw new Error("Perfil não encontrado.");
    const previousPath = previous?.avatar_url
      ? avatarStoragePathFromUrl(previous.avatar_url)
      : null;
    if (
      previousPath &&
      previousPath !== data.storagePath &&
      previousPath.startsWith(`${context.userId}/`)
    ) {
      await db.storage.from("avatars").remove([previousPath]);
    }
    return profile;
  });

export const signProfileAvatar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => signProfileAvatarInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const storagePath = avatarStoragePathFromUrl(data.avatarUrl);
    if (!storagePath) return { url: null };
    const ownerId = storagePath.split("/", 1)[0];
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    const { data: profile, error } = await db
      .from("profiles")
      .select("avatar_url")
      .eq("id", ownerId)
      .eq("school_id", membership.schoolId)
      .eq("avatar_url", data.avatarUrl)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível abrir a foto de perfil.");
    if (!profile) return { url: null };
    const signed = await db.storage.from("avatars").createSignedUrl(storagePath, 120);
    return { url: signed.data?.signedUrl ?? null };
  });

export const uploadCurrentProfileAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        fileName: z.string(),
        contentType: z.string(),
        base64: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await loadSgaAdminClient();
    const extension = data.fileName.split(".").pop()?.toLowerCase() || "jpg";
    const storagePath = `${context.userId}/avatar-${Date.now()}.${extension}`;
    const buffer = Buffer.from(data.base64, "base64");

    const { error: uploadError } = await db.storage.from("avatars").upload(storagePath, buffer, {
      contentType: data.contentType,
      upsert: true,
      cacheControl: "3600",
    });

    if (uploadError) {
      throw publicDatabaseError(
        uploadError,
        "Não foi possível carregar a imagem para o armazenamento.",
      );
    }

    const avatarUrl = `${AVATAR_REFERENCE_PREFIX}${storagePath}`;
    const { data: previous } = await db
      .from("profiles")
      .select("avatar_url")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: profile, error: updateError } = await db
      .from("profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", context.userId)
      .select("avatar_url, updated_at")
      .single();

    if (updateError) {
      throw publicDatabaseError(updateError, "Não foi possível actualizar o perfil.");
    }

    const previousPath = previous?.avatar_url
      ? avatarStoragePathFromUrl(previous.avatar_url)
      : null;
    if (
      previousPath &&
      previousPath !== storagePath &&
      previousPath.startsWith(`${context.userId}/`)
    ) {
      await db.storage.from("avatars").remove([previousPath]);
    }

    return profile;
  });
