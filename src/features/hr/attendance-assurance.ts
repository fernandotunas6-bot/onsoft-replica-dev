import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  assertModuleNotBlocked,
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  attendanceAssurancePolicySchema,
  DEFAULT_ATTENDANCE_ASSURANCE_POLICY,
} from "@/features/hr/schemas";

const ASSURANCE_ADMIN_ROLES = new Set(["Administrador", "Tesouraria"]);

async function requireAssuranceAdmin(userId: string, mode: "read" | "write" = "read") {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  if (!ASSURANCE_ADMIN_ROLES.has(membership.appRole)) {
    throw new Error("Sem permissão para configurar validação de presença.");
  }
  // Permissões por módulo (Nenhum/Leitura) também valem no RH.
  await assertModuleNotBlocked(membership.schoolId, userId, "financeiro", mode);
  return membership;
}

export { attendanceAssurancePolicySchema };

export const getAttendanceAssurancePolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireAssuranceAdmin(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_attendance_assurance_policies")
      .select(
        "enabled, center_latitude, center_longitude, geofence_radius_m, max_location_accuracy_m, require_location, store_exact_location, checkin_early_minutes, checkin_late_minutes, checkout_early_minutes, checkout_late_minutes, auto_approve_score, review_score",
      )
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (error) {
      if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? ""))
        return DEFAULT_ATTENDANCE_ASSURANCE_POLICY;
      throw publicDatabaseError(
        error,
        "Não foi possível carregar a política de confiança de presença.",
      );
    }
    if (!data) return DEFAULT_ATTENDANCE_ASSURANCE_POLICY;
    return {
      enabled: Boolean(data.enabled),
      centerLatitude: data.center_latitude == null ? null : Number(data.center_latitude),
      centerLongitude: data.center_longitude == null ? null : Number(data.center_longitude),
      geofenceRadiusM: Number(data.geofence_radius_m),
      maxLocationAccuracyM: Number(data.max_location_accuracy_m),
      requireLocation: Boolean(data.require_location),
      storeExactLocation: Boolean(data.store_exact_location),
      checkinEarlyMinutes: Number(data.checkin_early_minutes),
      checkinLateMinutes: Number(data.checkin_late_minutes),
      checkoutEarlyMinutes: Number(data.checkout_early_minutes),
      checkoutLateMinutes: Number(data.checkout_late_minutes),
      autoApproveScore: Number(data.auto_approve_score),
      reviewScore: Number(data.review_score),
    };
  });

export const saveAttendanceAssurancePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => attendanceAssurancePolicySchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireAssuranceAdmin(context.userId, "write");
    const db = await loadSgaAdminClient();
    const { error } = await db.from("hr_attendance_assurance_policies").upsert(
      {
        school_id: membership.schoolId,
        enabled: data.enabled,
        center_latitude: data.centerLatitude,
        center_longitude: data.centerLongitude,
        geofence_radius_m: data.geofenceRadiusM,
        max_location_accuracy_m: data.maxLocationAccuracyM,
        require_location: data.requireLocation,
        store_exact_location: data.storeExactLocation,
        checkin_early_minutes: data.checkinEarlyMinutes,
        checkin_late_minutes: data.checkinLateMinutes,
        checkout_early_minutes: data.checkoutEarlyMinutes,
        checkout_late_minutes: data.checkoutLateMinutes,
        auto_approve_score: data.autoApproveScore,
        review_score: data.reviewScore,
        updated_by: context.userId,
      },
      { onConflict: "school_id" },
    );
    if (error)
      throw publicDatabaseError(
        error,
        "Não foi possível guardar a política de confiança de presença.",
      );
    return { saved: true };
  });

export const listAttendanceAssuranceEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireAssuranceAdmin(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("hr_attendance_assurance_evidence")
      .select(
        "id, occurrence_id, purpose, captured_at, time_valid, location_supplied, location_accuracy_m, distance_from_school_m, inside_geofence, device_integrity_provider, device_integrity_valid, assurance_score, decision, reasons",
      )
      .eq("school_id", membership.schoolId)
      .order("captured_at", { ascending: false })
      .limit(100);
    if (error) {
      if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? ""))
        return [];
      throw publicDatabaseError(error, "Não foi possível carregar as evidências de presença.");
    }
    return data ?? [];
  });
