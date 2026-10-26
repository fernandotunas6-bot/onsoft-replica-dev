import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { employmentState, employmentTypeLabel } from "@/features/hr/employee-detail";
import { listHrEmployees } from "@/features/hr/server";
import { moduleIcons } from "@/lib/app-icons";
import { publicErrorMessage } from "@/lib/public-error";

/**
 * Funcionários (SIGA Context Engine, contexto RH): os vínculos laborais da escola,
 * cada um com a sua ficha. Só leitura; a lista vem do servidor com o guarda de
 * leitura do RH (Administração e Tesouraria).
 */
export const Route = createFileRoute("/financeiro_/rh_/funcionarios")({
  head: () => ({ meta: [{ title: "Funcionários · RH · SIGA" }] }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const account = useCurrentAccount();
  const allowed = canAccessPath("/financeiro/rh", account.role, account.grants);
  const [query, setQuery] = useState("");
  const employees = useQuery({
    queryKey: ["hr", "employees"],
    queryFn: () => listHrEmployees(),
    enabled: allowed,
    retry: false,
  });

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt");
    const all = employees.data ?? [];
    if (!needle) return all;
    return all.filter((row) =>
      [row.personName, row.employeeNumber, row.position, row.department]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt").includes(needle)),
    );
  }, [employees.data, query]);

  let body: ReactNode;
  if (!allowed) {
    body = (
      <EmptyState
        title="Sem acesso ao RH"
        description="Os funcionários e a folha salarial são da Administração e da Tesouraria."
      />
    );
  } else if (employees.isLoading) {
    body = <p className="text-sm text-muted-foreground">A carregar os funcionários…</p>;
  } else if (employees.isError) {
    body = (
      <EmptyState
        title="Não foi possível carregar os funcionários"
        description={publicErrorMessage(employees.error, "Tente de novo daqui a pouco.")}
      />
    );
  } else if ((employees.data ?? []).length === 0) {
    body = (
      <EmptyState
        title="Ainda não há funcionários"
        description="Os vínculos laborais entram pela importação de funcionários ou pelo registo de professores."
        action={
          <Link to="/importar" className="text-sm font-semibold text-primary hover:underline">
            Importar funcionários
          </Link>
        }
      />
    );
  } else {
    body = (
      <section aria-label="Funcionários" className="space-y-3">
        <label className="block max-w-sm space-y-1 text-sm">
          <span className="text-xs font-semibold text-muted-foreground">Procurar</span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, número ou cargo"
            aria-label="Procurar funcionários"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          {rows.length === 1 ? "1 funcionário" : `${rows.length} funcionários`}
        </p>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum funcionário corresponde à procura.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-soft">
            {rows.map((row) => {
              const state = employmentState(row.status);
              return (
                <li key={row.id}>
                  <Link
                    to="/financeiro/rh/funcionarios/$employmentId"
                    params={{ employmentId: row.id }}
                    className="flex min-h-14 min-w-0 flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted/40"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold [overflow-wrap:anywhere]">
                        {row.personName}
                      </p>
                      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {[
                          row.employeeNumber ? `N.º ${row.employeeNumber}` : null,
                          row.position,
                          row.department,
                          employmentTypeLabel(row.employmentType),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <StatusBadge status={state.status} label={state.label} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças · RH"
          title="Funcionários"
          icon={moduleIcons.hr}
          description="Os vínculos laborais da escola. Abra um funcionário para ver o contrato, as faltas e os recibos de vencimento."
          crumbs={[
            { label: "Início", to: "/portal" },
            { label: "RH e Folha Salarial", to: "/financeiro/rh" },
            { label: "Funcionários" },
          ]}
        />
        {body}
      </div>
    </AppShell>
  );
}
