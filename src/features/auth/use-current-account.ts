import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/components/auth/AuthGate";
import { getCurrentAccountContext } from "@/features/auth/server";
import type { ApplicationRole } from "@/features/auth/access-policy";
import type { UserSchoolMembershipItem } from "@/integrations/supabase/sga";
import {
  ACTIVE_SCHOOL_CHANGED_EVENT,
  isActiveSchoolUnavailable,
  readStoredActiveSchool,
  rememberActiveSchool,
} from "@/features/auth/active-school";

/**
 * Identidade estável para "sem grants".
 *
 * `profile.data?.grants ?? {}` criava um objecto novo em CADA render enquanto a
 * query de conta não resolvesse (ou se a resposta não trouxesse grants). Quem
 * consome isto como dependência de `useMemo`/`useEffect` — a `AppSidebar`
 * fá-lo — via a dependência mudar sempre e reentrava em ciclo de render.
 */
const NO_GRANTS: Record<string, string> = Object.freeze({});

const ACTIVE_ROLE_KEY = "siga:active-role";
const ACTIVE_STUDENT_KEY = "siga:active-student-id";

export function useCurrentAccount() {
  const session = useAuthSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const [activeSchoolIdState, setActiveSchoolIdState] = useState<string | null>(() =>
    readStoredActiveSchool(),
  );

  // O cookie é a fonte que o servidor lê; garante-se que reflecte o que ficou
  // guardado, mesmo em sessões abertas antes de o cookie existir.
  useEffect(() => {
    rememberActiveSchool(activeSchoolIdState);
  }, [activeSchoolIdState]);

  const profile = useQuery({
    queryKey: ["auth", "account-context", userId ?? "anon", activeSchoolIdState ?? "default"],
    enabled: Boolean(userId),
    queryFn: async () => {
      try {
        return await getCurrentAccountContext({
          data: { preferredSchoolId: activeSchoolIdState || undefined },
        });
      } catch (error) {
        // A escola guardada deixou de pertencer ao utilizador: limpa a selecção
        // em vez de o deixar preso num erro, e deixa o servidor voltar a decidir.
        if (isActiveSchoolUnavailable(error) && activeSchoolIdState) {
          rememberActiveSchool(null);
          setActiveSchoolIdState(null);
          return await getCurrentAccountContext({ data: { preferredSchoolId: undefined } });
        }
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
  const firstName = profile.data?.first_name || null;
  const lastName = profile.data?.last_name || null;
  const primaryRole = (profile.data?.cargo as ApplicationRole) || "Utilizador";
  const availableRoles = useMemo(
    () => (profile.data?.roles as ApplicationRole[]) ?? [primaryRole],
    [profile.data?.roles, primaryRole],
  );

  const schools: UserSchoolMembershipItem[] = profile.data?.schools ?? [];
  const currentSchoolId = profile.data?.school_id ?? null;
  const currentSchoolName = profile.data?.school_name ?? null;
  const currentSchoolSlug = profile.data?.school_slug ?? null;

  const activeSchool =
    schools.find((s) => s.schoolId === currentSchoolId) ??
    (schools.length > 0 ? schools[0] : null) ??
    null;

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

  const setActiveSchoolId = (newSchoolId: string | null) => {
    const changed = newSchoolId !== (activeSchoolIdState ?? currentSchoolId);
    setActiveSchoolIdState(newSchoolId);
    // Grava o cookie antes de recarregar: os pedidos que se seguem já têm de
    // sair com a escola nova, senão recarregavam dados da escola anterior.
    rememberActiveSchool(newSchoolId);
    if (!changed) return;
    // As chaves dos dados não levam a escola (["pedagogical-workspace"],
    // ["finance", "invoices"], …): até 2026-10-05 só o contexto da conta era
    // invalidado, e o painel, as turmas ou as faturas da escola anterior ficavam
    // no ecrã (e a servir de base a gravações) até o staleTime expirar. Descarta-se
    // tudo o que é da escola e volta-se a pedir o que está no ecrã; a sessão
    // (["auth", …]) fica.
    void queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
    window.dispatchEvent(new Event(ACTIVE_SCHOOL_CHANGED_EVENT));
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
    firstName,
    lastName,
    phone,
    role: activeRole,
    primaryRole,
    roles: availableRoles,
    setActiveRole,
    avatarUrl,
    initials,
    grants: profile.data?.grants ?? NO_GRANTS,
    schoolId: currentSchoolId,
    schoolName: currentSchoolName,
    schoolSlug: currentSchoolSlug,
    schools,
    activeSchool,
    setActiveSchoolId,
    linkedEntities,
    activeStudentId,
    activeStudent,
    setActiveStudentId,
    profile,
  };
}
