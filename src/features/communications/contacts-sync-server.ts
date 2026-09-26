import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, requireSgaWriterForWrite } from "@/integrations/supabase/sga-admin";
import { ResendContactsClient } from "@/features/integrations/resend-contacts-client";

export const syncSchoolContactsToResendFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    // 1. Obter nome da escola para associar ou criar a audiência
    const { data: school } = await db
      .from("schools")
      .select("name")
      .eq("id", membership.schoolId)
      .single();

    const schoolName = school?.name || "Escola SIGA";
    // A conta Resend é da plataforma, partilhada por todas as escolas. Pelo nome
    // só, duas escolas com o mesmo nome partilhavam a audiência e os contactos
    // misturavam-se. O id da escola torna-a única.
    const audienceTitle = `${schoolName} — SIGA · ${membership.schoolId.slice(0, 8)}`;

    let targetAudienceId: string | null = null;
    try {
      const audiences = await ResendContactsClient.listAudiences();
      const existing = audiences.find((a) => a.name.toLowerCase() === audienceTitle.toLowerCase());
      if (existing) {
        targetAudienceId = existing.id;
      } else {
        const created = await ResendContactsClient.createAudience(audienceTitle);
        targetAudienceId = created.id;
      }
    } catch (err) {
      console.error("[contacts-sync] audiência Resend:", err);
      return {
        success: false,
        message: "Não foi possível preparar a lista de contactos no serviço de e-mail.",
        syncedCount: 0,
      };
    }

    if (!targetAudienceId) {
      return {
        success: false,
        message: "Audiência de destino não pôde ser determinada.",
        syncedCount: 0,
      };
    }

    // 2. Carrega membros ativos da escola
    const { data: memberships } = await db
      .from("school_memberships")
      .select("user_id")
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .limit(200);

    // Quem desligou os comunicados nesta escola fica de fora.
    const { data: optedOut } = await db
      .from("user_communication_preferences")
      .select("user_id")
      .eq("school_id", membership.schoolId)
      .eq("announcements_enabled", false);
    const excluded = new Set((optedOut ?? []).map((row) => String(row.user_id)));
    const userIds = (memberships ?? [])
      .map((m) => m.user_id)
      .filter((id): id is string => Boolean(id) && !excluded.has(String(id)));
    if (!userIds.length) {
      return {
        success: true,
        message: "Nenhum membro ativo encontrado para sincronizar.",
        syncedCount: 0,
      };
    }

    const { data: profiles } = await db
      // `profiles` não tem coluna `email` — o e-mail vive em `people` (e em
      // `auth.users`). Com `email` no select, o PostgREST recusava a consulta
      // inteira e o resultado vinha vazio, indistinguível de «não há contactos».
      .from("people")
      .select("email, full_name")
      .eq("school_id", membership.schoolId)
      .in("user_id", userIds)
      .limit(200);

    let syncedCount = 0;
    const errors: string[] = [];

    for (const p of profiles ?? []) {
      const email = String(p.email ?? "").trim();
      if (!email || !email.includes("@")) continue;

      const parts = String(p.full_name ?? "")
        .trim()
        .split(" ");
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || undefined;

      try {
        await ResendContactsClient.createContact({
          audienceId: targetAudienceId,
          email,
          firstName,
          lastName,
        });
        syncedCount += 1;
      } catch (e) {
        console.error("[contacts-sync] contacto:", e);
        errors.push(email);
      }
    }

    return {
      success: true,
      message: `Sincronizados ${syncedCount} contacto(s) na audiência "${audienceTitle}".`,
      syncedCount,
      partialErrors: errors.length ? errors.slice(0, 5) : undefined,
    };
  });
