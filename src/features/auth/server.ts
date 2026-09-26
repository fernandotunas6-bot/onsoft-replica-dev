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

export type LinkedStudentSummary = {
  student_id: string;
  full_name: string;
  registration_number: string | null;
  photo_url: string | null;
  class_group_id: string | null;
  class_name: string | null;
  course_name: string | null;
  attendance_rate: number | null;
  average_grade: number | null;
};

export type UserLinkedEntities = {
  person_id: string | null;
  student_id: string | null;
  teacher_id: string | null;
  guardian_person_id: string | null;
  linked_students: LinkedStudentSummary[];
};

export async function resolveUserLinkedEntities(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  userId: string,
  userEmail?: string | null,
): Promise<UserLinkedEntities> {
  let personId: string | null = null;

  try {
    const { data: personByUserId } = await db
      .from("people")
      .select("id")
      .eq("school_id", schoolId)
      .eq("user_id", userId)
      .maybeSingle();
    if (personByUserId) personId = personByUserId.id;
  } catch {
    /* ignore */
  }

  if (!personId && userEmail) {
    try {
      const { data: personByEmail } = await db
        .from("people")
        .select("id")
        .eq("school_id", schoolId)
        .eq("email", userEmail.trim().toLowerCase())
        .maybeSingle();
      if (personByEmail) personId = personByEmail.id;
    } catch {
      /* ignore */
    }
  }

  let studentId: string | null = null;
  try {
    let studentQuery = db.from("students").select("id").eq("school_id", schoolId);
    if (personId) {
      studentQuery = studentQuery.or(`person_id.eq.${personId},id.eq.${userId}`);
    } else {
      studentQuery = studentQuery.eq("id", userId);
    }
    const { data: studentRow } = await studentQuery.limit(1).maybeSingle();
    if (studentRow) studentId = studentRow.id;
  } catch {
    /* ignore */
  }

  let teacherId: string | null = null;
  try {
    let teacherQuery = db.from("teachers").select("id").eq("school_id", schoolId);
    if (personId) {
      teacherQuery = teacherQuery.or(`person_id.eq.${personId},user_id.eq.${userId}`);
    } else {
      teacherQuery = teacherQuery.eq("user_id", userId);
    }
    const { data: teacherRow } = await teacherQuery.limit(1).maybeSingle();
    if (teacherRow) teacherId = teacherRow.id;
  } catch {
    /* ignore */
  }

  let guardianPersonId: string | null = personId;
  const linkedStudents: LinkedStudentSummary[] = [];

  try {
    const { data: guardianLinks } = await db
      .from("student_guardians")
      .select("student_id, guardian_person_id")
      .eq("school_id", schoolId)
      .eq("guardian_person_id", personId ?? userId);

    if (guardianLinks && guardianLinks.length > 0) {
      guardianPersonId = guardianLinks[0]?.guardian_person_id ?? personId;
      const targetStudentIds = guardianLinks.map((l: { student_id: string }) => l.student_id);

      const { data: studentRows } = await db
        .from("students")
        .select("id, student_number, person_id")
        .in("id", targetStudentIds);

      const studentPersonIds = (studentRows ?? []).map((s: { person_id: string }) => s.person_id);
      const { loadPeopleLite } = await import("@/features/people/lookup");
      const peopleMap = await loadPeopleLite(db, schoolId, studentPersonIds);

      const { data: enrollments } = await db
        .from("enrollments")
        .select("id, student_id, class_group_id, attendance_rate, final_average")
        .eq("school_id", schoolId)
        .in("student_id", targetStudentIds)
        .eq("status", "active");

      const classGroupIds = [
        ...new Set(
          (enrollments ?? [])
            .map((e: { class_group_id: string | null }) => e.class_group_id)
            .filter(Boolean),
        ),
      ] as string[];

      const { data: classGroups } = classGroupIds.length
        ? await db.from("class_groups").select("id, name, grade_level_id").in("id", classGroupIds)
        : { data: [] as Array<{ id: string; name: string; grade_level_id: string | null }> };

      const classGroupMap = new Map(
        (classGroups ?? []).map((cg: { id: string; name: string }) => [cg.id, cg]),
      );
      type EnrollmentRow = {
        id: string;
        student_id: string;
        class_group_id: string | null;
        attendance_rate: number | null;
        final_average: number | null;
      };
      const enrollmentMap = new Map<string, EnrollmentRow>(
        (enrollments ?? []).map((e) => [
          (e as EnrollmentRow & { student_id: string }).student_id,
          e as EnrollmentRow,
        ]),
      );

      for (const st of studentRows ?? []) {
        const p = peopleMap.get(st.person_id);
        const en = enrollmentMap.get(st.id);
        const cg = en?.class_group_id ? classGroupMap.get(en.class_group_id) : null;
        linkedStudents.push({
          student_id: st.id,
          full_name: p?.full_name ?? "Educando",
          registration_number: st.student_number ?? null,
          photo_url: p?.photo_url ?? null,
          class_group_id: en?.class_group_id ?? null,
          class_name: cg?.name ?? null,
          course_name: null,
          attendance_rate: en?.attendance_rate ? Number(en.attendance_rate) : null,
          average_grade: en?.final_average ? Number(en.final_average) : null,
        });
      }
    }
  } catch {
    /* ignore */
  }

  return {
    person_id: personId,
    student_id: studentId,
    teacher_id: teacherId,
    guardian_person_id: guardianPersonId,
    linked_students: linkedStudents,
  };
}

import {
  listUserSchoolMemberships,
  type UserSchoolMembershipItem,
} from "@/integrations/supabase/sga";

export const getCurrentAccountContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") return { preferredSchoolId: undefined };
    const parsed = z.object({ preferredSchoolId: z.string().uuid().optional() }).safeParse(input);
    return parsed.success ? parsed.data : { preferredSchoolId: undefined };
  })
  .handler(async ({ data, context }) => {
    const db = await loadSgaAdminClient();
    const userSchools = await listUserSchoolMemberships(db, context.userId);
    const membership = await resolveSgaMembershipAdmin(context.userId, data?.preferredSchoolId);

    let profileRow: {
      first_name?: string | null;
      last_name?: string | null;
      full_name: string | null;
      avatar_url: string | null;
      phone: string | null;
      updated_at: string | null;
    } | null = null;
    try {
      const { data: pData } = await db
        .from("profiles")
        .select("first_name, last_name, full_name, avatar_url, phone, updated_at")
        .eq("id", context.userId)
        .maybeSingle();
      profileRow = pData;
    } catch {
      try {
        const { data: pData } = await db
          .from("profiles")
          .select("full_name, avatar_url, phone, updated_at")
          .eq("id", context.userId)
          .maybeSingle();
        profileRow = pData ? { ...pData, first_name: null, last_name: null } : null;
      } catch {
        try {
          const { data: pData } = await db
            .from("profiles")
            .select("full_name, avatar_url, updated_at")
            .eq("id", context.userId)
            .maybeSingle();
          profileRow = pData ? { ...pData, phone: null, first_name: null, last_name: null } : null;
        } catch {
          profileRow = null;
        }
      }
    }

    let metaName = "";
    let metaPhone = "";
    let emailName = "";
    let authEmail = "";
    // Só um e-mail confirmado serve para localizar o cadastro em `people`: um
    // e-mail por verificar pode ter sido escrito por qualquer pessoa.
    let authEmailVerified = false;
    try {
      const { data: uData } = await db.auth.admin.getUserById(context.userId);
      const authUser = uData.user;
      authEmail = authUser?.email ?? "";
      authEmailVerified = Boolean(authUser?.email_confirmed_at);
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
      authEmail = claimsEmail;
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
        } else {
          await db.from("profiles").upsert({
            id: context.userId,
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

    let linkedEntities: UserLinkedEntities = {
      person_id: null,
      student_id: null,
      teacher_id: null,
      guardian_person_id: null,
      linked_students: [],
    };
    if (membership?.schoolId) {
      linkedEntities = await resolveUserLinkedEntities(
        db,
        membership.schoolId,
        context.userId,
        authEmailVerified ? authEmail : null,
      );
    }

    const allAppRoles = [...(membership?.allAppRoles ?? [])];
    if (linkedEntities.student_id && !allAppRoles.includes("Aluno")) {
      allAppRoles.push("Aluno");
    }
    if (linkedEntities.teacher_id && !allAppRoles.includes("Professor")) {
      allAppRoles.push("Professor");
    }
    if (linkedEntities.linked_students.length > 0 && !allAppRoles.includes("Encarregado")) {
      allAppRoles.push("Encarregado");
    }

    const primaryCargo = membership?.appRole ?? ("Utilizador" as const);
    let resolvedCargo = primaryCargo;
    if (primaryCargo === "Utilizador" && allAppRoles.length > 0) {
      resolvedCargo = allAppRoles[0]!;
    }

    return {
      full_name: fullName || null,
      first_name: profileRow?.first_name || null,
      last_name: profileRow?.last_name || null,
      avatar_url: profileRow?.avatar_url ?? null,
      phone: profileRow?.phone?.trim() || metaPhone || null,
      updated_at: profileRow?.updated_at ?? null,
      school_id: membership?.schoolId ?? null,
      school_name: membership?.schoolName ?? null,
      school_slug: membership?.schoolSlug ?? null,
      role_code: membership?.roleCode ?? null,
      role_name: membership?.roleName ?? null,
      cargo: resolvedCargo,
      roles: allAppRoles,
      grants,
      linkedEntities,
      schools: userSchools,
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
    if (data.firstName !== undefined) {
      updatePayload["first_name"] = data.firstName ? data.firstName.trim() : null;
    }
    if (data.lastName !== undefined) {
      updatePayload["last_name"] = data.lastName ? data.lastName.trim() : null;
    }
    if (data.phone !== undefined) {
      const { normalizeAngolaPhone } = await import("@/lib/angola-phone");
      updatePayload["phone"] = data.phone ? normalizeAngolaPhone(data.phone) || null : null;
    }

    let row: {
      full_name: string | null;
      first_name?: string | null;
      last_name?: string | null;
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
        .select("full_name, first_name, last_name, avatar_url, phone, updated_at")
        .maybeSingle();
      if (error) throw error;
      row = updated;
    } catch (error) {
      const fallbackPayload = { full_name: data.fullName, updated_at: new Date().toISOString() };
      const { data: updated, error: retryError } = await db
        .from("profiles")
        .update(fallbackPayload)
        .eq("id", context.userId)
        .eq("updated_at", data.expectedUpdatedAt)
        .select("full_name, avatar_url, updated_at")
        .maybeSingle();
      if (retryError) {
        throw publicDatabaseError(retryError, "Não foi possível actualizar o perfil.");
      }
      row = updated ? { ...updated, phone: data.phone?.trim() || null } : null;
      if (error instanceof Error && /phone|column/i.test(error.message)) {
        // Coluna phone ou first_name ainda não aplicada no SGA — continua com metadados Auth.
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
      .eq("avatar_url", data.avatarUrl)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível abrir a foto de perfil.");
    if (!profile) return { url: null };
    // Só fotos de quem pertence à mesma escola (ou a própria).
    if (ownerId !== context.userId) {
      const { data: sameSchool } = await db
        .from("school_memberships")
        .select("id")
        .eq("school_id", membership.schoolId)
        .eq("user_id", ownerId)
        .limit(1)
        .maybeSingle();
      if (!sameSchool) return { url: null };
    }
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
