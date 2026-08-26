import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthSession } from "@/components/auth/AuthGate";
import { getCurrentAccountContext } from "@/features/auth/server";
import type { ApplicationRole } from "@/features/auth/access-policy";

const ACTIVE_ROLE_KEY = "siga:active-role";
const ACTIVE_STUDENT_KEY = "siga:active-student-id";

export function useCurrentAccount() {
  const session = useAuthSession();
  const userId = session?.user.id;
  const profile = useQuery({
    queryKey: ["auth", "account-context", userId ?? "anon"],
    enabled: Boolean(userId),
    queryFn: async () => {
      try {
        return await getCurrentAccountContext();
      } catch (error) {
        console.error("[useCurrentAccount]", error);
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: 2,
    retryDelay: (attempt) => 400 * (attempt + 1),
  });

  const email = session?.user.email ?? "Conta autenticada";
  const metaName =
    typeof session?.user.user_metadata?.["full_name"] === "string"
      ? session.user.user_metadata["full_name"]
      : null;
  const fallbackName = session?.user.email?.split("@")[0] || "Utilizador";
  const name = profile.data?.full_name || metaName || fallbackName;
  const primaryRole = (profile.data?.cargo as ApplicationRole) || "Utilizador";
  const availableRoles = (profile.data?.roles as ApplicationRole[]) ?? [primaryRole];

  const [activeRoleState, setActiveRoleState] = useState<ApplicationRole | null>(() => {
    if (typeof window === "undefined") return null;
    return (localStorage.getItem(ACTIVE_ROLE_KEY) as ApplicationRole) || null;
  });

  const [activeStudentIdState, setActiveStudentIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_STUDENT_KEY);
  });

  useEffect(() => {
    if (activeRoleState && !availableRoles.includes(activeRoleState)) {
      setActiveRoleState(primaryRole);
      localStorage.removeItem(ACTIVE_ROLE_KEY);
    }
  }, [availableRoles, activeRoleState, primaryRole]);

  const activeRole = activeRoleState || primaryRole;

  const setActiveRole = (newRole: ApplicationRole) => {
    setActiveRoleState(newRole);
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_ROLE_KEY, newRole);
    }
  };

  const linkedEntities = profile.data?.linkedEntities ?? {
    person_id: null,
    student_id: null,
    teacher_id: null,
    guardian_person_id: null,
    linked_students: [],
  };

  const activeStudentId =
    activeStudentIdState &&
    linkedEntities.linked_students.some((s) => s.student_id === activeStudentIdState)
      ? activeStudentIdState
      : (linkedEntities.linked_students[0]?.student_id ?? linkedEntities.student_id ?? null);

  const setActiveStudentId = (studentId: string) => {
    setActiveStudentIdState(studentId);
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_STUDENT_KEY, studentId);
    }
  };

  const activeStudent =
    linkedEntities.linked_students.find((s) => s.student_id === activeStudentId) ?? null;

  const avatarUrl = profile.data?.avatar_url || null;
  const phone = profile.data?.phone || null;
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  return {
    id: userId ?? "",
    email,
    name,
    phone,
    role: activeRole,
    primaryRole,
    roles: availableRoles,
    setActiveRole,
    avatarUrl,
    initials,
    grants: profile.data?.grants ?? {},
    schoolId: profile.data?.school_id ?? null,
    linkedEntities,
    activeStudentId,
    activeStudent,
    setActiveStudentId,
    profile,
  };
}
