import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Check, PlusCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { listMyAdministeredSchools, type MySchoolSummary } from "@/features/saas/my-schools-server";
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/minhas-escolas")({
  head: () => ({
    meta: [
      { title: "As minhas escolas · SIGA Plus" },
      {
        name: "description",
        content: "Todas as escolas que administra, lado a lado, com os números de cada uma.",
      },
    ],
  }),
  component: MySchoolsPage,
});

const TENANT_STATUS: Record<string, { label: string; tone: keyof typeof toneClass }> = {
  trial: { label: "Período experimental", tone: "info" },
  active: { label: "Activa", tone: "success" },
  past_due: { label: "Pagamento em atraso", tone: "warning" },
  suspended: { label: "Suspensa", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "muted" },
};

function MySchoolsPage() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const fetchSchools = useServerFn(listMyAdministeredSchools);
  const query = useQuery({
    queryKey: ["saas", "my-schools", account.id],
    queryFn: () => fetchSchools() as Promise<MySchoolSummary[]>,
    staleTime: 60_000,
  });

  const open = (schoolId: string) => {
    if (schoolId !== account.schoolId) account.setActiveSchoolId(schoolId);
    void navigate({ to: "/" });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Conta"
          title="As minhas escolas"
          description="As escolas que administra, lado a lado. Os dados de cada uma continuam separados; ao abrir, passa a trabalhar nessa escola."
          icon={Building2}
          actions={
            <Button asChild variant="outline" size="sm">
              <a href={getCreateSchoolUrl()} target="_blank" rel="noreferrer">
                <PlusCircle className="size-4" /> Juntar outra escola
              </a>
            </Button>
          }
        />

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar as escolas…</p>
        ) : query.isError ? (
          <Panel title="Não foi possível carregar">
            <p className="text-sm text-muted-foreground">Tente novamente dentro de instantes.</p>
          </Panel>
        ) : !query.data?.length ? (
          <Panel title="Sem escolas para administrar">
            <p className="text-sm text-muted-foreground">
              Esta vista mostra as escolas onde é Administrador. Para acrescentar uma, use «Juntar
              outra escola» com o mesmo e-mail desta conta.
            </p>
          </Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.map((school) => (
              <SchoolCard
                key={school.schoolId}
                school={school}
                current={school.schoolId === account.schoolId}
                onOpen={() => open(school.schoolId)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SchoolCard({
  school,
  current,
  onOpen,
}: {
  school: MySchoolSummary;
  current: boolean;
  onOpen: () => void;
}) {
  const status = school.tenantStatus ? TENANT_STATUS[school.tenantStatus] : undefined;
  const numbers = [
    ["Alunos activos", school.students],
    ["Turmas", school.classGroups],
    ["Contas", school.staff],
  ] as const;
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-5",
        current && "border-primary/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base" title={school.name}>
            {school.name}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {school.roles.join(" · ")}
            {school.planName ? ` · ${school.planName}` : ""}
          </p>
        </div>
        {status ? (
          <span className={cn(badgeBase, "shrink-0", toneClass[status.tone])}>{status.label}</span>
        ) : null}
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {numbers.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/50 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg tabular-nums">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      {current ? (
        <p className="mt-auto flex items-center gap-1.5 text-sm text-primary">
          <Check className="size-4" /> Escola em uso
        </p>
      ) : (
        <Button className="mt-auto" variant="outline" onClick={onOpen}>
          Abrir esta escola
        </Button>
      )}
    </section>
  );
}
