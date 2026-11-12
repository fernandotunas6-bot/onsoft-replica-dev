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
    if (!schoolId) return;
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
          <h3 className="pb-2 text-[12px] font-medium text-muted-foreground">Escola</h3>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {(currentUser.schools.length
              ? currentUser.schools
              : currentUser.schoolName
                ? [
                    {
                      membershipId: "current",
                      schoolId: currentUser.schoolId ?? "",
                      schoolName: currentUser.schoolName,
                      roleName: currentUser.role,
                      status: "active",
                    },
                  ]
                : []
            ).map((school) => {
              const active = Boolean(school.schoolId) && school.schoolId === currentUser.schoolId;
              const selectable =
                Boolean(school.schoolId) && !("isActive" in school && school.isActive === false);
              return (
                <li key={school.membershipId} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    disabled={!selectable}
                    onClick={() => switchSchool(school.schoolId, school.schoolName)}
                    className="flex min-h-[64px] w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span
                      className={cn(
                        "inline-flex size-[36px] shrink-0 items-center justify-center rounded-lg",
                        active
                          ? "bg-primary-soft text-primary-strong"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      <School className="size-[20px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[14px] font-medium leading-[20px]">
                        {school.schoolName}
                      </span>
                      <span className="mt-1 block break-words text-[12px] leading-[20px] text-muted-foreground">
                        {school.roleName}
                      </span>
                      {school.status && school.status !== "active" ? (
                        <span className="mt-2 block">
                          <StatusBadge status={school.status} size="sm" />
                        </span>
                      ) : null}
                    </span>
                    {active ? (
                      <Check className="size-[20px] shrink-0 text-primary" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {currentUser.schools.length <= 1 ? (
            <p className="mt-2 px-1 text-[12px] leading-[20px] text-muted-foreground">
              Pertence a uma só escola. Vínculos novos aparecem aqui depois de a secretaria os
              validar.
            </p>
          ) : null}
        </section>

        {yearOptions.length ? (
          <section>
            <h3 className="pb-2 text-[12px] font-medium text-muted-foreground">Ano lectivo</h3>
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
                    "touch-feedback inline-flex min-h-[44px] max-w-full items-center whitespace-normal break-words rounded-xl border px-3 py-2 text-left text-[14px] font-medium leading-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
            <h3 className="pb-2 text-[12px] font-medium text-muted-foreground">Período</h3>
            <div className="flex flex-wrap gap-2">
              {terms.map((term) => (
                <button
                  key={term.id}
                  type="button"
                  aria-pressed={term.id === selectedTermId}
                  onClick={() => setSelectedTermId(term.id)}
                  className={cn(
                    "touch-feedback inline-flex min-h-[44px] max-w-full items-center whitespace-normal break-words rounded-xl border px-3 py-2 text-left text-[14px] font-medium leading-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
