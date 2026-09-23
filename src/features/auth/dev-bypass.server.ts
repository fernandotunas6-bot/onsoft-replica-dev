import { createServerFn } from "@tanstack/react-start";
import { sgaClient } from "@/integrations/supabase/sga";

const DEMO_EMAIL = "dev@siga.local";
const DEMO_PASSWORD = "siga-dev-bypass-2026";
const DEMO_NAME = "Administrador Dev";

function bypassEnabled() {
  // Never allow this administrative shortcut outside an explicit local development environment.
  return process.env["NODE_ENV"] === "development" && process.env["AUTH_BYPASS"] === "true";
}

/**
 * Temporary local/dev helper for the SGA database: ensures a demo owner
 * membership exists and returns session tokens so AuthGate can skip login.
 */
export const ensureDevBypassSession = createServerFn({ method: "POST" }).handler(async () => {
  if (!bypassEnabled()) {
    throw new Error("Bypass de autenticação desactivado.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = sgaClient(supabaseAdmin);

  const { data: listed, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) throw new Error(listError.message || "Falha ao listar utilizadores Auth.");

  let user = listed.users.find((row) => row.email?.toLowerCase() === DEMO_EMAIL) ?? null;

  if (!user) {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: DEMO_NAME },
    });
    if (createError) throw new Error(createError.message || "Falha ao criar utilizador demo.");
    user = created.user;
  } else {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: DEMO_NAME,
      },
      ban_duration: "none",
    });
    if (updateError) throw new Error(updateError.message || "Falha ao actualizar utilizador demo.");
  }

  if (!user?.id) throw new Error("Utilizador demo sem identificador.");

  const { data: school, error: schoolError } = await db
    .from("schools")
    .select("id")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (schoolError) throw new Error(schoolError.message || "Falha ao carregar a escola SGA.");
  if (!school?.id) throw new Error("Nenhuma escola activa no banco SGA.");

  const { error: profileError } = await db.from("profiles").upsert(
    {
      id: user.id,
      full_name: DEMO_NAME,
      cargo: "Administrador",
    },
    { onConflict: "id" },
  );
  if (profileError) throw new Error(profileError.message || "Falha ao preparar o perfil demo.");

  let membershipId: string | null = null;
  const { data: existingMembership } = await db
    .from("school_memberships")
    .select("id")
    .eq("school_id", school.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership?.id) {
    membershipId = existingMembership.id;
    await db
      .from("school_memberships")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", membershipId);
  } else {
    const { data: inserted, error: membershipError } = await db
      .from("school_memberships")
      .insert({
        school_id: school.id,
        user_id: user.id,
        status: "active",
      })
      .select("id")
      .single();
    if (membershipError) {
      throw new Error(membershipError.message || "Falha ao criar membership SGA.");
    }
    membershipId = inserted.id;
  }

  const { data: ownerRole, error: roleError } = await db
    .from("roles")
    .select("id")
    .eq("school_id", school.id)
    .eq("code", "owner")
    .maybeSingle();
  if (roleError) throw new Error(roleError.message || "Falha ao ler papéis SGA.");
  if (!ownerRole?.id) throw new Error("Papel owner em falta na escola SGA.");

  const { data: existingRole } = await db
    .from("member_roles")
    .select("role_id")
    .eq("membership_id", membershipId)
    .eq("role_id", ownerRole.id)
    .maybeSingle();
  if (!existingRole) {
    const { error: memberRoleError } = await db.from("member_roles").insert({
      school_id: school.id,
      membership_id: membershipId,
      role_id: ownerRole.id,
    });
    if (memberRoleError) {
      throw new Error(memberRoleError.message || "Falha ao atribuir papel owner.");
    }
  }

  const { data: signedIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (signInError || !signedIn.session) {
    throw new Error(signInError?.message || "Falha ao abrir sessão demo.");
  }

  return {
    access_token: signedIn.session.access_token,
    refresh_token: signedIn.session.refresh_token,
    email: DEMO_EMAIL,
  };
});
