import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriterForWrite } from "@/integrations/supabase/sga-admin";
import { deleteScheduleSlotInputSchema, updateScheduleSlotInputSchema } from "./schemas";

// Preserva integralmente a fachada académica já validada e substitui apenas
// as mutações de horário que precisam de transportar o actor humano para os
// guards de service_role no PostgreSQL.
export * from "./server-secure-legacy";
export * from "./academic-calendar";
export * from "./advanced-academic-server";

export const deleteScheduleSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteScheduleSlotInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const db = await loadSgaAdminClient();

    const { data: slot, error } = await db
      .from("timetable_slots")
      // `timetable_slots.status` só aceita active/cancelled/archived: o antigo
      // "inactive" era recusado pela base e o slot nunca era removido.
      .update({ status: "archived", updated_by: context.userId })
      .eq("id", data.slotId)
      .eq("school_id", membership.schoolId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) {
      throw publicDatabaseError(error, "Não foi possível remover o slot de horário.");
    }
    if (!slot) throw new Error("Slot não encontrado ou já inactivo.");
    return { id: slot.id };
  });
