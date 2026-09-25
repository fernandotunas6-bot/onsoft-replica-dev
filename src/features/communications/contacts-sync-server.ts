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
    const audienceTitle = `${schoolName} — SIGA`;

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
    } catch (err: any) {
      return {
        success: false,
        message: `Falha ao gerir audiência no Resend: ${err.message}`,
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

    const userIds = (memberships ?? []).map((m) => m.user_id).filter(Boolean);
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
      } catch (e: any) {
        errors.push(`${email}: ${e.message}`);
      }
    }

    return {
      success: true,
      message: `Sincronizados ${syncedCount} contacto(s) na audiência "${audienceTitle}".`,
      syncedCount,
      partialErrors: errors.length ? errors.slice(0, 5) : undefined,
    };
  });
