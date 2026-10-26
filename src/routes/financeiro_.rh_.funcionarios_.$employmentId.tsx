import { useMemo, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { formatIsoDay } from "@/features/finance/student-finance-summary";
import {
  ABSENCE_TYPE_LABELS,
  absenceDurationLabel,
  absenceState,
  competenceLabel,
  contractState,
  employmentState,
  employmentTypeLabel,
  payrollState,
  salaryTypeLabel,
  type HrEmployeeDetail,
} from "@/features/hr/employee-detail";
import { getHrEmployeeDetail } from "@/features/hr/employee-server";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { moduleIcons } from "@/lib/app-icons";
import { kwanza } from "@/lib/currency";
import { publicErrorMessage } from "@/lib/public-error";

/**
 * Ficha do funcionário (SIGA Context Engine, contexto RH): o vínculo laboral, os
 * contratos, as faltas e os recibos de vencimento, lidos no servidor na escola
 * activa (`getHrEmployeeDetail`). Só leitura: rever faltas, processar a folha e
 * alterar salários continuam nas páginas do RH, para onde a ficha leva.
 */
export const Route = createFileRoute("/financeiro_/rh_/funcionarios_/$employmentId")({
  head: () => ({ meta: [{ title: "Funcionário · RH · SIGA" }] }),
  component: EmployeePage,
});

function EmployeePage() {
  const { employmentId } = Route.useParams();
  const account = useCurrentAccount();
  const allowed = canAccessPath("/financeiro/rh", account.role, account.grants);
  const detailQuery = useQuery({
    queryKey: ["hr", "employee", employmentId],
    queryFn: () => getHrEmployeeDetail({ data: { employmentId } }),
    enabled: allowed,
    retry: false,
  });
  const employee = detailQuery.data ?? null;

  // O menu do funcionário (e o professor dele) só entra com a ficha lida do servidor.
  const focus = useMemo(
    () =>
      employee
        ? {
            type: "employee" as const,
            id: employee.id,
            label: employee.personName,
            schoolId: employee.schoolId,
            data: employee,
            ...(employee.teacherId ? { relations: { teacher: employee.teacherId } } : {}),
          }
        : null,
    [employee],
  );
  useDeclareEntityFocus(focus);

  let body: ReactNode;
  if (!allowed) {
    body = (
      <EmptyState
        title="Sem acesso ao RH"
        description="Os funcionários e a folha salarial são da Administração e da Tesouraria."
      />
    );
  } else if (detailQuery.isLoading) {
    body = <p className="text-sm text-muted-foreground">A abrir a ficha do funcionário…</p>;
  } else if (detailQuery.isError) {
    body = (
      <EmptyState
        title="Não foi possível abrir a ficha"
        description={publicErrorMessage(detailQuery.error, "Tente de novo daqui a pouco.")}
      />
    );
  } else if (!employee) {
    body = (
      <EmptyState
        title="Funcionário não encontrado"
        description="Este vínculo laboral não existe nesta escola."
        action={
          <Link
            to="/financeiro/rh/funcionarios"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Ver os funcionários
          </Link>
        }
      />
    );
  } else {
    body = (
      <EmployeeBody
        employee={employee}
        canOpenTeacher={
          Boolean(employee.teacherId) &&
          canAccessPath(`/professores/${employee.teacherId}`, account.role, account.grants)
        }
      />
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Finanças · RH"
          title={employee?.personName ?? "Funcionário"}
          icon={moduleIcons.hr}
          description="O vínculo laboral, os contratos, as faltas e os recibos de vencimento."
          crumbs={[
            { label: "Início", to: "/portal" },
            { label: "RH e Folha Salarial", to: "/financeiro/rh" },
            { label: "Funcionários", to: "/financeiro/rh/funcionarios" },
            { label: employee?.personName ?? "Funcionário" },
          ]}
        />
        {body}
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="text-sm font-semibold text-muted-foreground">
      {title} <span className="font-normal">· {count}</span>
    </h2>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function EmployeeBody({
  employee,
  canOpenTeacher,
}: {
  employee: HrEmployeeDetail;
  canOpenTeacher: boolean;
}) {
  const state = employmentState(employee.status);
  const pendingAbsences = employee.absences.filter(
    (absence) => absence.validationStatus === "pending",
  ).length;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section
        aria-label="Vínculo laboral"
        className="rounded-xl border border-border bg-card p-6 shadow-soft lg:col-span-2"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-base font-bold">Vínculo laboral</h2>
          <StatusBadge status={state.status} label={state.label} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Field label="Número">{employee.employeeNumber ?? "—"}</Field>
          <Field label="Cargo">{employee.position ?? "—"}</Field>
          <Field label="Departamento">{employee.department ?? "—"}</Field>
          <Field label="Tipo de vínculo">{employmentTypeLabel(employee.employmentType)}</Field>
          <Field label="Admissão">
            {employee.hireDate ? formatIsoDay(employee.hireDate) : "—"}
          </Field>
          {employee.terminationDate ? (
            <Field label="Cessação">{formatIsoDay(employee.terminationDate)}</Field>
          ) : null}
          <Field label="Horas por semana">
            {employee.weeklyHours == null ? "—" : `${employee.weeklyHours} h`}
          </Field>
          {employee.workLocation ? <Field label="Local">{employee.workLocation}</Field> : null}
        </dl>
      </section>

      <section
        aria-label="Professor"
        className="rounded-xl border border-border bg-card p-6 shadow-soft"
      >
        <h2 className="font-display text-base font-bold">Professor</h2>
        {employee.teacherId ? (
          <div className="mt-3 space-y-2 text-sm">
            <p>Esta pessoa também está registada como professor nesta escola.</p>
            {canOpenTeacher ? (
              <Link
                to="/professores/$teacherId"
                params={{ teacherId: employee.teacherId }}
                className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline sm:min-h-0"
              >
                Perfil do professor
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Sem registo de professor.</p>
        )}
      </section>

      <section aria-label="Contratos" className="space-y-3 lg:col-span-3">
        <SectionTitle title="Contratos" count={employee.contracts.length} />
        {employee.contracts.length === 0 ? (
          <Empty>Este funcionário ainda não tem contrato registado.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-soft">
            {employee.contracts.map((contract) => {
              const contractBadge = contractState(contract.status);
              return (
                <li
                  key={contract.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold [overflow-wrap:anywhere]">
                      {contract.number ? `Contrato ${contract.number}` : "Contrato"}
                      {` · ${salaryTypeLabel(contract.salaryType)}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {contract.startsOn
                        ? `Desde ${formatIsoDay(contract.startsOn)}`
                        : "Sem início"}
                      {contract.endsOn ? ` até ${formatIsoDay(contract.endsOn)}` : ""}
                      {contract.hourlyRateKz ? ` · ${kwanza(contract.hourlyRateKz)} por hora` : ""}
                      {contract.lessonHourRateKz
                        ? ` · ${kwanza(contract.lessonHourRateKz)} por tempo lectivo`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={contractBadge.status} label={contractBadge.label} />
                    <span className="text-sm font-semibold">{kwanza(contract.baseSalaryKz)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Para mudar o salário, use as{" "}
          <Link to="/financeiro/rh/salarios" className="font-semibold text-primary hover:underline">
            alterações salariais
          </Link>
          .
        </p>
      </section>

      <section aria-label="Faltas" className="space-y-3 lg:col-span-3">
        <SectionTitle title="Faltas" count={employee.absences.length} />
        {employee.absences.length === 0 ? (
          <Empty>Sem faltas registadas.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-soft">
            {employee.absences.map((absence) => {
              const absenceBadge = absenceState(absence.validationStatus);
              return (
                <li
                  key={absence.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold">
                      {absence.date ? formatIsoDay(absence.date) : "Sem data"}
                      {` · ${absenceDurationLabel(absence.durationMinutes)}`}
                    </p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {ABSENCE_TYPE_LABELS[absence.type] ?? absence.type}
                      {absence.reason ? ` · ${absence.reason}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={absenceBadge.status} label={absenceBadge.label} />
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {pendingAbsences > 0
            ? `${pendingAbsences === 1 ? "1 falta por rever" : `${pendingAbsences} faltas por rever`}: `
            : "Classificar e validar faltas faz-se em "}
          <Link to="/financeiro/rh/faltas" className="font-semibold text-primary hover:underline">
            {pendingAbsences > 0 ? "rever as faltas" : "faltas e assiduidade"}
          </Link>
          .
        </p>
      </section>

      <section aria-label="Recibos de vencimento" className="space-y-3 lg:col-span-3">
        <SectionTitle title="Recibos de vencimento" count={employee.payslips.length} />
        {employee.payslips.length === 0 ? (
          <Empty>Este funcionário ainda não entrou numa folha salarial.</Empty>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-soft">
            {employee.payslips.map((payslip) => {
              const runBadge = payrollState(payslip.runStatus);
              return (
                <li
                  key={payslip.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold">
                      {competenceLabel(payslip.competenceYear, payslip.competenceMonth)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Bruto {kwanza(payslip.grossKz)} · Descontos {kwanza(payslip.deductionsKz)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={runBadge.status} label={runBadge.label} />
                    <span className="text-sm font-semibold">{kwanza(payslip.netKz)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          As folhas processam-se e aprovam-se na{" "}
          <Link to="/financeiro/rh/folha" className="font-semibold text-primary hover:underline">
            folha salarial
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
