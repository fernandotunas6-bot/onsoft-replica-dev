import { useQuery } from "@tanstack/react-query";
import { canWriteModule } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listTeachers } from "@/features/people/server";
import type { ContextLookup } from "./context-resolver";

type TeacherRow = { id: string; full_name: string };

const NO_TEACHERS: TeacherRow[] = [];

/**
 * Lookup do resolvedor a partir dos professores que o servidor devolveu à conta na
 * escola activa (`listTeachers` filtra pela escola da sessão). Um professor que não
 * esteja na lista, ou a lista ainda a carregar, é recusado; o nome vem destes dados,
 * nunca da URL.
 */
export function teacherContextLookup(
  teachers: readonly TeacherRow[],
  schoolId: string | null,
): ContextLookup {
  const byId = new Map(teachers.map((teacher) => [teacher.id, teacher] as const));
  return (candidate) => {
    if (!schoolId || candidate.type !== "teacher") return null;
    const teacher = byId.get(candidate.id);
    return teacher
      ? { type: "teacher", id: teacher.id, label: teacher.full_name || "Professor", schoolId }
      : null;
  };
}

/**
 * Os professores da escola para confirmar `?professor=` no horário. Só se pedem
 * quando a URL traz um professor e a conta gere o Pedagógico, os mesmos a quem o
 * horário mostra a vista por professor. No perfil não é preciso: a página declara
 * o professor que leu.
 */
export function useTeacherNavList({ enabled }: { enabled: boolean }): TeacherRow[] {
  const account = useCurrentAccount();
  const allowed = enabled && canWriteModule(account.role, "pedagogica", account.grants);
  const query = useQuery({
    queryKey: ["people", "teachers", "nav", account.schoolId, account.role],
    queryFn: () => listTeachers({ data: { status: "all", limit: 200 } }),
    enabled: allowed,
    retry: false,
  });
  return allowed ? (query.data ?? NO_TEACHERS) : NO_TEACHERS;
}
