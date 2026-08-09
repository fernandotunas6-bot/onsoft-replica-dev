import { useState } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { PremiumModal } from "@/components/ui/premium-modal";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

/** Selector de instituição (multi-tenant) com modal premium. */
export function TenantSwitcher({ compact = false }: { compact?: boolean }) {
  const { tenant, tenants, setTenantId } = useTenant();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-left text-xs font-medium text-secondary-foreground transition-colors hover:border-primary/40",
          compact ? "w-full" : "max-w-[240px]",
        )}
        aria-label="Mudar de instituição"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
          {tenant.sigla}
        </span>
        <span className="min-w-0 flex-1 truncate">{tenant.nome}</span>
        <ChevronsUpDown className="size-3.5 opacity-60" />
      </button>

      <PremiumModal
        open={open}
        onOpenChange={setOpen}
        eyebrow="Multi-instituição"
        title="Mudar de instituição"
        description="Todos os dados, relatórios e permissões passam a ser filtrados pela instituição escolhida."
        icon={<Building2 className="size-5" />}
        footer={
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        }
      >
        <ul className="space-y-2">
          {tenants.map((item) => {
            const active = item.id === tenant.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setTenantId(item.id);
                    setOpen(false);
                    toast.success("Instituição activa alterada", { description: item.nome });
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg",
                    active ? "border-primary/60 bg-primary/5" : "border-border bg-card",
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                    {item.sigla}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.municipio} · {item.alunos.toLocaleString("pt-PT")} alunos · plano {item.plano}
                    </span>
                  </span>
                  {active ? <Check className="size-4 text-primary" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PremiumModal>
    </>
  );
}
