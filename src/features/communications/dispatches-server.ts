import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";

export const listDispatchesInputSchema = z.object({
  channel: z.enum(["email", "sms", "whatsapp", "all"]).default("all"),
  status: z
    .enum(["pending", "sent", "delivered", "opened", "clicked", "failed", "bounced", "all"])
    .default("all"),
  limit: z.number().int().min(1).max(100).default(50),
});

export type ListDispatchesInput = z.infer<typeof listDispatchesInputSchema>;

export const listSchoolCommunicationDispatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listDispatchesInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);

    const db = await loadSgaAdminClient();
    let query = db
      .from("communication_dispatches")
      .select(
        "id, channel, provider, external_message_id, sender_address, recipient, subject_or_template, status, error_details, created_at, updated_at",
      )
      .eq("school_id", membership.schoolId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.channel !== "all") {
      query = query.eq("channel", data.channel);
    }
    if (data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: rows, error } = await query;
    if (error) {
      throw publicDatabaseError(error, "Falha ao carregar despachos de comunicação.");
    }

    return (rows ?? []).map((row: Record<string, unknown>) => ({
      id: String(row["id"] ?? ""),
      channel: String(row["channel"] ?? "email"),
      provider: String(row["provider"] ?? ""),
      externalMessageId: row["external_message_id"] ? String(row["external_message_id"]) : null,
      senderAddress: String(row["sender_address"] ?? ""),
      recipient: String(row["recipient"] ?? ""),
      subjectOrTemplate: row["subject_or_template"] ? String(row["subject_or_template"]) : null,
      status: String(row["status"] ?? "pending"),
      errorDetails: row["error_details"] ? String(row["error_details"]) : null,
      createdAt: String(row["created_at"] ?? ""),
      updatedAt: String(row["updated_at"] ?? ""),
    }));
  });

export const getCommunicationDispatchStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);

    const db = await loadSgaAdminClient();
    const { data: rows } = await db
      .from("communication_dispatches")
      .select("channel, status")
      .eq("school_id", membership.schoolId);

    const counts = {
      total: rows?.length || 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      failed: 0,
      bounced: 0,
      byChannel: {
        email: 0,
        sms: 0,
        whatsapp: 0,
      },
    };

    for (const r of rows ?? []) {
      const status = String(r.status);
      const channel = String(r.channel) as "email" | "sms" | "whatsapp";

      if (status === "sent") counts.sent += 1;
      else if (status === "delivered") counts.delivered += 1;
      else if (status === "opened") counts.opened += 1;
      else if (status === "clicked") counts.clicked += 1;
      else if (status === "failed") counts.failed += 1;
      else if (status === "bounced") counts.bounced += 1;

      if (counts.byChannel[channel] !== undefined) {
        counts.byChannel[channel] += 1;
      }
    }

    return counts;
  });
