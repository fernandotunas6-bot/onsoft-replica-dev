import { useQuery } from "@tanstack/react-query";
import { School } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listMyTeachingSchools, MEMBERSHIP_STATUS_LABEL } from "@/features/hr/teacher-schools";
import { PortalEmpty, PortalList, PortalLoading, PortalSection } from "../portals/portal-ui";

/**
 * Turmas do professor em todas as escolas onde tem vínculo de Professor. Só aparece
 * com mais de uma escola. Alunos, notas e chamadas abrem-se na escola activa: o botão
 * troca de escola pelo mesmo caminho do seletor (`setActiveSchoolId`).
 */
export function TeacherSchoolsCard() {
  const currentUser = useCurrentAccount();
  const query = useQuery({
    queryKey: ["teacher", "schools"],
    queryFn: () => listMyTeachingSchools(),
    staleTime: 5 * 60_000,
  });
  const schools = query.data ?? [];
  if (!query.isLoading && schools.length < 2) return null;

  return (
    <PortalSection title="As minhas escolas" icon={School}>
      {query.isLoading ? (
        <PortalLoading label="A carregar as escolas…" />
      ) : (
        <PortalList>
          {schools.map((school) => {
            const active = school.schoolId === currentUser.schoolId;
            return (
              <li key={school.schoolId} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">{school.schoolName}</p>
                    {active ? (
                      <StatusBadge status="active" label="Escola activa" size="sm" />
                    ) : null}
                    {!school.approved ? (
                      <StatusBadge
                        status={school.membershipStatus}
                        label={MEMBERSHIP_STATUS_LABEL[school.membershipStatus]}
                        size="sm"
                      />
                    ) : null}
                  </div>
                  {!active && school.approved ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        currentUser.setActiveSchoolId(school.schoolId);
                        toast.success("Escola alterada", {
                          description: `A mostrar dados de ${school.schoolName}.`,
                        });
                      }}
                    >
                      Abrir esta escola
                    </Button>
                  ) : null}
                </div>
                {!school.approved ? (
                  <p className="text-xs text-muted-foreground">
                    As turmas desta escola aparecem quando a direcção aprovar o vínculo.
                  </p>
                ) : school.classes.length === 0 ? (
                  <PortalEmpty>Sem turmas atribuídas nesta escola.</PortalEmpty>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {school.classes.map((group) => (
                      <li
                        key={group.id}
                        className="rounded-md border bg-secondary/30 px-2 py-1 text-xs"
                      >
                        {group.name}
                        <span className="text-muted-foreground"> · {group.students} alunos</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </PortalList>
      )}
    </PortalSection>
  );
}
