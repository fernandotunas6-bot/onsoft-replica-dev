import * as React from "react";
import { Check, School } from "lucide-react";
import { toast } from "@/lib/toast";

import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { BottomSheet, BottomSheetBody, BottomSheetHeader } from "./BottomSheet";

/**
 * Seletor de escola, ano e período (§11–§12).
 *
 * Num sistema multi-escola, a escola activa tem de ser inequívoca: é o que
 * decide de quem são os alunos, as notas e os valores no ecrã. No telemóvel não
 * cabe no topo em texto, por isso o topo mostra o nome e esta folha mostra o
 * resto — função no vínculo, estado, e as outras escolas a que o utilizador
 * pertence.
 *
 * A troca passa por `setActiveSchoolId`, o mesmo caminho do desktop: é ele que
 * volta a buscar o contexto (permissões, ano lectivo, dados) em vez de trocar
 * só o rótulo e deixar dados de outra escola no ecrã.
 */
export function SchoolSwitcherSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentUser = useCurrentAccount();
  const {
    yearOptions,
    selectedYearId,
    setSelectedYearId,
    activeYear,
    terms,
    selectedTermId,
    setSelectedTermId,
  } = useSchoolSettings();

  const switchSchool = (schoolId: string, schoolName: string) => {
    if (schoolId === currentUser.schoolId) {
      onOpenChange(false);
      return;
    }
    currentUser.setActiveSchoolId(schoolId);
    onOpenChange(false);
    toast.success("Escola alterada", { description: `A mostrar dados de ${schoolName}.` });
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetHeader
        title="Contexto"
        description="Escola, ano lectivo e período em uso"
        onClose={() => onOpenChange(false)}
      />
      <BottomSheetBody className="space-y-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <section>
          <h3 className="pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Escola
          </h3>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {(currentUser.schools.length
              ? currentUser.schools
              : currentUser.schoolName
                ? [
                    {
                      membershipId: "current",
                      schoolId: currentUser.schoolId ?? "current",
                      schoolName: currentUser.schoolName,
                      roleName: currentUser.role,
                      status: "active",
                    },
                  ]
                : []
            ).map((school) => {
              const active = school.schoolId === currentUser.schoolId;
              return (
                <li key={school.membershipId} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => switchSchool(school.schoolId, school.schoolName)}
                    className="flex min-h-[var(--siga-control-lg)] w-full items-center gap-3 px-3 py-2.5 text-left active:bg-secondary"
                  >
                    <span
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
                        active
                          ? "bg-primary-soft text-primary-strong"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      <School className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {school.schoolName}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {school.roleName}
                      </span>
                    </span>
                    {school.status && school.status !== "active" ? (
                      <StatusBadge status={school.status} size="sm" />
                    ) : null}
                    {active ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {currentUser.schools.length <= 1 ? (
            <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
              Pertence a uma só escola. Vínculos novos aparecem aqui depois de a secretaria os
              validar.
            </p>
          ) : null}
        </section>

        {yearOptions.length ? (
          <section>
            <h3 className="pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Ano lectivo
            </h3>
            <div className="flex flex-wrap gap-2">
              {yearOptions.map((year) => (
                <button
                  key={year.id}
                  type="button"
                  aria-pressed={year.id === selectedYearId}
                  onClick={() => {
                    if (year.id === "fallback") return;
                    setSelectedYearId(year.id);
                  }}
                  className={cn(
                    "touch-feedback inline-flex min-h-[44px] items-center rounded-lg border px-3 text-[14px] font-medium",
                    year.id === selectedYearId
                      ? "border-primary/50 bg-primary-soft text-primary-strong"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {year.label}
                  {year.id === activeYear?.id ? " · actual" : ""}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {terms.length ? (
          <section>
            <h3 className="pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Período
            </h3>
            <div className="flex flex-wrap gap-2">
              {terms.map((term) => (
                <button
                  key={term.id}
                  type="button"
                  aria-pressed={term.id === selectedTermId}
                  onClick={() => setSelectedTermId(term.id)}
                  className={cn(
                    "touch-feedback inline-flex min-h-[44px] items-center rounded-lg border px-3 text-[14px] font-medium",
                    term.id === selectedTermId
                      ? "border-primary/50 bg-primary-soft text-primary-strong"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {term.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </BottomSheetBody>
    </BottomSheet>
  );
}
